/**
 * Lead Engineer - Storage Abstraction
 * Maneja localStorage con metadatos únicamente. NO almacenar imágenes/base64.
 * Keys: scn_history, scn_feedback_queue, scn_settings
 */

const SENSITIVE_PREFIXES = ['data:image', 'data:application'];

function isSensitiveValue(v) {
  if (typeof v !== 'string') return false;
  return SENSITIVE_PREFIXES.some((p) => v.startsWith(p));
}

const SENSITIVE_KEYS = [
  'image',
  'photo',
  'dataUrl',
  'base64',
  'blob',
  'originalDataUrl',
  'optimizedDataUrl',
];

/**
 * Sanitiza objeto antes de guardar. Elimina campos sospechosos de contener imágenes.
 */
export function sanitizeStoredObject(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (SENSITIVE_KEYS.some((sk) => key.includes(sk.toLowerCase()))) continue;
    if (isSensitiveValue(v)) continue;
    if (typeof v === 'object' && v !== null) {
      out[k] = sanitizeStoredObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const storage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set: (key, value) => {
    if (typeof value === 'string' && isSensitiveValue(value)) return;
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },
};

/**
 * Carga JSON desde storage con fallback.
 */
export function loadJSON(key, fallback = null) {
  const raw = storage.get(key);
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed != null ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Guarda JSON (objeto/array). Sanitiza antes de guardar.
 */
export function saveJSON(key, value) {
  const sanitized = sanitizeStoredObject(value);
  const str = JSON.stringify(sanitized);
  if (isSensitiveValue(str)) return;
  storage.set(key, str);
}

/**
 * Añade item al principio de un array, limitado a `limit` elementos.
 */
export function safePushLimited(key, item, limit = 100) {
  const arr = loadJSON(key, []);
  if (!Array.isArray(arr)) return;
  const sanitized = sanitizeStoredObject(item);
  if (sanitized == null) return;
  const next = [sanitized, ...arr].slice(0, limit);
  storage.set(key, JSON.stringify(next));
}

export function clearKey(key) {
  storage.remove(key);
}

/**
 * Actualiza un item del historial por input_id.
 */
export function updateHistoryByInputId(inputId, updates) {
  const arr = loadJSON('scn_history', []);
  if (!Array.isArray(arr)) return;
  const idx = arr.findIndex((it) => it.input_id === inputId);
  if (idx < 0) return;
  const merged = { ...arr[idx], ...sanitizeStoredObject(updates) };
  arr[idx] = merged;
  storage.set('scn_history', JSON.stringify(arr));
}

/**
 * Métricas del historial (sin fotos).
 * @param {Array} history - Array de items del historial
 * @returns {{ total: number, todayCount: number, highCount: number, lowCount: number, avgConfidence: number|null, lastScanAt: string|null }}
 */
export function getHistoryStats(history) {
  const arr = Array.isArray(history) ? history : [];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let todayCount = 0;
  let highCount = 0;
  let lowCount = 0;
  let sumConf = 0;
  let confCount = 0;
  let lastScanAt = null;
  for (const it of arr) {
    const ts = it.timestamp || it.created_at;
    if (ts) {
      const d = String(ts).slice(0, 10);
      if (d === today) todayCount++;
      if (!lastScanAt || ts > lastScanAt) lastScanAt = ts;
    }
    if (it.high_confidence) highCount++;
    if (it.low_confidence) lowCount++;
    const conf = it.top1?.confidence ?? it.confidence;
    if (typeof conf === 'number') {
      sumConf += conf;
      confCount++;
    }
  }
  const avgConfidence = confCount > 0 ? Math.round((sumConf / confCount) * 100) / 100 : null;
  return {
    total: arr.length,
    todayCount,
    highCount,
    lowCount,
    avgConfidence,
    lastScanAt,
  };
}

/**
 * Métricas de la cola de feedback.
 * @param {Array} queue - Cola de feedback
 * @returns {{ pending: number, oldestPendingAt: string|null }}
 */
export function getQueueStats(queue) {
  const arr = Array.isArray(queue) ? queue : [];
  let oldestPendingAt = null;
  for (const it of arr) {
    const at = it.created_at || it.timestamp;
    if (at && (!oldestPendingAt || at < oldestPendingAt)) oldestPendingAt = at;
  }
  return {
    pending: arr.length,
    oldestPendingAt,
  };
}

const SETTINGS_KEY = 'scn_settings';
const HEALTH_HISTORY_LIMIT = 50;

/**
 * Calcula percentiles p50 y p95 de un array de números.
 * @param {number[]} values - Valores numéricos (se filtran no-números)
 * @returns {{ p50: number|null, p95: number|null }}
 */
export function calcPercentiles(values) {
  const arr = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (arr.length === 0) return { p50: null, p95: null };
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const p50Idx = Math.floor((n - 1) * 0.5);
  const p95Idx = Math.floor((n - 1) * 0.95);
  return {
    p50: sorted[p50Idx],
    p95: sorted[p95Idx],
  };
}

/**
 * Actualiza timestamps de salud en scn_settings (solo metadatos).
 * Si ok, también añade latencia al historial circular (max 50).
 * @param {boolean} ok - true si health OK, false si falló
 * @param {number} [gwMs] - Latencia gateway en ms (solo si ok)
 * @param {number|null} [motorMs] - Latencia motor en ms (solo si ok)
 */
export function updateHealthStats(ok, gwMs, motorMs) {
  const s = loadJSON(SETTINGS_KEY, {});
  const stats = s.stats || {};
  const now = new Date().toISOString();
  if (ok) {
    stats.lastHealthOkAt = now;
    if (typeof gwMs === 'number' && !Number.isNaN(gwMs)) {
      const history = Array.isArray(stats.healthLatencies) ? stats.healthLatencies : [];
      const entry = { ts: Date.now(), gw: Number(gwMs), motor: motorMs != null ? Number(motorMs) : null };
      stats.healthLatencies = [entry, ...history].slice(0, HEALTH_HISTORY_LIMIT);
    }
  } else {
    stats.lastHealthFailAt = now;
  }
  saveJSON(SETTINGS_KEY, { ...s, stats });
}

/**
 * Lee stats de salud desde scn_settings.
 * @returns {{ lastHealthOkAt?: string, lastHealthFailAt?: string, healthLatencies?: Array<{ts:number,gw:number,motor:number|null}>, sentToday?: number, failedToday?: number, retryStopToday?: number }}
 */
export function getHealthStats() {
  const s = loadJSON(SETTINGS_KEY, {});
  return s.stats || {};
}
