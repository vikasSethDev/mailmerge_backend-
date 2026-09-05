import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}


if (process.env.NODE_ENV === 'production') {
  const requiredProduction = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET', 'GOOGLE_TOKEN_ENCRYPTION_KEY'];
  for (const name of requiredProduction) {
    if (!process.env[name] || process.env[name]?.includes('change-this') || process.env[name]?.includes('0123456789abcdef')) {
      throw new Error(`Secure production value required for ${name}`);
    }
  }
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4200',

  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/mailmerge'),

  jwt: {
    secret: required('JWT_SECRET', 'dev-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:5000/api/auth/google/callback',
    tokenEncryptionKey: required('GOOGLE_TOKEN_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  },

  uploads: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxAttachmentSizeMb: Number(process.env.MAX_ATTACHMENT_SIZE_MB ?? 10),
    maxCsvSizeMb: Number(process.env.MAX_CSV_SIZE_MB ?? 5),
  },

  defaultRateLimits: {
    perMinute: Number(process.env.DEFAULT_EMAILS_PER_MINUTE ?? 5),
    perHour: Number(process.env.DEFAULT_EMAILS_PER_HOUR ?? 100),
    perDay: Number(process.env.DEFAULT_EMAILS_PER_DAY ?? 500),
  },

  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5000',
};
