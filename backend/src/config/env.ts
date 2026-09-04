import dotenv from 'dotenv';
dotenv.config();

function safeInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || value.trim() === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: safeInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: safeInt(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'schoolpro',
    /** 'auto' (default, recommended) — try with SSL, then fall back to no-SSL. */
    sslMode: process.env.DB_SSL_MODE || 'auto',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  frontendUrl: process.env.FRONTEND_URL || 'https://schoolproedu.vercel.app/',
  apiPublicUrl: process.env.API_PUBLIC_URL || 'https://school-pro-lgbk.vercel.app/',
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    enabled: process.env.REDIS_ENABLED !== 'false',
  },
  whatsapp: {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_WHATSAPP_FROM || '',
    useTemplate: process.env.WHATSAPP_USE_TEMPLATE === 'true',
    contentSid: process.env.TWILIO_CONTENT_SID || '',
    statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL || '',
  },
  sms: {
    from: process.env.TWILIO_SMS_FROM || '',
  },
  demo: {
    enabled: process.env.DEMO_FEATURE_ENABLED !== 'false',
    db: {
      host: process.env.DEMO_DB_HOST || process.env.DB_HOST || 'localhost',
      port: safeInt(process.env.DEMO_DB_PORT ?? process.env.DB_PORT, 5432),
      username: process.env.DEMO_DB_USERNAME || process.env.DB_USERNAME || 'postgres',
      password: process.env.DEMO_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres',
      database: process.env.DEMO_DB_DATABASE || 'school_pro_demo',
    },
    jwtTtlMinutes: safeInt(process.env.DEMO_JWT_TTL_MINUTES, 45),
    resetCron: process.env.DEMO_RESET_CRON || '0 0 */1 * *',
    resetOnBoot: process.env.DEMO_RESET_ON_BOOT === 'true',
    writeRateLimitPerMinute: safeInt(process.env.DEMO_WRITE_RATE_LIMIT_PER_MINUTE, 20),
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local') as 'local' | 's3',
    maxUploadMb: safeInt(process.env.UPLOAD_MAX_MB, 25),
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      endpoint: process.env.S3_ENDPOINT || '',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
    },
  },
};

