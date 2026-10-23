import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (isProduction) {
    if (!secret || secret.trim().length < 32) {
      throw new Error('[Security Startup Error] In production, JWT_SECRET must be configured and at least 32 characters long.');
    }
    return secret.trim();
  }
  return secret || 'dev-ephemeral-local-key-only';
}

function getDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL;
  if (isProduction && (!dbUrl || !dbUrl.trim())) {
    throw new Error('[Security Startup Error] In production, DATABASE_URL must be configured via environment variables.');
  }
  return dbUrl || '';
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv,
  jwtSecret: getJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: getDatabaseUrl(),
  defaultCurrency: 'INR',
  defaultTimezone: 'Asia/Kolkata',
  rateLimitWindowMs: 15 * 60 * 1000,
  rateLimitMax: 1000,
};
