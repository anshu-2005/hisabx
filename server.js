/**
 * HisabX — Production Personal Finance Server
 *
 * Upgraded with:
 * 1. Secure Authentication (Register, Login, Me, Logout, Password Reset)
 * 2. Multi-Tenant User Data Isolation & Persistence (ACID database store)
 * 3. Enhanced UPI Webhook Integration with User Account Attribution & Token Security
 * 4. Rate Limiting on Authentication Endpoints
 * 5. Full Backward Compatibility with Existing Frontend & Test Suites
 * 6. Vercel Serverless Deployment Ready
 */
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const urlModule = require('url');

const { db } = require('./database');
const {
  registerUser,
  loginUser,
  authenticateJwtToken,
  logoutUser,
  requestPasswordReset,
  completePasswordReset
} = require('./authService');

const PORT = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, 'hisabx_app.html');
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'hisabx_data') : path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'webhook_transactions.json');
const INITIAL_LEDGER_FILE = path.join(__dirname, 'data', 'webhook_transactions.json');
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB

// Webhook Secret from Environment Variable (Fallback / Single-User Mode)
const WEBHOOK_SECRET = process.env.UPI_WEBHOOK_SECRET || process.env.HISABX_WEBHOOK_SECRET || '';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('[Storage Error] Failed to create data directory:', err.message);
  }
}

// In-Memory Rate Limiting for Auth Endpoints (Max 15 attempts per IP per minute)
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 15, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    rateLimitMap.set(ip, record);
    return true;
  }
  record.count++;
  rateLimitMap.set(ip, record);
  return record.count <= limit;
}

// Durable Server-Side Store Functions (for global webhook compatibility)
function loadWebhookLedger() {
  try {
    if (IS_VERCEL && !fs.existsSync(LEDGER_FILE) && fs.existsSync(INITIAL_LEDGER_FILE)) {
      try {
        fs.copyFileSync(INITIAL_LEDGER_FILE, LEDGER_FILE);
      } catch (e) {}
    }

    if (!fs.existsSync(LEDGER_FILE)) {
      return { transactions: [], lastUpdated: new Date().toISOString() };
    }
    const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.transactions)) {
      return { transactions: [], lastUpdated: new Date().toISOString() };
    }
    return parsed;
  } catch (err) {
    console.error('[Storage Error] Failed to read ledger file, using in-memory fallback:', err.message);
    return { transactions: [], lastUpdated: new Date().toISOString() };
  }
}

function saveWebhookLedger(ledger) {
  try {
    ledger.lastUpdated = new Date().toISOString();
    const tempFile = `${LEDGER_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(ledger, null, 2), 'utf8');
    fs.renameSync(tempFile, LEDGER_FILE);
    return true;
  } catch (err) {
    console.error('[Storage Error] Failed to atomic-save ledger file:', err.message);
    return false;
  }
}

// Safe Logging Helpers (Never expose secrets, OTPs, or full account numbers)
function maskString(str, visibleChars = 4) {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= visibleChars) return '***';
  return str.substring(0, visibleChars) + '***';
}

function safeLog(level, message, meta = {}) {
  const ts = new Date().toISOString();
  const safeMeta = { ...meta };
  ['secret', 'otp', 'token', 'password', 'key', 'authorization'].forEach(k => {
    if (safeMeta[k]) safeMeta[k] = '[REDACTED]';
  });
  const metaStr = Object.keys(safeMeta).length ? ' ' + JSON.stringify(safeMeta) : '';
  console.log(`[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`);
}

// Categories Keyword Dictionary
const CATEGORY_MAP = {
  'Food & Groceries': ['swiggy', 'zomato', 'chai', 'coffee', 'grocery', 'mart', 'supermarket', 'blinkit', 'zepto', 'instamart', 'dhaba', 'restaurant', 'cafe', 'food', 'bakery', 'sweets', 'd-mart', 'spencer', 'dmart'],
  'Travel & Commute': ['petrol', 'hpcl', 'iocl', 'bpcl', 'fuel', 'diesel', 'uber', 'ola', 'rapido', 'metro', 'irctc', 'railway', 'toll', 'fastag', 'parking'],
  'Bills & Utilities': ['electricity', 'power', 'bescom', 'tneb', 'uppcl', 'mahadiscom', 'water', 'gas', 'indane', 'hp gas', 'bharat gas', 'wifi', 'broadband', 'airtel', 'jio', 'vi', 'vodafone', 'recharge', 'dth', 'tata play'],
  'Shopping & Apparel': ['amazon', 'flipkart', 'myntra', 'ajio', 'tata cliq', 'nykaa', 'meesho', 'zara', 'h&m', 'trends', 'apparel', 'retail'],
  'Healthcare & Pharma': ['pharma', 'pharmacy', 'apollo', '1mg', 'medplus', 'netmeds', 'hospital', 'clinic', 'doctor', 'lab', 'diagnostics'],
  'Entertainment': ['netflix', 'spotify', 'prime video', 'hotstar', 'cinema', 'pvr', 'inox', 'bookmyshow', 'game'],
  'Salary': ['salary', 'stipend', 'payroll', 'wages'],
  'Freelancing': ['freelance', 'consulting', 'client', 'retainer', 'upwork', 'fiverr', 'invoice']
};

// Strict Indian Bank SMS & UPI Parser
function parseBankSms(smsBody, sender, timestamp) {
  if (!smsBody || typeof smsBody !== 'string') {
    return { success: false, reason: 'Empty or missing SMS body' };
  }

  const raw = smsBody.trim();
  if (raw.length < 8) {
    return { success: false, reason: 'SMS text is too short to be a valid transaction' };
  }

  const lower = raw.toLowerCase();

  // 1. Strict rejection of non-transactional messages (OTPs, promotional, alerts)
  const isOtp = /\b(?:otp|one\s*time\s*password|verification\s*code|security\s*code)\b/i.test(lower) ||
                /\b(?:do\s*not\s*share|never\s*share)\b/i.test(lower);
  if (isOtp) {
    return { success: false, reason: 'Non-transactional SMS: OTP/security verification message' };
  }

  const isPromo = /\b(?:pre-approved|apply\s*now|click\s*here|congratulations|exclusive\s*offer|cashback\s*offer)\b/i.test(lower);
  if (isPromo && !lower.includes('debited') && !lower.includes('credited')) {
    return { success: false, reason: 'Non-transactional SMS: Promotional or marketing alert' };
  }

  // 2. Extract Monetary Amount
  const amtMatch = raw.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) || 
                   raw.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i);
  if (!amtMatch) {
    return { success: false, reason: 'No valid monetary amount found in SMS' };
  }

  const cleanAmountStr = amtMatch[1].replace(/,/g, '');
  const amount = parseFloat(cleanAmountStr);
  if (isNaN(amount) || amount <= 0) {
    return { success: false, reason: 'Parsed monetary amount is invalid or zero' };
  }

  // 3. Determine Debit vs Credit
  const isDebit = /\b(?:debited|paid|spent|sent\s*to|withdrawn|deducted|payment\s*to|transferred\s*to)\b/i.test(lower);
  const isCredit = /\b(?:credited|received|deposited|added\s*to|transferred\s*from|refunded)\b/i.test(lower);

  if (!isDebit && !isCredit) {
    return { success: false, reason: 'Transaction direction (debit or credit) could not be determined' };
  }

  const transactionType = isCredit ? 'INCOME' : 'EXPENSE';

  // 4. Extract UPI Reference Number (UTR / RRN / Txn ID)
  let referenceNumber = null;
  const refMatch = raw.match(/(?:upi\s*ref(?:\s*no)?|ref(?:\s*no)?|txn\s*(?:id|no)|utr|rrn)[\s:]*([A-Za-z0-9_-]{6,35})/i);
  if (refMatch) {
    referenceNumber = refMatch[1].trim();
  }

  // 5. Extract Counterparty / Merchant
  let merchant = 'UPI Counterparty';
  if (transactionType === 'EXPENSE') {
    const toMatch = raw.match(/(?:to|paid to|sent to|at)\s+(?:vpa\s+)?([A-Za-z0-9._@\s&-]{2,35}?)(?:\s+(?:on|via|ref|using|avbl|bal|a\/c|\.)|$)/i);
    if (toMatch && toMatch[1]) {
      const candidate = toMatch[1].trim().replace(/[.,;:]$/, '');
      if (candidate.length > 1 && !/^(upi|bank|your|an|the)$/i.test(candidate)) {
        merchant = candidate;
      }
    }
  } else {
    const fromMatch = raw.match(/(?:from|by|received from)\s+(?:vpa\s+)?([A-Za-z0-9._@\s&-]{2,35}?)(?:\s+(?:on|via|ref|using|avbl|bal|a\/c|\.)|$)/i);
    if (fromMatch && fromMatch[1]) {
      const candidate = fromMatch[1].trim().replace(/[.,;:]$/, '');
      if (candidate.length > 1 && !/^(upi|bank|your|an|the)$/i.test(candidate)) {
        merchant = candidate;
      }
    }
  }

  // 6. Category Auto-Assignment
  let category = transactionType === 'INCOME' ? 'Freelancing' : 'Other Expenses';
  const merchantLower = merchant.toLowerCase();
  for (const [catName, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => lower.includes(k) || merchantLower.includes(k))) {
      category = catName;
      break;
    }
  }

  // 7. Resolve Date and Time
  let dateStr = new Date().toISOString().split('T')[0];
  let timeStr = new Date().toTimeString().slice(0, 5);

  if (timestamp) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      dateStr = d.toISOString().split('T')[0];
      timeStr = d.toTimeString().slice(0, 5);
    }
  }

  const dateMatch = raw.match(/(\d{1,2})[-/](\d{1,2}|[A-Za-z]{3})[-/](\d{2,4})/);
  if (dateMatch) {
    try {
      const day = String(dateMatch[1]).padStart(2, '0');
      let month = dateMatch[2];
      let year = dateMatch[3];
      if (year.length === 2) year = '20' + year;
      
      const monthNames = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
      if (month.length === 3 && monthNames[month.toLowerCase()]) {
        month = monthNames[month.toLowerCase()];
      } else {
        month = String(month).padStart(2, '0');
      }
      const parsedDate = `${year}-${month}-${day}`;
      if (!isNaN(new Date(parsedDate).getTime())) {
        dateStr = parsedDate;
      }
    } catch (e) {
      // Keep dateStr fallback
    }
  }

  // 8. Generate safe fallback deduplication hash if no UPI ref is present
  const safeFallbackHash = crypto
    .createHash('sha256')
    .update(`${amount}|${transactionType}|${merchant.toLowerCase()}|${dateStr}|${(sender || '').toLowerCase()}`)
    .digest('hex')
    .substring(0, 16);

  const dedupKey = referenceNumber || `HASH-${safeFallbackHash}`;

  return {
    success: true,
    data: {
      transactionType,
      amount: Math.round(amount * 100) / 100,
      date: dateStr,
      time: timeStr,
      status: 'COMPLETED',
      category,
      paymentMethod: 'UPI',
      sourceAccountId: transactionType === 'EXPENSE' ? 'acc_upi' : undefined,
      destinationAccountId: transactionType === 'INCOME' ? 'acc_upi' : undefined,
      merchant,
      description: `${transactionType === 'INCOME' ? 'UPI Received from' : 'UPI Payment to'} ${merchant}`,
      referenceNumber,
      dedupKey,
      notes: `Auto-tracked via HisabX Webhook Bridge from ${maskString(sender || 'Bank SMS', 6)}`
    }
  };
}

// Multi-Tenant Webhook Authenticator (Supports User Webhook Token & Global Secret)
function authenticateWebhookRequest(req, parsedUrl) {
  // 1. Check for User-Specific Webhook Token in Query Parameter (?token=whsec_...)
  const queryToken = (parsedUrl.query && parsedUrl.query.token) ? String(parsedUrl.query.token).trim() : '';
  if (queryToken) {
    const user = db.findUserByWebhookSecret(queryToken);
    if (user) {
      return { authenticated: true, user, authType: 'user_token' };
    }
    return { authenticated: false, reason: 'Invalid user webhook token' };
  }

  // 2. Check for Token in Request Headers
  const rawHeader = req.headers['x-webhook-secret'] || req.headers['authorization'] || '';
  let providedToken = rawHeader.trim();
  if (providedToken.toLowerCase().startsWith('bearer ')) {
    providedToken = providedToken.slice(7).trim();
  }

  if (providedToken) {
    // Check if it matches a user's unique webhook secret
    const user = db.findUserByWebhookSecret(providedToken);
    if (user) {
      return { authenticated: true, user, authType: 'user_token' };
    }

    // Check if it matches the global UPI_WEBHOOK_SECRET
    if (WEBHOOK_SECRET) {
      try {
        const expectedBuf = Buffer.from(WEBHOOK_SECRET, 'utf8');
        const providedBuf = Buffer.from(providedToken, 'utf8');
        if (expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)) {
          return { authenticated: true, user: null, authType: 'global_secret' };
        }
      } catch (e) {}
    }

    return { authenticated: false, reason: 'Invalid webhook secret' };
  }

  // 3. Fallback: If WEBHOOK_SECRET is not configured in env, allow open local dev mode ONLY outside production
  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return { authenticated: false, reason: 'Global webhook secret is unconfigured and open dev mode is disabled in production' };
    }
    return { authenticated: true, user: null, authType: 'dev_open' };
  }

  return { authenticated: false, reason: 'Missing webhook secret or token' };
}

// Helper to send JSON responses
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Secret'
  });
  res.end(JSON.stringify(data));
}

// Helper to read JSON request body
function readJsonBody(req, maxSize = MAX_PAYLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let sizeExceeded = false;

    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxSize) {
        sizeExceeded = true;
        req.destroy();
      }
    });

    req.on('end', () => {
      if (sizeExceeded) {
        return reject({ status: 413, message: 'Payload too large (maximum 64KB allowed)' });
      }
      if (!body.trim()) {
        return resolve({});
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (e) {
        reject({ status: 400, message: 'Invalid JSON request payload' });
      }
    });

    req.on('error', err => reject({ status: 500, message: err.message }));
  });
}

// Request Handler Function
async function requestHandler(req, res) {
  // CORS Preflight Handling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = urlModule.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  // =========================================================================
  // ROUTE: GET /api/health
  // =========================================================================
  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      app: 'HisabX Fintech OS',
      version: '2.0.0',
      time: new Date().toISOString(),
      webhookConfigured: Boolean(WEBHOOK_SECRET),
      registeredUsersCount: db.data.users.length,
      persistence: 'durable-acid-store'
    });
  }

  // =========================================================================
  // AUTHENTICATION ROUTES
  // =========================================================================

  // POST /api/auth/register
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    if (!checkRateLimit(clientIp, 15, 60000)) {
      return sendJson(res, 429, { status: 'error', error: 'Too many registration requests. Please wait a minute.' });
    }
    try {
      const payload = await readJsonBody(req);
      const result = await registerUser(payload);
      if (!result.success) {
        return sendJson(res, result.status || 400, { status: 'error', error: result.error });
      }
      safeLog('info', 'New user registered', { email: maskString(result.user.email, 3) });
      return sendJson(res, 201, {
        status: 'success',
        message: 'Account created successfully',
        token: result.token,
        user: result.user
      });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // POST /api/auth/login
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    if (!checkRateLimit(clientIp, 20, 60000)) {
      return sendJson(res, 429, { status: 'error', error: 'Too many login attempts. Please wait a minute.' });
    }
    try {
      const payload = await readJsonBody(req);
      const result = await loginUser(payload);
      if (!result.success) {
        return sendJson(res, result.status || 401, { status: 'error', error: result.error });
      }
      safeLog('info', 'User logged in', { email: maskString(result.user.email, 3) });
      return sendJson(res, 200, {
        status: 'success',
        message: 'Login successful',
        token: result.token,
        user: result.user
      });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // GET /api/auth/me
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) {
      return sendJson(res, 401, { status: 'error', error: auth.reason });
    }
    return sendJson(res, 200, { status: 'success', user: auth.user });
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const auth = authenticateJwtToken(req);
    if (auth.authenticated && auth.token) {
      logoutUser(auth.token);
    }
    return sendJson(res, 200, { status: 'success', message: 'Logged out successfully' });
  }

  // POST /api/auth/forgot-password
  if (req.method === 'POST' && pathname === '/api/auth/forgot-password') {
    try {
      const payload = await readJsonBody(req);
      const result = requestPasswordReset(payload.email);
      return sendJson(res, 200, { status: 'success', ...result });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // POST /api/auth/reset-password
  if (req.method === 'POST' && pathname === '/api/auth/reset-password') {
    try {
      const payload = await readJsonBody(req);
      const result = await completePasswordReset(payload.token, payload.newPassword);
      if (!result.success) {
        return sendJson(res, result.status || 400, { status: 'error', error: result.error });
      }
      return sendJson(res, 200, { status: 'success', message: result.message });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // =========================================================================
  // MULTI-TENANT USER DATA ROUTES (Strictly Scoped to req.user.id)
  // =========================================================================

  // GET /api/user/data - Fetch Complete Scoped Ledger for Authenticated User
  if (req.method === 'GET' && pathname === '/api/user/data') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) {
      return sendJson(res, 401, { status: 'error', error: auth.reason });
    }
    const fullData = db.getFullUserData(auth.user.id);
    return sendJson(res, 200, { status: 'success', data: fullData });
  }

  // POST /api/user/sync - Synchronize / Migrate LocalStorage Data to Server
  if (req.method === 'POST' && pathname === '/api/user/sync') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) {
      return sendJson(res, 401, { status: 'error', error: auth.reason });
    }
    try {
      const payload = await readJsonBody(req);
      const importStats = db.importUserBatchData(auth.user.id, payload);
      const refreshedData = db.getFullUserData(auth.user.id);
      return sendJson(res, 200, {
        status: 'success',
        message: 'Data synchronized to secure cloud database',
        stats: importStats,
        data: refreshedData
      });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // POST /api/user/transactions - Create or Update Transaction for Authenticated User
  if (req.method === 'POST' && pathname === '/api/user/transactions') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) {
      return sendJson(res, 401, { status: 'error', error: auth.reason });
    }
    try {
      const payload = await readJsonBody(req);
      if (!payload.amount || isNaN(Number(payload.amount)) || Number(payload.amount) <= 0) {
        return sendJson(res, 400, { status: 'error', error: 'Valid monetary amount is required' });
      }
      if (!payload.transactionType) {
        return sendJson(res, 400, { status: 'error', error: 'Transaction type is required' });
      }

      let tx;
      if (payload.id && db.findTransactionById(auth.user.id, payload.id)) {
        tx = db.updateTransaction(auth.user.id, payload.id, payload);
      } else {
        tx = db.createTransaction(auth.user.id, payload);
      }
      return sendJson(res, 201, { status: 'success', transaction: tx });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // DELETE /api/user/transactions/:id - Delete Transaction (Strict Ownership Verification)
  if (req.method === 'DELETE' && pathname.startsWith('/api/user/transactions/')) {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) {
      return sendJson(res, 401, { status: 'error', error: auth.reason });
    }
    const txId = pathname.replace('/api/user/transactions/', '').trim();
    const deleted = db.deleteTransaction(auth.user.id, txId);
    if (!deleted) {
      return sendJson(res, 404, { status: 'error', error: 'Transaction not found or not owned by user' });
    }
    return sendJson(res, 200, { status: 'success', message: 'Transaction deleted successfully' });
  }

  // POST /api/user/debts - Save Debt
  if (req.method === 'POST' && pathname === '/api/user/debts') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    try {
      const payload = await readJsonBody(req);
      const debt = db.saveDebt(auth.user.id, payload);
      return sendJson(res, 200, { status: 'success', debt });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // POST /api/user/reminders - Save Reminder
  if (req.method === 'POST' && pathname === '/api/user/reminders') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    try {
      const payload = await readJsonBody(req);
      const reminder = db.saveReminder(auth.user.id, payload);
      return sendJson(res, 200, { status: 'success', reminder });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // =========================================================================
  // SAAS EXTENSIONS: SUBSCRIPTIONS, GROUPS & STATEMENT IMPORT
  // =========================================================================

  // GET /api/subscription/status - Get Current User Plan
  if (req.method === 'GET' && pathname === '/api/subscription/status') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    const sub = db.getSubscription(auth.user.id);
    return sendJson(res, 200, { status: 'success', subscription: sub });
  }

  // POST /api/subscription/upgrade - Upgrade User to Pro/Enterprise Tier
  if (req.method === 'POST' && pathname === '/api/subscription/upgrade') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    try {
      const payload = await readJsonBody(req);
      const sub = db.updateSubscription(auth.user.id, {
        plan: payload.plan || 'pro',
        durationMonths: payload.durationMonths || 12,
        paymentId: payload.paymentId || `pay_rzp_${Date.now()}`
      });
      safeLog('info', 'User upgraded subscription tier', { userId: auth.user.id, plan: sub.plan });
      return sendJson(res, 200, { status: 'success', message: `Upgraded to ${sub.name} successfully!`, subscription: sub });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // GET /api/groups - Get Groups for Splitwise
  if (req.method === 'GET' && pathname === '/api/groups') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    const groups = db.getGroups(auth.user.id);
    return sendJson(res, 200, { status: 'success', groups });
  }

  // POST /api/groups - Create New Group
  if (req.method === 'POST' && pathname === '/api/groups') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    try {
      const payload = await readJsonBody(req);
      const group = db.createGroup(auth.user.id, payload);
      return sendJson(res, 201, { status: 'success', group });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // POST /api/groups/:id/expenses - Add Expense to Group
  if (req.method === 'POST' && pathname.startsWith('/api/groups/') && pathname.endsWith('/expenses')) {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    try {
      const parts = pathname.split('/');
      const groupId = parts[3];
      const payload = await readJsonBody(req);
      const expense = db.addGroupExpense(auth.user.id, groupId, payload);
      return sendJson(res, 201, { status: 'success', expense });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // POST /api/statement/parse - Bank Statement Parser (CSV / Text / TSV)
  if (req.method === 'POST' && pathname === '/api/statement/parse') {
    const auth = authenticateJwtToken(req);
    if (!auth.authenticated) return sendJson(res, 401, { status: 'error', error: auth.reason });
    try {
      const payload = await readJsonBody(req);
      const rawText = payload.content || '';
      if (!rawText.trim()) {
        return sendJson(res, 400, { status: 'error', error: 'Statement content string is required' });
      }

      const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
      const parsedTransactions = [];
      let skippedCount = 0;

      lines.forEach((line, idx) => {
        // Skip header lines
        if (idx === 0 && (line.toLowerCase().includes('date') || line.toLowerCase().includes('narration') || line.toLowerCase().includes('amount'))) {
          return;
        }

        // CSV parsing / Delimiter split
        const cols = line.split(/[,\t;|]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 3) {
          skippedCount++;
          return;
        }

        // Search for amount
        let amount = 0;
        let isCredit = false;
        let isDebit = false;
        let description = 'Bank Entry';
        let dateStr = new Date().toISOString().split('T')[0];

        // Try to match date
        for (const col of cols) {
          const dMatch = col.match(/^(\d{1,2})[-/.](\d{1,2}|[A-Za-z]{3})[-/.](\d{2,4})$/);
          if (dMatch) {
            try {
              const d = new Date(col);
              if (!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];
            } catch (e) {}
            break;
          }
        }

        // Try to identify credit/debit & amount
        cols.forEach(col => {
          const num = parseFloat(col.replace(/,/g, ''));
          if (!isNaN(num) && num > 0) {
            if (num > amount) amount = num;
          }
          if (/cr|credit|deposit|inward/i.test(col)) isCredit = true;
          if (/dr|debit|withdrawal|outward/i.test(col)) isDebit = true;
        });

        // Identify description
        const candidateDesc = cols.find(c => c.length > 5 && isNaN(Number(c.replace(/,/g, ''))));
        if (candidateDesc) description = candidateDesc.substring(0, 60);

        if (amount > 0) {
          const txType = isCredit ? 'INCOME' : 'EXPENSE';
          let category = txType === 'INCOME' ? 'Salary & Inflows' : 'Bank Expense';
          
          for (const [catName, keywords] of Object.entries(CATEGORY_MAP)) {
            if (keywords.some(k => description.toLowerCase().includes(k))) {
              category = catName;
              break;
            }
          }

          parsedTransactions.push({
            id: `TX-STMT-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
            transactionType: txType,
            amount: Math.round(amount * 100) / 100,
            date: dateStr,
            description,
            category,
            paymentMethod: 'NET_BANKING',
            status: 'COMPLETED',
            notes: 'Imported via HisabX SaaS Statement Engine'
          });
        } else {
          skippedCount++;
        }
      });

      // If user requested commit, save directly into user's ledger
      if (payload.commit === true && parsedTransactions.length > 0) {
        parsedTransactions.forEach(tx => {
          db.createTransaction(auth.user.id, tx);
        });
      }

      return sendJson(res, 200, {
        status: 'success',
        totalParsed: parsedTransactions.length,
        skippedCount,
        committed: payload.commit === true,
        transactions: parsedTransactions
      });
    } catch (err) {
      return sendJson(res, err.status || 500, { status: 'error', error: err.message });
    }
  }

  // =========================================================================
  // ROUTE 1: POST /api/webhook/upi (or /v1/webhook/upi) - Webhook Ingestion
  // =========================================================================
  if (req.method === 'POST' && (pathname === '/api/webhook/upi' || pathname.includes('/webhook/upi') || pathname === '/api/webhook')) {
    // 1. Authenticate Request
    const authResult = authenticateWebhookRequest(req, parsedUrl);
    if (!authResult.authenticated) {
      safeLog('warn', 'Webhook unauthorized request rejected', { reason: authResult.reason });
      return sendJson(res, 401, {
        status: 'error',
        error: 'Unauthorized: Invalid or missing webhook secret',
        reason: authResult.reason,
        code: 'UNAUTHORIZED'
      });
    }

    // 2. Read Request Body with Strict Size Limit (64 KB)
    let body = '';
    let sizeExceeded = false;

    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_PAYLOAD_SIZE) {
        sizeExceeded = true;
        req.destroy();
      }
    });

    req.on('end', () => {
      if (sizeExceeded) {
        safeLog('warn', 'Webhook payload rejected: exceeded maximum allowed size');
        return sendJson(res, 413, {
          status: 'error',
          error: 'Payload too large (maximum 64KB allowed)',
          code: 'PAYLOAD_TOO_LARGE'
        });
      }

      // 3. Parse and Validate JSON Payload
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (err) {
        safeLog('warn', 'Webhook rejected: invalid JSON payload');
        return sendJson(res, 400, {
          status: 'error',
          error: 'Invalid JSON request body. Expected format: { "sender": string, "body": string, "timestamp"?: string }',
          code: 'INVALID_JSON'
        });
      }

      if (!payload || typeof payload !== 'object') {
        return sendJson(res, 400, {
          status: 'error',
          error: 'Invalid request body. Expected a JSON object.',
          code: 'BAD_REQUEST'
        });
      }

      const smsText = payload.body || payload.text || payload.message || payload.sms;
      const sender = payload.sender || payload.from || 'SMS_BRIDGE';
      const timestamp = payload.timestamp || payload.date || new Date().toISOString();

      if (!smsText || typeof smsText !== 'string' || !smsText.trim()) {
        return sendJson(res, 400, {
          status: 'error',
          error: 'Missing required field: "body" (SMS text string is required)',
          code: 'MISSING_BODY'
        });
      }

      // 4. Parse Bank SMS Text
      const parseResult = parseBankSms(smsText, sender, timestamp);
      if (!parseResult.success) {
        safeLog('info', 'Webhook SMS rejected: not a valid transaction', {
          sender: maskString(sender, 4),
          reason: parseResult.reason
        });
        return sendJson(res, 422, {
          status: 'rejected',
          error: 'Unrecognized or non-transactional SMS message',
          reason: parseResult.reason,
          code: 'UNRECOGNIZED_TRANSACTION'
        });
      }

      const txData = parseResult.data;

      // 5. Deduplication Check against Persistent Store
      const targetUserId = authResult.user ? authResult.user.id : null;

      // Deduplication in User Scoped DB if user authenticated
      if (targetUserId) {
        const isUserDuplicate = db.isDuplicateTransaction(targetUserId, txData.referenceNumber, txData.dedupKey);
        if (isUserDuplicate) {
          safeLog('info', 'Duplicate webhook transaction detected for user', {
            userId: targetUserId,
            ref: maskString(txData.referenceNumber || txData.dedupKey, 6)
          });
          return sendJson(res, 200, {
            status: 'duplicate',
            message: 'Transaction already recorded for your account (duplicate ignored)',
            referenceNumber: txData.referenceNumber,
            dedupKey: txData.dedupKey,
            code: 'DUPLICATE_IGNORED'
          });
        }
      }

      // Deduplication in Global Ledger
      const ledger = loadWebhookLedger();
      const isDuplicate = ledger.transactions.some(tx => {
        if (txData.referenceNumber && tx.referenceNumber && tx.referenceNumber === txData.referenceNumber) {
          return true;
        }
        return tx.dedupKey === txData.dedupKey;
      });

      if (isDuplicate) {
        safeLog('info', 'Duplicate webhook transaction detected in ledger', {
          ref: maskString(txData.referenceNumber || txData.dedupKey, 6),
          amount: txData.amount,
          type: txData.transactionType
        });
        return sendJson(res, 200, {
          status: 'duplicate',
          message: 'Transaction already recorded (duplicate ignored)',
          referenceNumber: txData.referenceNumber,
          dedupKey: txData.dedupKey,
          code: 'DUPLICATE_IGNORED'
        });
      }

      // 6. Persist Transaction in Durable Store
      const newTransaction = {
        id: `TX-UPI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...txData,
        tags: ['UPI', 'AutoWebhook'],
        sender: maskString(sender, 8),
        createdAt: new Date().toISOString(),
        syncedToClient: false,
        userId: targetUserId || undefined
      };

      // Persist in User Database if targeted
      if (targetUserId) {
        db.createTransaction(targetUserId, newTransaction);
      }

      // Persist in Global Ledger file for compatibility
      ledger.transactions.unshift(newTransaction);
      const saved = saveWebhookLedger(ledger);

      if (!saved) {
        return sendJson(res, 500, {
          status: 'error',
          error: 'Internal server error: Failed to persist transaction',
          code: 'STORAGE_FAILED'
        });
      }

      safeLog('info', 'Successfully recorded UPI transaction', {
        id: newTransaction.id,
        type: newTransaction.transactionType,
        amount: newTransaction.amount,
        ref: maskString(newTransaction.referenceNumber || newTransaction.dedupKey, 6),
        userScoped: Boolean(targetUserId)
      });

      return sendJson(res, 201, {
        status: 'success',
        message: 'UPI transaction parsed and recorded successfully',
        transaction: newTransaction
      });
    });

    req.on('error', err => {
      safeLog('error', 'Webhook stream error', { message: err.message });
      return sendJson(res, 500, { status: 'error', error: 'Stream error', code: 'STREAM_ERROR' });
    });

    return;
  }

  // =========================================================================
  // ROUTE 2: GET /api/webhook/transactions - Client Sync Endpoint
  // =========================================================================
  if (req.method === 'GET' && pathname === '/api/webhook/transactions') {
    // If client provides JWT, return transactions scoped to that user
    const auth = authenticateJwtToken(req);
    if (auth.authenticated && auth.user) {
      const userTransactions = db.getTransactions(auth.user.id);
      return sendJson(res, 200, {
        status: 'success',
        count: userTransactions.length,
        lastUpdated: new Date().toISOString(),
        transactions: userTransactions
      });
    }

    // Default: Return global ledger transactions
    const ledger = loadWebhookLedger();
    return sendJson(res, 200, {
      status: 'success',
      count: ledger.transactions.length,
      lastUpdated: ledger.lastUpdated,
      transactions: ledger.transactions
    });
  }

  // =========================================================================
  // ROUTE 3: POST /api/webhook/transactions/mark-synced
  // =========================================================================
  if (req.method === 'POST' && pathname === '/api/webhook/transactions/mark-synced') {
    try {
      const payload = await readJsonBody(req);
      const ids = Array.isArray(payload.ids) ? payload.ids : [];
      const ledger = loadWebhookLedger();
      let updatedCount = 0;
      ledger.transactions.forEach(tx => {
        if (ids.length === 0 || ids.includes(tx.id)) {
          tx.syncedToClient = true;
          updatedCount++;
        }
      });
      saveWebhookLedger(ledger);
      return sendJson(res, 200, { status: 'success', markedCount: updatedCount });
    } catch (e) {
      return sendJson(res, 400, { status: 'error', error: 'Invalid payload' });
    }
  }

  // =========================================================================
  // ROUTE 4: Serve Main Web Application (SPA)
  // =========================================================================
  fs.readFile(HTML_FILE, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading HisabX Application: ' + err.message);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

// Create HTTP Server
const server = http.createServer(requestHandler);

// Start listening if executed directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('\n======================================================');
    console.log('   🚀 HisabX — Production Personal Finance OS');
    console.log('======================================================');
    console.log(`   Local Web App   : http://localhost:${PORT}`);
    console.log(`   Webhook API     : http://localhost:${PORT}/api/webhook/upi`);
    console.log(`   Client Sync API : http://localhost:${PORT}/api/webhook/transactions`);
    console.log(`   Auth API        : http://localhost:${PORT}/api/auth/login`);
    console.log(`   Secret Status   : ${WEBHOOK_SECRET ? 'Configured (Secured with UPI_WEBHOOK_SECRET)' : 'Not set (Open Local Dev Mode)'}`);
    console.log('   Storage Store   : data/hisabx_persistent_db.json');
    console.log('======================================================\n');
  });
}

// Export for serverless environments (Vercel)
module.exports = server;
module.exports.requestHandler = requestHandler;
