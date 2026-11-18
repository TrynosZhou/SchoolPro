import dotenv from 'dotenv';
dotenv.config();

function cleanStr(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).replace(/^\s+|\s+$/g, '');
  return s === '' ? undefined : s;
}

function safeInt(value: string | undefined, fallback: number): number {
  const s = cleanStr(value);
  if (s === undefined) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

const envRender = cleanStr(process.env.RENDER);
const envRenderServiceId = cleanStr(process.env.RENDER_SERVICE_ID);
const envRenderExternalUrl = cleanStr(process.env.RENDER_EXTERNAL_URL);

const ON_RENDER =
  (typeof envRender === 'string' && envRender.toLowerCase() === 'true')
    ? true
    : !!envRenderServiceId || !!envRenderExternalUrl;

const RENDER_PUBLIC_URL = (() => {
  const u = envRenderExternalUrl;
  if (!u) return undefined;
  return u.replace(/\/+$/, '');
})();

const envNodeEnv = cleanStr(process.env.NODE_ENV);
const envDbHost = cleanStr(process.env.DB_HOST);
const envDbUsername = cleanStr(process.env.DB_USERNAME);
const envDbPassword = cleanStr(process.env.DB_PASSWORD);
const envDbDatabase = cleanStr(process.env.DB_DATABASE);
const envDbSslMode = cleanStr(process.env.DB_SSL_MODE);

const envJwtSecret = cleanStr(process.env.JWT_SECRET);
const envJwtExpiresIn = cleanStr(process.env.JWT_EXPIRES_IN);

const envFrontendUrl = cleanStr(process.env.FRONTEND_URL);
const envApiPublicUrl = cleanStr(process.env.API_PUBLIC_URL);

const envRedisUrl = cleanStr(process.env.REDIS_URL);
const envRedisEnabled = cleanStr(process.env.REDIS_ENABLED);

const envDemoFeatureEnabled = cleanStr(process.env.DEMO_FEATURE_ENABLED);
const envDemoDbHost = cleanStr(process.env.DEMO_DB_HOST);
const envDemoDbUsername = cleanStr(process.env.DEMO_DB_USERNAME);
const envDemoDbPassword = cleanStr(process.env.DEMO_DB_PASSWORD);
const envDemoDbDatabase = cleanStr(process.env.DEMO_DB_DATABASE);
const envDemoDbSslMode = cleanStr(process.env.DEMO_DB_SSL_MODE);
const envDemoResetCron = cleanStr(process.env.DEMO_RESET_CRON);
const envDemoResetOnBoot = cleanStr(process.env.DEMO_RESET_ON_BOOT);

const envWhatsappEnabled = cleanStr(process.env.WHATSAPP_ENABLED);
const envTwilioAccountSid = cleanStr(process.env.TWILIO_ACCOUNT_SID);
const envTwilioAuthToken = cleanStr(process.env.TWILIO_AUTH_TOKEN);
const envTwilioWhatsappFrom = cleanStr(process.env.TWILIO_WHATSAPP_FROM);
const envWhatsappUseTemplate = cleanStr(process.env.WHATSAPP_USE_TEMPLATE);
const envTwilioContentSid = cleanStr(process.env.TWILIO_CONTENT_SID);
const envTwilioStatusCallbackUrl = cleanStr(process.env.TWILIO_STATUS_CALLBACK_URL);
const envTwilioSmsFrom = cleanStr(process.env.TWILIO_SMS_FROM);

const envStorageDriver = cleanStr(process.env.STORAGE_DRIVER);
const envS3Bucket = cleanStr(process.env.S3_BUCKET);
const envS3Region = cleanStr(process.env.S3_REGION);
const envS3AccessKeyId = cleanStr(process.env.S3_ACCESS_KEY_ID);
const envS3SecretAccessKey = cleanStr(process.env.S3_SECRET_ACCESS_KEY);
const envS3Endpoint = cleanStr(process.env.S3_ENDPOINT);
const envS3PublicBaseUrl = cleanStr(process.env.S3_PUBLIC_BASE_URL);

const DEFAULT_DB_SSL_MODE = ON_RENDER ? 'require' : 'auto';

export const env = {
  port: safeInt(process.env.PORT, 3000),
  nodeEnv: envNodeEnv || (ON_RENDER ? 'production' : 'development'),
  onRender: ON_RENDER,
  db: {
    host: envDbHost || 'localhost',
    port: safeInt(process.env.DB_PORT, 5432),
    username: envDbUsername || 'postgres',
    password: envDbPassword || 'postgres',
    database: envDbDatabase || 'schoolpro',
    sslMode: envDbSslMode || DEFAULT_DB_SSL_MODE,
  },
  jwt: {
    secret: envJwtSecret || 'dev-secret-change-in-production',
    expiresIn: envJwtExpiresIn || '7d',
  },
  frontendUrl: envFrontendUrl || RENDER_PUBLIC_URL || 'https://schoolproedu.vercel.app/',
  apiPublicUrl: envApiPublicUrl || RENDER_PUBLIC_URL || 'https://school-pro-lgbk.vercel.app/',
  redis: {
    url: envRedisUrl || 'redis://127.0.0.1:6379',
    enabled: envRedisEnabled !== 'false',
  },
  whatsapp: {
    enabled: envWhatsappEnabled === 'true',
    accountSid: envTwilioAccountSid || '',
    authToken: envTwilioAuthToken || '',
    from: envTwilioWhatsappFrom || '',
    useTemplate: envWhatsappUseTemplate === 'true',
    contentSid: envTwilioContentSid || '',
    statusCallbackUrl: envTwilioStatusCallbackUrl || '',
  },
  sms: {
    from: envTwilioSmsFrom || '',
  },
  demo: {
    enabled: envDemoFeatureEnabled !== 'false',
    db: {
      host: envDemoDbHost || envDbHost || 'localhost',
      port: safeInt(process.env.DEMO_DB_PORT ?? process.env.DB_PORT, 5432),
      username: envDemoDbUsername || envDbUsername || 'postgres',
      password: envDemoDbPassword || envDbPassword || 'postgres',
      database: envDemoDbDatabase || 'school_pro_demo',
      sslMode: envDemoDbSslMode || envDbSslMode || DEFAULT_DB_SSL_MODE,
    },
    jwtTtlMinutes: safeInt(process.env.DEMO_JWT_TTL_MINUTES, 45),
    resetCron: envDemoResetCron || '0 0 */1 * *',
    resetOnBoot: envDemoResetOnBoot === 'true',
    writeRateLimitPerMinute: safeInt(process.env.DEMO_WRITE_RATE_LIMIT_PER_MINUTE, 20),
  },
  storage: {
    driver: (envStorageDriver === 's3' ? 's3' : 'local') as 'local' | 's3',
    maxUploadMb: safeInt(process.env.UPLOAD_MAX_MB, 25),
    s3: {
      bucket: envS3Bucket || '',
      region: envS3Region || 'us-east-1',
      accessKeyId: envS3AccessKeyId || '',
      secretAccessKey: envS3SecretAccessKey || '',
      endpoint: envS3Endpoint || '',
      publicBaseUrl: envS3PublicBaseUrl || '',
    },
  },
};

