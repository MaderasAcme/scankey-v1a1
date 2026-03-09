/**
 * Feedback API — sendFeedback, queue, flush, idempotency.
 */
import { getApiConfig, getApiKey } from './config.js';
import { getWorkshopSession } from '../workshopSession';
import { loadJSON, saveJSON } from '../../utils/storage';

const FEEDBACK_QUEUE_KEY = 'scn_feedback_queue';
const FEEDBACK_TIMEOUT_MS = 15000;
const SETTINGS_KEY = 'scn_settings';

function simpleUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
