export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function parseIntOrDefault(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function parseBooleanOrDefault(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return fallback;
}

export function parseOptionalIntField(fields, key, { min, max, defaultValue }) {
  const raw = fields?.[key];

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(raw), 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  if (parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

export function parseOptionalBooleanField(fields, key, defaultValue) {
  const raw = fields?.[key];

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return null;
}

export function parseOptionalFloatField(fields, key, { min, max, defaultValue }) {
  const raw = fields?.[key];

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const parsed = Number.parseFloat(String(raw));
  if (Number.isNaN(parsed)) {
    return null;
  }

  if (parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}
