// src/utils/cache.js

const cache = new Map();
const TTL = 30 * 1000; // 30 seconds

export function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + TTL });
}

export function cacheDelete(key) {
  cache.delete(key);
}

export function cacheClear() {
  cache.clear();
}

export function cacheDeletePattern(pattern) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}
