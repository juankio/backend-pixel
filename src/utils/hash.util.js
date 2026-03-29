import crypto from 'node:crypto';

export function buildCacheKey(buffer, options) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  hash.update(JSON.stringify(options));
  return hash.digest('hex');
}
