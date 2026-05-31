const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(require('os').homedir(), '.coderev', 'cache');

/**
 * Generate a cache key from a diff string.
 */
function cacheKey(diff) {
  return crypto.createHash('sha256').update(diff).digest('hex');
}

/**
 * Get cached review result if available and not expired.
 * @param {string} key - Cache key (diff hash)
 * @param {number} ttlMs - Time-to-live in ms (default 24h)
 * @returns {object|null} Cached result or null
 */
function getCached(key, ttlMs = 24 * 60 * 60 * 1000) {
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  try {
    if (!fs.existsSync(cachePath)) return null;
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs > ttlMs) {
      // Expired
      fs.unlinkSync(cachePath);
      return null;
    }
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Store a review result in cache.
 */
function setCached(key, result) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(result), 'utf-8');
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Clear expired cache entries.
 */
function cleanCache(ttlMs = 24 * 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(CACHE_DIR)) return 0;
    let cleared = 0;
    for (const file of fs.readdirSync(CACHE_DIR)) {
      const fullPath = path.join(CACHE_DIR, file);
      const stat = fs.statSync(fullPath);
      if (Date.now() - stat.mtimeMs > ttlMs) {
        fs.unlinkSync(fullPath);
        cleared++;
      }
    }
    return cleared;
  } catch {
    return 0;
  }
}

module.exports = { cacheKey, getCached, setCached, cleanCache };
