import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'schoolpro',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  apiPublicUrl: process.env.API_PUBLIC_URL || '',
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    /** When false, BullMQ workers are not started and enqueue calls are skipped. */
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
    /** Master switch — when false, /demo-login 404s and no demo DB/cron is started. */
    enabled: process.env.DEMO_FEATURE_ENABLED !== 'false',
    db: {
      host: process.env.DEMO_DB_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DEMO_DB_PORT || process.env.DB_PORT || '5432', 10),
      username: process.env.DEMO_DB_USERNAME || process.env.DB_USERNAME || 'postgres',
      password: process.env.DEMO_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres',
      database: process.env.DEMO_DB_DATABASE || 'school_pro_demo',
    },
    /** Demo JWTs always use this fixed, short TTL regardless of the school's security policy. */
    jwtTtlMinutes: parseInt(process.env.DEMO_JWT_TTL_MINUTES || '45', 10),
    /** node-cron expression for the recurring demo reset (default: every 24h at minute 0). */
    resetCron: process.env.DEMO_RESET_CRON || '0 0 */1 * *',
    /** Re-seed on every boot even if the demo DB already has data (useful in dev). */
    resetOnBoot: process.env.DEMO_RESET_ON_BOOT === 'true',
    /** Requests per minute allowed per demo session on write (non-GET) endpoints. */
    writeRateLimitPerMinute: parseInt(process.env.DEMO_WRITE_RATE_LIMIT_PER_MINUTE || '20', 10),
  },
  storage: {
    /** local (default/dev) or s3 (AWS S3 / R2 / MinIO). */
    driver: (process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local') as 'local' | 's3',
    maxUploadMb: parseInt(process.env.UPLOAD_MAX_MB || '25', 10),
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

