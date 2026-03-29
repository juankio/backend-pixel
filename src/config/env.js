import dotenv from 'dotenv';

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

const maxFileSizeMb = toInt(process.env.MAX_FILE_SIZE_MB, 5);

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  HOST: process.env.HOST || '0.0.0.0',
  PORT: toInt(process.env.PORT, 3000),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  MAX_FILE_SIZE_MB: maxFileSizeMb,
  MAX_FILE_SIZE_BYTES: maxFileSizeMb * 1024 * 1024,
  MAX_UPLOAD_FILES: toInt(process.env.MAX_UPLOAD_FILES, 1),

  DEFAULT_SCALE: toInt(process.env.DEFAULT_SCALE, 2),
  DEFAULT_MODE: process.env.DEFAULT_MODE || 'quality',
  DEFAULT_THRESHOLD: toInt(process.env.DEFAULT_THRESHOLD, 160),
  DEFAULT_TURD_SIZE: toInt(process.env.DEFAULT_TURD_SIZE, 2),
  DEFAULT_OPT_CURVE: toBool(process.env.DEFAULT_OPT_CURVE, true),
  DEFAULT_OPT_TOLERANCE: toFloat(process.env.DEFAULT_OPT_TOLERANCE, 0.2),
  DEFAULT_COLOR_MODE: process.env.DEFAULT_COLOR_MODE || 'monochrome',
  DEFAULT_PALETTE_SIZE: toInt(process.env.DEFAULT_PALETTE_SIZE, 4),

  PROCESS_CONCURRENCY: toInt(process.env.PROCESS_CONCURRENCY, 4),
  CACHE_TTL_SECONDS: toInt(process.env.CACHE_TTL_SECONDS, 300),
  CACHE_MAX_ITEMS: toInt(process.env.CACHE_MAX_ITEMS, 250)
});

export default env;
