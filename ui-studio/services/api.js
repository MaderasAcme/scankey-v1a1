/**
 * Lead Engineer - API Service
 * getApiBase, setApiBase, getApiKey, setApiKey, getHealth, analyzeKey, getApiConfig
 * sendFeedback, flushFeedbackQueue
 * Uses VITE_* env at build, __SCN_CONFIG__/localStorage for runtime override.
 */
import { storage, loadJSON, saveJSON } from '../utils/storage';
import { getWorkshopSession } from './workshopSession';

const KEY_BASE = 'scankey_api_base';
const KEY_API_KEY = 'scankey_api_key';

const ENV_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GATEWAY_BASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 'http://localhost:8080' : '') ||
  '';
const API_KEY_ENV = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || '';

/**
 * Devuelve la configuración API para mostrar banner/error si falta base URL.
 * @returns {{ base: string, hasBase: boolean, fromEnv: boolean }}
 */
export function getApiConfig() {
  const cfg = (typeof globalThis !== 'undefined' && globalThis.__SCN_CONFIG__) || {};
  const fromCfg = (cfg.API_BASE || '').trim();
  const fromStorage = (storage.get(KEY_BASE) || '').trim();
  const base = fromCfg || fromStorage || ENV_BASE;
  return {
    base: base.replace(/\/+$/, ''),
    hasBase: base.length > 0,
    fromEnv: Boolean(ENV_BASE),
  };
}

export function getApiBase() {
  const { base } = getApiConfig();
  return base;
}

export function setApiBase(val) {
  storage.set(KEY_BASE, String(val || '').trim());
}

export function getApiKey() {
  const cfg = (typeof globalThis !== 'undefined' && globalThis.__SCN_CONFIG__) || {};
  const fromCfg = (cfg.API_KEY || '').trim();
  if (fromCfg) return fromCfg;
  return (storage.get(KEY_API_KEY) || '').trim() || API_KEY_ENV;
}

export function setApiKey(val) {
  storage.set(KEY_API_KEY, String(val || '').trim());
}

const DEFAULT_HEALTH_TIMEOUT_MS = 5000;

/**
 * Obtiene deploy-ping.txt (sin cache) para mostrar Build ID y timestamp.
 * @returns {Promise<{ commit: string, deployPing: string }|null>}
 */
export async function getDeployPing() {
  if (typeof window === 'undefined') return null;
  const url = new URL('deploy-ping.txt', window.location.href).href;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const commit = (text.match(/^COMMIT=(.+)$/m) || [])[1]?.trim() || '';
    const deployPing = (text.match(/^DEPLOY_PING=(.+)$/m) || [])[1]?.trim() || '';
    return { commit, deployPing };
  } catch (_) {
    return null;
  }
}

/**
 * Info de build para verificación anti-cache.
 * @returns {Promise<{ commit_from_ping: string|null, deploy_time: string|null, origin: string }|null>}
 */
export async function getBuildInfo() {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin || '';
  const ping = await getDeployPing();
  if (!ping) return { commit_from_ping: null, deploy_time: null, origin };
  return {
    commit_from_ping: ping.commit || null,
    deploy_time: ping.deployPing || null,
    origin,
  };
}

/**
 * Health check del gateway. No lanza errores.
 * Incluye cause para diagnóstico: SIN_RED, CORS_OR_DNS, GATEWAY_DOWN
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, ms: number, body: object|null, request_id?: string, error?: string, cause?: string }>}
 */
export async function getHealth({ timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
  const { base, hasBase } = getApiConfig();
  const start = performance.now();
  const requestId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  if (!hasBase || !base) {
    return { ok: false, status: 0, ms: 0, body: null, request_id: requestId, error: 'API no configurada' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      status: 0,
      ms: 0,
      body: null,
      request_id: requestId,
      error: 'Sin red',
      cause: 'SIN_RED',
    };
  }
  const apiKey = getApiKey();
  const headers = { 'X-Request-ID': requestId };
  if (apiKey) headers['X-API-Key'] = apiKey;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { headers, signal: ac.signal });
    const ms = Math.round(performance.now() - start);
    clearTimeout(t);
    let body = null;
    try {
      body = await res.json();
    } catch (_) {}
    const cause = !res.ok && (res.status >= 500 || res.status === 408) ? 'GATEWAY_DOWN' : undefined;
    return {
      ok: res.ok,
      status: res.status,
      ms,
      body,
      request_id: body?.request_id || res.headers?.get?.('X-Request-ID') || requestId,
      cause,
    };
  } catch (e) {
    clearTimeout(t);
    const ms = Math.round(performance.now() - start);
    const msg = (e.message || '').toLowerCase();
    const isCors =
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      (e.constructor && e.constructor.name === 'TypeError');
    const cause = e.name === 'AbortError' ? 'GATEWAY_DOWN' : isCors ? 'CORS_OR_DNS' : undefined;
    return {
      ok: false,
      status: e.name === 'AbortError' ? 408 : 0,
      ms,
      body: null,
      request_id: requestId,
      error: e.name === 'AbortError' ? 'Timeout' : (e.message || 'Error de red'),
      cause,
    };
  }
}

/**
 * Health check del motor. No lanza errores. Retorna null si no disponible.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, ms: number, body: object|null, request_id?: string }|null>}
 */
export async function getMotorHealth({ timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = {}) {
  const { base, hasBase } = getApiConfig();
  const start = performance.now();
  const requestId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  if (!hasBase || !base) {
    return null;
  }
  const apiKey = getApiKey();
  const headers = { 'X-Request-ID': requestId };
  if (apiKey) headers['X-API-Key'] = apiKey;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/motor/health`, { headers, signal: ac.signal });
    const ms = Math.round(performance.now() - start);
    clearTimeout(t);
    let body = null;
    try {
      body = await res.json();
    } catch (_) {}
    const cause = !res.ok ? 'MOTOR_DOWN' : undefined;
    return {
      ok: res.ok,
      status: res.status,
      ms,
      body,
      request_id: body?.request_id || res.headers?.get?.('X-Request-ID') || requestId,
      cause,
    };
  } catch (_) {
    clearTimeout(t);
    const ms = Math.round(performance.now() - start);
    return {
      ok: false,
      status: 0,
      ms,
      body: null,
      request_id: requestId,
      error: 'Error de red',
      cause: 'MOTOR_DOWN',
    };
  }
}

/** Genera uuid simple (sin crypto si no disponible). */
function simpleUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Convierte dataURL base64 a Blob. */
function dataUrlToBlob(dataUrl) {
  const parts = (dataUrl || '').split(',');
  const base64 = parts[1];
  if (!base64) return null;
  const m = (parts[0] || '').match(/data:([^;]+)/);
  const type = (m && m[1]) || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

const ANALYZE_TIMEOUT_MS = 30000;

/**
 * Analiza llave(s) con FormData (front + back, image_front + image_back).
 * Estructura photos: { A: { optimizedDataUrl, originalDataUrl }, B: { optimizedDataUrl, originalDataUrl } }
 * Intento 1: optimized. Intento 2 (si timeout/5xx/504): original.
 * @param {Object} photos - { A: { optimizedDataUrl, originalDataUrl }, B?: { optimizedDataUrl, originalDataUrl } }
 * @param {Object} [opts]
 * @param {string} [opts.modo] - 'taller' | 'cliente' | ''
 * @param {boolean} [opts.qualityOverride] - envía X-Quality-Override: 1 (P1.1 taller)
 * @param {function(number, number): void} [opts.onAttempt] - (attempt, total)
 * @returns {Promise<Object>} respuesta normalizada (TOP3, contrato)
 */
const _isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

export async function analyzeKey(photos, { modo, qualityOverride, onAttempt } = {}) {
  const { base, hasBase } = getApiConfig();
  if (!hasBase) {
    if (_isDev) console.warn('[scankey] API no configurada. Configure VITE_GATEWAY_BASE_URL en .env.local');
    throw new Error('API no configurada. Indica VITE_GATEWAY_BASE_URL o configura en Perfil.');
  }
  const apiKey = getApiKey();
  const url = `${base}/api/analyze-key`;
  const requestId = simpleUuid();
  if (_isDev) console.log('[scankey] analyze-key', { base, request_id: requestId, hasB: Boolean(photos?.B) });

  const getDataUrl = (side, useOriginal) => {
    const s = photos?.[side];
    if (!s) return null;
    return useOriginal ? (s.originalDataUrl || s.optimizedDataUrl) : (s.optimizedDataUrl || s.originalDataUrl);
  };

  const buildFormData = (useOriginal = false) => {
    const fd = new FormData();
    const frontDataUrl = getDataUrl('A', useOriginal);
    const backDataUrl = getDataUrl('B', useOriginal);
    const frontBlob = frontDataUrl ? dataUrlToBlob(frontDataUrl) : null;
    const backBlob = backDataUrl ? dataUrlToBlob(backDataUrl) : null;
    if (!frontBlob) throw new Error('Imagen frontal (lado A) inválida');
    fd.append('front', frontBlob, 'front.jpg');
    fd.append('image_front', frontBlob, 'front.jpg');
    if (backBlob) {
      fd.append('back', backBlob, 'back.jpg');
      fd.append('image_back', backBlob, 'back.jpg');
    }
    if (modo) fd.append('modo', modo);
    return fd;
  };

  const doRequest = (useOriginal) => {
    const form = buildFormData(useOriginal);
    const headers = { 'X-Request-ID': requestId };
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (qualityOverride) headers['X-Quality-Override'] = '1';
    const ws = getWorkshopSession();
    if (ws?.token) headers['X-Workshop-Token'] = ws.token;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ANALYZE_TIMEOUT_MS);
    return fetch(url, { method: 'POST', headers, body: form, signal: ac.signal })
      .finally(() => clearTimeout(t));
  };

  try {
    if (onAttempt) onAttempt(1, 2);
    let res = await doRequest(false);
    const needsRetry = res.status >= 500 || res.status === 504 || res.status === 0;
    if (needsRetry) {
      if (_isDev) console.log('[scankey] analyze-key retry with original');
      if (onAttempt) onAttempt(2, 2);
      res = await doRequest(true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let body = null;
      try {
        if (text) body = JSON.parse(text);
      } catch (_) {}
      if (res.status === 422 && body && (body.error === 'QUALITY_GATE' || body.error === 'POLICY_BLOCK')) {
        const err = new Error(body.message || (body.error === 'POLICY_BLOCK' ? 'Política de bloqueo' : 'Calidad insuficiente'));
        err.code = body.error;
        err.reasons = body.reasons || [];
        err.debug = body.debug || {};
        throw err;
      }
      throw new Error(`analyze-key ${res.status}: ${text || res.statusText}`);
    }
    const data = await res.json();
    if (_isDev) {
      const top1 = data?.results?.[0];
      console.log('[scankey] analyze-key ok', {
        request_id: data?.request_id,
        results: data?.results?.length,
        top1: top1 ? `${top1.brand || '?'} ${top1.model || ''}`.trim() : null,
      });
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      try {
        if (_isDev) console.log('[scankey] analyze-key retry with original (timeout)');
        if (onAttempt) onAttempt(2, 2);
        const res2 = await doRequest(true);
        if (res2.ok) {
          const data2 = await res2.json();
          if (_isDev) {
            const top1 = data2?.results?.[0];
            console.log('[scankey] analyze-key ok (retry)', {
              request_id: data2?.request_id,
              results: data2?.results?.length,
              top1: top1 ? `${top1.brand || '?'} ${top1.model || ''}`.trim() : null,
            });
          }
          return data2;
        }
        const text = await res2.text();
        throw new Error(`analyze-key ${res2.status}: ${text || res2.statusText}`);
      } catch (e2) {
        throw new Error(`Timeout en analyze-key tras reintento: ${e2.message || e2}`);
      }
    }
    throw e;
  }
}

const FEEDBACK_QUEUE_KEY = 'scn_feedback_queue';
const FEEDBACK_TIMEOUT_MS = 15000;

/**
 * Normaliza manual_data/manual para hash determinista.
 * Orden estable de claves, valores como string.
 */
function _normalizeManualForKey(manual) {
  if (!manual || typeof manual !== 'object') return {};
  const out = {};
  for (const k of Object.keys(manual).sort()) {
    const v = manual[k];
    if (v == null) out[k] = '';
    else if (typeof v === 'object') out[k] = JSON.stringify(v, Object.keys(v).sort());
    else out[k] = String(v).trim();
  }
  return out;
}

/**
 * Genera idempotency key determinista para feedback.
 * Hash de: input_id, selected_id, correction, chosen_rank, manual_data normalizado.
 * No usa campos volátiles (timestamp, etc.) para que reintentos usen la misma key.
 * @param {Object} payload - { input_id, selected_id?, selected_id_model_ref?, correction, selected_rank?, chosen_rank?, manual?, manual_data? }
 * @returns {Promise<string>} hex SHA-256
 */
export async function computeFeedbackIdempotencyKey(payload) {
  const inputId = (payload?.input_id || payload?.job_id || '').toString().trim();
  const selected =
    (payload?.selected_id || payload?.selected_id_model_ref || payload?.id_model_ref || '').toString().trim() ||
    (payload?.choice && typeof payload.choice === 'object'
      ? (payload.choice.id_model_ref || payload.choice.selected_id || '').toString().trim()
      : '');
  const correction = Boolean(payload?.correction);
  const rank = payload?.chosen_rank ?? payload?.selected_rank;
  const rankStr = rank != null ? String(rank) : '';
  const manual = payload?.manual_data || payload?.manual;
  const manualNorm = _normalizeManualForKey(manual);
  const manualStr = JSON.stringify(
    Object.fromEntries(Object.entries(manualNorm).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  );
  const canonical = `${inputId}|${selected}|${correction}|${rankStr}|${manualStr}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback sync simple (djb2) — no criptográfico, solo para dev/legacy
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) h = ((h << 5) + h) ^ canonical.charCodeAt(i);
  return (h >>> 0).toString(16) + canonical.length.toString(36);
}

function _isRetryableError(err) {
  const msg = (err && err.message) || String(err);
  return (
    err?.name === 'AbortError' ||
    msg.includes('timeout') ||
    msg.includes('504') ||
    msg.includes('5xx') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('RETRYABLE')
  );
}

/**
 * Envía feedback al backend. Siempre envía Idempotency-Key.
 * Si payload.idempotency_key existe, la reutiliza; si no, la genera determinísticamente.
 * Si timeout/5xx/504/red => lanza error con message "RETRYABLE".
 * @param {Object} payload - { input_id, request_id, modo, selected_rank, selected_id_model_ref, correction, manual, meta, idempotency_key? }
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=15000]
 * @returns {Promise<{ ok: boolean, deduped?: boolean }>}
 */
export async function sendFeedback(payload, { timeoutMs = FEEDBACK_TIMEOUT_MS } = {}) {
  const { base, hasBase } = getApiConfig();
  if (!hasBase) {
    throw new Error('API no configurada. Indica VITE_GATEWAY_BASE_URL.');
  }
  const apiKey = getApiKey();
  const url = `${base}/api/feedback`;
  const requestId = payload.request_id || simpleUuid();
  let idempotencyKey = payload.idempotency_key;
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    idempotencyKey = await computeFeedbackIdempotencyKey(payload);
  }
  const toSend = { ...payload, request_id: requestId };
  if (toSend.selected_id != null && toSend.selected_id_model_ref == null) {
    toSend.selected_id_model_ref = toSend.selected_id;
  }
  const body = JSON.stringify(toSend);
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    'Idempotency-Key': idempotencyKey,
  };
  if (apiKey) headers['X-API-Key'] = apiKey;
  const ws = getWorkshopSession();
  if (ws?.token) headers['X-Workshop-Token'] = ws.token;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: ac.signal,
    }).finally(() => clearTimeout(t));

    if (res.status >= 200 && res.status < 300) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, ...data };
    }

    const text = await res.text();
    const err = new Error(`feedback ${res.status}: ${text || res.statusText}`);
    if (res.status >= 500 || res.status === 504) {
      err.message = 'RETRYABLE';
      throw err;
    }
    throw err;
  } catch (e) {
    if (e.name === 'AbortError' || _isRetryableError(e)) {
      const retryErr = new Error('RETRYABLE');
      retryErr.cause = e;
      throw retryErr;
    }
    throw e;
  }
}

const SETTINGS_KEY = 'scn_settings';

function _ensureFeedbackStatsDate(stats) {
  const today = new Date().toISOString().slice(0, 10);
  if (stats.feedbackStatsDate !== today) {
    stats.feedbackStatsDate = today;
    stats.sentToday = 0;
    stats.failedToday = 0;
    stats.retryStopToday = 0;
  }
  return stats;
}

/**
 * Procesa la cola de feedback local. Envía en orden FIFO.
 * Si un item falla con RETRYABLE => para y devuelve resumen.
 * Si falla 4xx => lo quita de la cola (no reintentar).
 * Contabiliza sentToday, failedToday, retryStopToday en scn_settings.stats.
 * @param {Object} [opts]
 * @param {function(number, number): void} [opts.onProgress] - (sent, remaining)
 * @param {function(Object): void} [opts.onSent] - (payload) por cada envío exitoso
 * @returns {{ sent: number, remaining: number, failed: number }}
 */
export async function flushFeedbackQueue({ onProgress, onSent } = {}) {
  const queue = loadJSON(FEEDBACK_QUEUE_KEY, []);
  if (!Array.isArray(queue) || queue.length === 0) {
    return { sent: 0, remaining: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  let retryStop = false;
  const remaining = [];

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await sendFeedback(item);
      sent++;
      if (onSent) onSent(item);
      if (onProgress) onProgress(sent, queue.length - i - 1);
    } catch (e) {
      if (e.message === 'RETRYABLE' || _isRetryableError(e)) {
        remaining.push(...queue.slice(i));
        retryStop = true;
        break;
      } else {
        failed++;
      }
    }
  }

  const s = loadJSON(SETTINGS_KEY, {});
  const stats = _ensureFeedbackStatsDate(s.stats || {});
  stats.sentToday = (stats.sentToday || 0) + sent;
  stats.failedToday = (stats.failedToday || 0) + failed;
  if (retryStop) stats.retryStopToday = (stats.retryStopToday || 0) + 1;
  saveJSON(SETTINGS_KEY, { ...s, stats });

  saveJSON(FEEDBACK_QUEUE_KEY, remaining);
  return { sent, remaining: remaining.length, failed: queue.length - sent - remaining.length };
}

export function isRetryableError(e) {
  return e?.message === 'RETRYABLE' || _isRetryableError(e);
}

export function getFeedbackQueue() {
  return loadJSON(FEEDBACK_QUEUE_KEY, []);
}

/**
 * Item seguro para cola: idempotency_key, input_id, selected_id, correction, manual_data, created_at + meta API.
 * Nunca guarda imágenes/base64. Si item no trae idempotency_key, la genera.
 */
function _buildFeedbackQueueItem(item) {
  const created = item.created_at || new Date().toISOString();
  const base = {
    input_id: item.input_id,
    selected_id: item.selected_id ?? item.selected_id_model_ref ?? null,
    correction: Boolean(item.correction),
    manual_data: item.manual_data ?? item.manual ?? null,
    created_at: created,
  };
  const meta = {
    request_id: item.request_id,
    modo: item.modo,
    selected_rank: item.selected_rank,
    meta: item.meta,
  };
  return { ...base, ...meta };
}

/**
 * Añade feedback a la cola. Guarda solo metadatos (nunca imágenes).
 * Si item no trae idempotency_key, la genera determinísticamente.
 * En reintentos (flush), se reutiliza la misma key.
 */
export async function enqueueFeedback(item) {
  let idempotencyKey = item.idempotency_key;
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    idempotencyKey = await computeFeedbackIdempotencyKey(item);
  }
  const safe = _buildFeedbackQueueItem(item);
  safe.idempotency_key = idempotencyKey;
  const queue = loadJSON(FEEDBACK_QUEUE_KEY, []);
  queue.push(safe);
  saveJSON(FEEDBACK_QUEUE_KEY, queue);
}
