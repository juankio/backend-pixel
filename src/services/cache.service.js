import { LRUCache } from 'lru-cache';
import env from '../config/env.js';

class VectorCacheService {
  constructor() {
    this.cache = new LRUCache({
      max: env.CACHE_MAX_ITEMS,
      ttl: env.CACHE_TTL_SECONDS * 1000
    });
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value) {
    this.cache.set(key, value);
  }

  stats() {
    return {
      size: this.cache.size,
      max: this.cache.max,
      ttlMs: this.cache.ttl
    };
  }
}

export const vectorCacheService = new VectorCacheService();
