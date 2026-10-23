import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'hisabx_super_secure_jwt_secret_key_prod_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hisabx_user:hisabx_password@localhost:5432/hisabx_db?schema=public',
  defaultCurrency: 'INR',
  defaultTimezone: 'Asia/Kolkata',
  rateLimitWindowMs: 15 * 60 * 1000,
  rateLimitMax: 1000,
};
