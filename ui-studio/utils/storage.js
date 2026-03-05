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

// --- Taller PRO: métricas diarias (sin fotos) ---

/**
 * Métricas del día para un dateKey (YYYY-MM-DD).
 * @param {Array} history - Array de items del historial
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {{ total_scans: number, high_count: number, low_count: number, corrected_count: number, avg_confidence: number|null, median_confidence: number|null, last_scan_at: string|null }}
 */
export function getDailyStats(history, dateKey) {
  const arr = Array.isArray(history) ? history : [];
  let total_scans = 0;
  let high_count = 0;
  let low_count = 0;
  let corrected_count = 0;
  const confidences = [];
  let last_scan_at = null;
  for (const it of arr) {
    const ts = it.timestamp || it.created_at;
    const d = ts ? String(ts).slice(0, 10) : '';
    if (d !== dateKey) continue;
    total_scans++;
    if (it.high_confidence) high_count++;
    if (it.low_confidence) low_count++;
    if (it.correction_used) corrected_count++;
    const conf = it.top1?.confidence ?? it.confidence;
    if (typeof conf === 'number' && !Number.isNaN(conf)) confidences.push(conf);
    if (ts && (!last_scan_at || ts > last_scan_at)) last_scan_at = ts;
  }
  let avg_confidence = null;
  let median_confidence = null;
  if (confidences.length > 0) {
    const sum = confidences.reduce((a, b) => a + b, 0);
    avg_confidence = Math.round((sum / confidences.length) * 100) / 100;
    const sorted = [...confidences].sort((a, b) => a - b);
    median_confidence = sorted[Math.floor((sorted.length - 1) * 0.5)];
  }
  return {
    total_scans,
    high_count,
    low_count,
    corrected_count,
    avg_confidence,
    median_confidence,
    last_scan_at,
  };
}

/**
 * Modelos más frecuentes del día.
 * @param {Array} history - Array de items del historial
 * @param {string} dateKey - YYYY-MM-DD
 * @param {number} limit - Máximo modelos a devolver
 * @returns {Array<{ id_model_ref: string|null, label: string, count: number, high_ratio: number, low_ratio: number }>}
 */
export function getModelFrequency(history, dateKey, limit = 10) {
  const arr = Array.isArray(history) ? history : [];
  const byRef = {};
  for (const it of arr) {
    const ts = it.timestamp || it.created_at;
    const d = ts ? String(ts).slice(0, 10) : '';
    if (d !== dateKey) continue;
    const t1 = it.top1 || it.results?.[0];
    const id = t1?.id_model_ref ?? null;
    const label =
      [t1?.brand, t1?.model].filter(Boolean).join(' ') ||
      t1?.type ||
      t1?.id_model_ref ||
      '—';
    if (!byRef[id]) {
      byRef[id] = { id_model_ref: id, label, count: 0, high: 0, low: 0 };
    }
    byRef[id].count++;
    if (it.high_confidence) byRef[id].high++;
    if (it.low_confidence) byRef[id].low++;
  }
  return Object.values(byRef)
    .map((r) => ({
      id_model_ref: r.id_model_ref,
      label: r.label,
      count: r.count,
      high_ratio: r.count > 0 ? Math.round((r.high / r.count) * 100) / 100 : 0,
      low_ratio: r.count > 0 ? Math.round((r.low / r.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Estadísticas de riesgo del día.
 * @param {Array} history - Array de items del historial
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {{ high_risk_count: number, medium_risk_count: number, top_risk_reasons: string[] }}
 */
export function getRiskStats(history, dateKey) {
  const arr = Array.isArray(history) ? history : [];
  let high_risk_count = 0;
  let medium_risk_count = 0;
  const reasonCounts = {};
  for (const it of arr) {
    const ts = it.timestamp || it.created_at;
    const d = ts ? String(ts).slice(0, 10) : '';
    if (d !== dateKey) continue;
    const lvl = it.debug?.risk_level;
    if (lvl === 'HIGH') high_risk_count++;
    if (lvl === 'MEDIUM') medium_risk_count++;
    const reasons = it.debug?.risk_reasons;
    if (Array.isArray(reasons)) {
      for (const r of reasons) {
        const key = String(r || '').trim() || 'unknown';
        reasonCounts[key] = (reasonCounts[key] || 0) + 1;
      }
    }
  }
  const top_risk_reasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
  return { high_risk_count, medium_risk_count, top_risk_reasons };
}

/**
 * Latencias p50/p95 desde settings.
 * @param {Object} settings - Objeto scn_settings
 * @returns {{ gw_p50: number|null, gw_p95: number|null, motor_p50: number|null, motor_p95: number|null }}
 */
export function getLatencyStatsFromSettings(settings) {
  const s = settings || {};
  const latencies = s.stats?.healthLatencies || [];
  const gw = latencies.map((h) => h.gw).filter((v) => typeof v === 'number');
  const motor = latencies.map((h) => h.motor).filter((v) => typeof v === 'number');
  const gwP = calcPercentiles(gw);
  const motorP = calcPercentiles(motor);
  return {
    gw_p50: gwP.p50,
    gw_p95: gwP.p95,
    motor_p50: motorP.p50,
    motor_p95: motorP.p95,
  };
}

/**
 * Stats de operaciones de cola (feedback) en settings.
 * @param {Object} settings - Objeto scn_settings
 * @returns {{ sentToday: number, failedToday: number, retryStopToday: number }}
 */
export function getQueueOpsStats(settings) {
  const s = settings || {};
  const stats = s.stats || {};
  const today = new Date().toISOString().slice(0, 10);
  if (stats.feedbackStatsDate !== today) {
    return { sentToday: 0, failedToday: 0, retryStopToday: 0 };
  }
  return {
    sentToday: stats.sentToday ?? 0,
    failedToday: stats.failedToday ?? 0,
    retryStopToday: stats.retryStopToday ?? 0,
  };
}
