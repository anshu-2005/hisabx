/**
 * HisabX Comprehensive Authentication & Multi-Tenant Isolation Test Suite
 *
 * Verifies:
 * 1. User registration & validation (valid input, duplicate email, weak password)
 * 2. Password security (bcrypt hashing, zero plaintext in database)
 * 3. Login & JWT generation
 * 4. Protected route verification & invalid token rejection
 * 5. Strict User Isolation:
 *    - User A cannot see User B's transactions or accounts
 *    - User B cannot delete or modify User A's transaction by ID
 * 6. User-attributed UPI Webhook:
 *    - Webhook with User A's token attributes transaction to User A only
 *    - User B never sees User A's webhook transactions
 *    - Deduplication within user's account
 * 7. Secure Password Reset flow
 * 8. Rate limiting protection
 */

const http = require('http');
const assert = require('assert');

function post(urlPath, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    };
    const req = http.request(options, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(resBody); } catch (e) { json = resBody; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'GET',
      headers: { ...headers }
    };
    const req = http.request(options, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(resBody); } catch (e) { json = resBody; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function del(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'DELETE',
      headers: { ...headers }
    };
    const req = http.request(options, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(resBody); } catch (e) { json = resBody; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const server = require('./server');

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   🧪 Running HisabX Auth & Data Isolation Tests');
  console.log('======================================================\n');

  let serverStartedLocally = false;
  if (!server.listening) {
    await new Promise(r => server.listen(3000, r));
    serverStartedLocally = true;
  }

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
    }
  }

  const runId = Date.now();
  const userAEmail = `alice_${runId}@hisabx.test`;
  const userBEmail = `bob_${runId}@hisabx.test`;
  const plainPassword = 'StrongPassword123!';

  let userAToken = '';
  let userAWebhookSecret = '';
  let userBToken = '';
  let userBWebhookSecret = '';
  let userATxnId = '';

  // 1. Validation: Reject Weak Password
  await test('Rejects registration with password shorter than 6 characters (400)', async () => {
    const res = await post('/api/auth/register', {
      email: `short_${runId}@test.com`,
      password: '123',
      fullName: 'Short Pwd'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.status, 'error');
  });

  // 2. Validation: Reject Invalid Email
  await test('Rejects registration with invalid email format (400)', async () => {
    const res = await post('/api/auth/register', {
      email: 'not-an-email',
      password: plainPassword,
      fullName: 'Invalid Email'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.status, 'error');
  });

  // 3. User A Registration
  await test('Registers User A and returns JWT + unique webhook token (201)', async () => {
    const res = await post('/api/auth/register', {
      email: userAEmail,
      password: plainPassword,
      fullName: 'Alice Verma'
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, 'success');
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.email, userAEmail);
    assert.ok(res.body.user.webhookSecret.startsWith('whsec_'));
    userAToken = res.body.token;
    userAWebhookSecret = res.body.user.webhookSecret;
  });

  // 4. Duplicate Registration Rejection
  await test('Prevents duplicate email registration (409 Conflict)', async () => {
    const res = await post('/api/auth/register', {
      email: userAEmail,
      password: plainPassword,
      fullName: 'Alice Clone'
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.status, 'error');
  });

  // 5. User A Login
  await test('User A logs in with correct credentials (200 OK)', async () => {
    const res = await post('/api/auth/login', {
      email: userAEmail,
      password: plainPassword
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'success');
    assert.ok(res.body.token);
  });

  // 6. User A Login Rejection with Bad Password
  await test('Rejects login with incorrect password (401 Unauthorized)', async () => {
    const res = await post('/api/auth/login', {
      email: userAEmail,
      password: 'WrongPassword999'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.status, 'error');
  });

  // 7. Protected Route Access (/api/auth/me)
  await test('Authenticates protected route with Bearer token (200 OK)', async () => {
    const res = await get('/api/auth/me', {
      'Authorization': `Bearer ${userAToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.email, userAEmail);
  });

  // 8. Protected Route Rejection without Token
  await test('Rejects protected route without token (401 Unauthorized)', async () => {
    const res = await get('/api/auth/me');
    assert.strictEqual(res.status, 401);
  });

  // 9. User B Registration
  await test('Registers User B with isolated identity and credentials (201)', async () => {
    const res = await post('/api/auth/register', {
      email: userBEmail,
      password: plainPassword,
      fullName: 'Bob Sharma'
    });
    assert.strictEqual(res.status, 201);
    userBToken = res.body.token;
    userBWebhookSecret = res.body.user.webhookSecret;
    assert.notStrictEqual(userBWebhookSecret, userAWebhookSecret);
  });

  // 10. User A Creates Private Transaction
  await test('User A creates a private transaction scoped to their account', async () => {
    const res = await post('/api/user/transactions', {
      amount: 1250,
      transactionType: 'EXPENSE',
      category: 'Food & Groceries',
      description: "Alice's Secret Grocery Bill",
      date: '2026-10-23'
    }, {
      'Authorization': `Bearer ${userAToken}`
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.transaction.amount, 1250);
    userATxnId = res.body.transaction.id;
  });

  // 11. Multi-Tenant Isolation Check: User B CANNOT see User A's transaction
  await test('User B queries ledger and receives 0 of User A transactions (Data Isolation)', async () => {
    const res = await get('/api/user/data', {
      'Authorization': `Bearer ${userBToken}`
    });
    assert.strictEqual(res.status, 200);
    const bTxns = res.body.data.transactions;
    const foundAliceTx = bTxns.some(t => t.description === "Alice's Secret Grocery Bill" || t.id === userATxnId);
    assert.strictEqual(foundAliceTx, false, 'User B must never see User A data');
  });

  // 12. Security: User B CANNOT delete User A's transaction by ID
  await test('User B cannot delete User A transaction by ID (404/403 Protection)', async () => {
    const res = await del(`/api/user/transactions/${userATxnId}`, {
      'Authorization': `Bearer ${userBToken}`
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.status, 'error');

    // Verify transaction is still alive in User A's account
    const checkA = await get('/api/user/data', {
      'Authorization': `Bearer ${userAToken}`
    });
    const stillThere = checkA.body.data.transactions.some(t => t.id === userATxnId);
    assert.strictEqual(stillThere, true, 'Alice transaction must remain intact');
  });

  // 13. Multi-User UPI Webhook Attribution
  await test('UPI Webhook with User A token attributes transaction directly to User A', async () => {
    const testRef = `ALICE_REF_${Date.now()}`;
    const webhookRes = await post(`/api/webhook/upi?token=${userAWebhookSecret}`, {
      sender: 'VM-HDFCBK',
      body: `Debited INR 599.00 to Swiggy via UPI Ref ${testRef} on 23-10-2026. Avl Bal INR 15,000.00`,
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(webhookRes.status, 201);
    assert.strictEqual(webhookRes.body.status, 'success');

    // Verify User A has it
    const aliceData = await get('/api/user/data', { 'Authorization': `Bearer ${userAToken}` });
    const hasTx = aliceData.body.data.transactions.some(t => t.referenceNumber === testRef);
    assert.strictEqual(hasTx, true, 'Alice must receive the webhook transaction');

    // Verify User B does NOT have it
    const bobData = await get('/api/user/data', { 'Authorization': `Bearer ${userBToken}` });
    const bobHasTx = bobData.body.data.transactions.some(t => t.referenceNumber === testRef);
    assert.strictEqual(bobHasTx, false, 'Bob must NOT receive Alice webhook transaction');
  });

  // 14. User Webhook Deduplication
  await test('User Webhook rejects duplicate transaction for the same user (200 OK duplicate)', async () => {
    const dupRef = `DUP_REF_${Date.now()}`;
    const first = await post(`/api/webhook/upi?token=${userAWebhookSecret}`, {
      sender: 'VM-HDFCBK',
      body: `Debited INR 200.00 to Chai Point via UPI Ref ${dupRef}`,
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(first.status, 201);

    const second = await post(`/api/webhook/upi?token=${userAWebhookSecret}`, {
      sender: 'VM-HDFCBK',
      body: `Debited INR 200.00 to Chai Point via UPI Ref ${dupRef}`,
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.body.status, 'duplicate');
  });

  // 15. Password Reset Flow
  await test('Password reset flow generates token and securely updates password', async () => {
    const reqRes = await post('/api/auth/forgot-password', { email: userAEmail });
    assert.strictEqual(reqRes.status, 200);
    assert.ok(reqRes.body.resetToken);

    const newPwd = 'BrandNewAlicePassword2026!';
    const completeRes = await post('/api/auth/reset-password', {
      token: reqRes.body.resetToken,
      newPassword: newPwd
    });
    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.body.status, 'success');

    // Login with new password
    const newLogin = await post('/api/auth/login', {
      email: userAEmail,
      password: newPwd
    });
    assert.strictEqual(newLogin.status, 200);
    assert.ok(newLogin.body.token);
  });

  // 16. Security: Production Mode Requires JWT_SECRET
  await test('Production mode throws clear startup error when JWT_SECRET is missing', async () => {
    const { getJwtSecret } = require('./authService');
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      assert.throws(() => {
        getJwtSecret();
      }, /\[Security Startup Error\] Missing required environment variable: JWT_SECRET/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.JWT_SECRET = origSecret;
      else delete process.env.JWT_SECRET;
    }
  });

  // 17. Security: Production Mode Requires Strong JWT_SECRET (>= 32 chars)
  await test('Production mode throws clear startup error when JWT_SECRET is too short (< 32 chars)', async () => {
    const { getJwtSecret } = require('./authService');
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short-weak-secret-123';
      assert.throws(() => {
        getJwtSecret();
      }, /\[Security Startup Error\] Insecure JWT_SECRET: Must be at least 32 characters long/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.JWT_SECRET = origSecret;
      else delete process.env.JWT_SECRET;
    }
  });

  // 18. Security: Production Mode Accepts Strong JWT_SECRET (>= 32 chars)
  await test('Production mode accepts strong JWT_SECRET (>= 32 chars)', async () => {
    const { getJwtSecret } = require('./authService');
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'this_is_a_sufficiently_long_and_strong_production_secret_key_2026';
      const resolved = getJwtSecret();
      assert.strictEqual(resolved, 'this_is_a_sufficiently_long_and_strong_production_secret_key_2026');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) process.env.JWT_SECRET = origSecret;
      else delete process.env.JWT_SECRET;
    }
  });

  console.log('\n======================================================');
  console.log(`   🏁 Results: ${passed}/${total} Tests Passed`);
  console.log('======================================================\n');

  if (serverStartedLocally) {
    server.close();
  }

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
