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
