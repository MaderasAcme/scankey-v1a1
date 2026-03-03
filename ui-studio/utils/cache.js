
/**
 * Lead Engineer - Memory Management
 * LRU Cache simple para evitar recalcular normalizaciones pesadas.
 */

class SimpleLRU {
  constructor(limit = 25) {
    this.limit = limit;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

export const engineCache = new SimpleLRU(30);
export const historyInMemory = {
  data: null,
  lastRead: 0
};

/**
 * Genera un hash estable para payloads sin ID.
 */
export const generateHash = (obj) => {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};
