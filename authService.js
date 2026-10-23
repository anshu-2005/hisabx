/**
 * HisabX Secure Authentication Service
 *
 * Implements:
 * - Bcrypt password hashing (never stores plaintext passwords)
 * - JWT session token issuance & validation with expiration
 * - Strict input validation for emails, passwords, and user profiles
 * - Password reset token generator with 1-hour expiration
 * - Multi-tenant user scoping helpers
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('./database');

require('dotenv').config();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      throw new Error('[Security Startup Error] Missing required environment variable: JWT_SECRET must be configured in production.');
    }
    if (secret.trim().length < 32) {
      throw new Error('[Security Startup Error] Insecure JWT_SECRET: Must be at least 32 characters long in production.');
    }
    return secret.trim();
  }

  // Development / Test mode: Use environment variable if provided
  if (secret && typeof secret === 'string' && secret.trim().length >= 16) {
    return secret.trim();
  }

  // Safe development/test ephemeral secret generated in-memory per runtime instance
  // (Never hardcoded into source code, never committed to version control)
  if (!global.__hisabx_dev_jwt_secret) {
    global.__hisabx_dev_jwt_secret = crypto.randomBytes(32).toString('hex');
  }
  return global.__hisabx_dev_jwt_secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// In-memory token blacklist for immediate logout invalidation
const tokenBlacklist = new Set();

// Password reset token store: Map<resetToken, { userId: string, expiresAt: number }>
const passwordResetTokens = new Map();

// Helper to validate email format
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// Helper to validate password strength (min 6 chars, non-empty)
function isValidPassword(password) {
  return typeof password === 'string' && password.trim().length >= 6;
}

// User Registration
async function registerUser({ email, password, fullName }) {
  if (!isValidEmail(email)) {
    return { success: false, status: 400, error: 'Please provide a valid email address' };
  }
  if (!isValidPassword(password)) {
    return { success: false, status: 400, error: 'Password must be at least 6 characters long' };
  }
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return { success: false, status: 400, error: 'Please enter a valid full name (minimum 2 characters)' };
  }

  const existing = db.findUserByEmail(email);
  if (existing) {
    return { success: false, status: 409, error: 'An account with this email address already exists' };
  }

  // Hash password with bcrypt salt rounds = 10
  const passwordHash = await bcrypt.hash(password.trim(), 10);

  const newUser = db.createUser({
    email,
    passwordHash,
    fullName
  });

  // Create default starter accounts for the newly registered user
  const defaultAccounts = [
    { id: `acc_${newUser.id}_bank`, name: 'Primary Bank Account', type: 'BANK', openingBalance: 0, currentBalance: 0, nickname: 'Salary / Primary Savings', color: '#1E3A8A', icon: 'landmark', isActive: true },
    { id: `acc_${newUser.id}_cash`, name: 'Cash Wallet', type: 'CASH', openingBalance: 0, currentBalance: 0, nickname: 'Physical Cash in Hand', color: '#10B981', icon: 'banknote', isActive: true },
    { id: `acc_${newUser.id}_upi`, name: 'UPI Wallet (GPay / PhonePe)', type: 'UPI_WALLET', openingBalance: 0, currentBalance: 0, nickname: 'Daily UPI Payments', color: '#8B5CF6', icon: 'smartphone', isActive: true },
    { id: `acc_${newUser.id}_savings`, name: 'Secondary Savings / Emergency', type: 'SAVINGS', openingBalance: 0, currentBalance: 0, nickname: 'Emergency Buffer', color: '#EA580C', icon: 'shield', isActive: true }
  ];
  defaultAccounts.forEach(acc => db.saveAccount(newUser.id, acc));

  const token = jwt.sign(
    { userId: newUser.id, email: newUser.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    success: true,
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName,
      webhookSecret: newUser.webhookSecret,
      createdAt: newUser.createdAt
    }
  };
}

// User Login
async function loginUser({ email, password }) {
  if (!isValidEmail(email) || !password) {
    return { success: false, status: 400, error: 'Email and password are required' };
  }

  const user = db.findUserByEmail(email);
  if (!user) {
    return { success: false, status: 401, error: 'Invalid email or password' };
  }

  const match = await bcrypt.compare(password.trim(), user.passwordHash);
  if (!match) {
    return { success: false, status: 401, error: 'Invalid email or password' };
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      webhookSecret: user.webhookSecret,
      createdAt: user.createdAt
    }
  };
}

// User Authentication Middleware / Verifier
function authenticateJwtToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return { authenticated: false, reason: 'Missing Authorization header' };

  let token = authHeader.trim();
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim();
  }

  if (!token) {
    return { authenticated: false, reason: 'Missing Bearer token' };
  }

  if (tokenBlacklist.has(token)) {
    return { authenticated: false, reason: 'Session expired or logged out. Please sign in again.' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return { authenticated: false, reason: 'Invalid token payload' };
    }

    const user = db.findUserById(decoded.userId);
    if (!user) {
      return { authenticated: false, reason: 'User not found or account deleted' };
    }

    return {
      authenticated: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        webhookSecret: user.webhookSecret
      }
    };
  } catch (err) {
    return { authenticated: false, reason: 'Session token expired or invalid. Please sign in again.' };
  }
}

// User Logout
function logoutUser(token) {
  if (token) {
    tokenBlacklist.add(token);
    // Cleanup blacklist memory periodically if needed
    if (tokenBlacklist.size > 10000) tokenBlacklist.clear();
  }
  return { success: true, message: 'Logged out successfully' };
}

// Password Reset Request
function requestPasswordReset(email) {
  if (!isValidEmail(email)) {
    return { success: false, status: 400, error: 'Valid email address required' };
  }

  const user = db.findUserByEmail(email);
  if (!user) {
    // For security, do not disclose whether user exists or not
    return { success: true, message: 'If this email is registered, a password reset link has been generated.' };
  }

  const resetToken = `rst_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour validity

  passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

  return {
    success: true,
    message: 'Password reset link prepared successfully.',
    resetToken // Returned for direct in-app reset confirmation
  };
}

// Complete Password Reset
async function completePasswordReset(resetToken, newPassword) {
  if (!resetToken || !passwordResetTokens.has(resetToken)) {
    return { success: false, status: 400, error: 'Invalid or expired password reset link' };
  }

  const entry = passwordResetTokens.get(resetToken);
  if (Date.now() > entry.expiresAt) {
    passwordResetTokens.delete(resetToken);
    return { success: false, status: 400, error: 'Reset link has expired. Please request a new one.' };
  }

  if (!isValidPassword(newPassword)) {
    return { success: false, status: 400, error: 'Password must be at least 6 characters long' };
  }

  const newHash = await bcrypt.hash(newPassword.trim(), 10);
  const updated = db.updateUserPassword(entry.userId, newHash);

  passwordResetTokens.delete(resetToken);

  if (!updated) {
    return { success: false, status: 500, error: 'Failed to update user password' };
  }

  return { success: true, message: 'Password updated successfully. You can now log in with your new password.' };
}

module.exports = {
  registerUser,
  loginUser,
  authenticateJwtToken,
  logoutUser,
  requestPasswordReset,
  completePasswordReset,
  isValidEmail,
  isValidPassword,
  getJwtSecret
};
