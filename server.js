const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, 'hisabx_app.html');
const DATA_DIR = path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'webhook_transactions.json');
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB

// Webhook Secret from Environment Variable
const WEBHOOK_SECRET = process.env.UPI_WEBHOOK_SECRET || process.env.HISABX_WEBHOOK_SECRET || '';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('[Storage Error] Failed to create data directory:', err.message);
  }
}

// Durable Server-Side Store Functions
function loadWebhookLedger() {
  try {
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
  // Redact any sensitive keys
  ['secret', 'otp', 'token', 'password', 'key', 'authorization'].forEach(k => {
    if (safeMeta[k]) safeMeta[k] = '[REDACTED]';
  });
  const metaStr = Object.keys(safeMeta).length ? ' ' + JSON.stringify(safeMeta) : '';
  console.log(`[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`);
}

// Webhook Secret Authentication Validator
function authenticateWebhookRequest(req) {
  if (!WEBHOOK_SECRET) {
    // Open dev mode if secret not configured in environment
    return { authenticated: true, warning: 'UPI_WEBHOOK_SECRET not set in environment (open dev mode)' };
  }

  const rawHeader = req.headers['x-webhook-secret'] || req.headers['authorization'] || '';
  let providedToken = rawHeader.trim();
  if (providedToken.toLowerCase().startsWith('bearer ')) {
    providedToken = providedToken.slice(7).trim();
  }

  if (!providedToken) {
    return { authenticated: false, reason: 'Missing webhook secret header' };
  }

  // Constant-time comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(WEBHOOK_SECRET, 'utf8');
    const providedBuf = Buffer.from(providedToken, 'utf8');
    if (expectedBuf.length !== providedBuf.length) {
      return { authenticated: false, reason: 'Invalid webhook secret' };
    }
    const isMatch = crypto.timingSafeEqual(expectedBuf, providedBuf);
    return { authenticated: isMatch, reason: isMatch ? null : 'Invalid webhook secret' };
  } catch (e) {
    return { authenticated: false, reason: 'Authentication verification failed' };
  }
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
  // Matches "Rs. 450", "INR 1,450.00", "₹ 500", "450.00 INR", "Rs450"
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
  // Example matches: "UPI Ref 498218901234", "Ref: 9382103948", "UTR: 482910482910", "Txn ID: 294819284918"
  let referenceNumber = null;
  const refMatch = raw.match(/(?:upi\s*ref(?:\s*no)?|ref(?:\s*no)?|txn\s*(?:id|no)|utr|rrn)[\s:]*([A-Za-z0-9]{6,25})/i);
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

  // Check if SMS mentions a specific date (e.g. 23-10-2026 or 23-Oct-26)
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

// HTTP Server
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // =========================================================================
  // ROUTE 1: POST /api/webhook/upi (or /v1/webhook/upi) - Webhook Ingestion
  // =========================================================================
  if (req.method === 'POST' && (url === '/api/webhook/upi' || url.includes('/webhook/upi') || url === '/api/webhook')) {
    // 1. Authenticate Request
    const authResult = authenticateWebhookRequest(req);
    if (!authResult.authenticated) {
      safeLog('warn', 'Webhook unauthorized request rejected', { reason: authResult.reason });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        error: 'Unauthorized: Invalid or missing webhook secret',
        code: 'UNAUTHORIZED'
      }));
      return;
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
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          error: 'Payload too large (maximum 64KB allowed)',
          code: 'PAYLOAD_TOO_LARGE'
        }));
        return;
      }

      // 3. Parse and Validate JSON Payload
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (err) {
        safeLog('warn', 'Webhook rejected: invalid JSON payload');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          error: 'Invalid JSON request body. Expected format: { "sender": string, "body": string, "timestamp"?: string }',
          code: 'INVALID_JSON'
        }));
        return;
      }

      if (!payload || typeof payload !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          error: 'Invalid request body. Expected a JSON object.',
          code: 'BAD_REQUEST'
        }));
        return;
      }

      const smsText = payload.body || payload.text || payload.message || payload.sms;
      const sender = payload.sender || payload.from || 'SMS_BRIDGE';
      const timestamp = payload.timestamp || payload.date || new Date().toISOString();

      if (!smsText || typeof smsText !== 'string' || !smsText.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          error: 'Missing required field: "body" (SMS text string is required)',
          code: 'MISSING_BODY'
        }));
        return;
      }

      // 4. Parse Bank SMS Text
      const parseResult = parseBankSms(smsText, sender, timestamp);
      if (!parseResult.success) {
        safeLog('info', 'Webhook SMS rejected: not a valid transaction', {
          sender: maskString(sender, 4),
          reason: parseResult.reason
        });
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'rejected',
          error: 'Unrecognized or non-transactional SMS message',
          reason: parseResult.reason,
          code: 'UNRECOGNIZED_TRANSACTION'
        }));
        return;
      }

      const txData = parseResult.data;

      // 5. Deduplication Check against Persistent Store
      const ledger = loadWebhookLedger();
      const isDuplicate = ledger.transactions.some(tx => {
        if (txData.referenceNumber && tx.referenceNumber && tx.referenceNumber === txData.referenceNumber) {
          return true;
        }
        return tx.dedupKey === txData.dedupKey;
      });

      if (isDuplicate) {
        safeLog('info', 'Duplicate webhook transaction detected and ignored', {
          ref: maskString(txData.referenceNumber || txData.dedupKey, 6),
          amount: txData.amount,
          type: txData.transactionType
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'duplicate',
          message: 'Transaction already recorded (duplicate ignored)',
          referenceNumber: txData.referenceNumber,
          dedupKey: txData.dedupKey,
          code: 'DUPLICATE_IGNORED'
        }));
        return;
      }

      // 6. Persist Transaction in Durable Store
      const newTransaction = {
        id: `TX-UPI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...txData,
        tags: ['UPI', 'AutoWebhook'],
        sender: maskString(sender, 8),
        createdAt: new Date().toISOString(),
        syncedToClient: false
      };

      ledger.transactions.unshift(newTransaction);
      const saved = saveWebhookLedger(ledger);

      if (!saved) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          error: 'Internal server error: Failed to persist transaction',
          code: 'STORAGE_FAILED'
        }));
        return;
      }

      safeLog('info', 'Successfully recorded UPI transaction', {
        id: newTransaction.id,
        type: newTransaction.transactionType,
        amount: newTransaction.amount,
        ref: maskString(newTransaction.referenceNumber || newTransaction.dedupKey, 6)
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        message: 'UPI transaction parsed and recorded successfully',
        transaction: newTransaction
      }));
    });

    req.on('error', err => {
      safeLog('error', 'Webhook stream error', { message: err.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: 'Stream error', code: 'STREAM_ERROR' }));
    });

    return;
  }

  // =========================================================================
  // ROUTE 2: GET /api/webhook/transactions - Client Sync Endpoint
  // =========================================================================
  if (req.method === 'GET' && url === '/api/webhook/transactions') {
    const ledger = loadWebhookLedger();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'success',
      count: ledger.transactions.length,
      lastUpdated: ledger.lastUpdated,
      transactions: ledger.transactions
    }));
    return;
  }

  // =========================================================================
  // ROUTE 3: POST /api/webhook/transactions/mark-synced
  // =========================================================================
  if (req.method === 'POST' && url === '/api/webhook/transactions/mark-synced') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', markedCount: updatedCount }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: 'Invalid payload' }));
      }
    });
    return;
  }

  // =========================================================================
  // ROUTE 4: GET /api/health
  // =========================================================================
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      app: 'HisabX Fintech OS',
      version: '2.0.0',
      time: new Date().toISOString(),
      webhookConfigured: Boolean(WEBHOOK_SECRET)
    }));
    return;
  }

  // =========================================================================
  // ROUTE 5: Serve Main Web Application (SPA)
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
});

server.listen(PORT, () => {
  console.log('\n======================================================');
  console.log('   🚀 HisabX — Production Personal Finance OS');
  console.log('======================================================');
  console.log(`   Local Web App   : http://localhost:${PORT}`);
  console.log(`   Webhook API     : http://localhost:${PORT}/api/webhook/upi`);
  console.log(`   Client Sync API : http://localhost:${PORT}/api/webhook/transactions`);
  console.log(`   Secret Status   : ${WEBHOOK_SECRET ? 'Configured (Secured with UPI_WEBHOOK_SECRET)' : 'Not set (Open Local Dev Mode)'}`);
  console.log('   Storage Store   : data/webhook_transactions.json');
  console.log('======================================================\n');
});
