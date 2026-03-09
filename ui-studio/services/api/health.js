/**
 * Health API — deploy ping, build info, gateway/motor health.
 */
import { getApiConfig, getApiKey } from './config.js';

const DEFAULT_HEALTH_TIMEOUT_MS = 5000;

function simpleUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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
  const requestId = simpleUuid();
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
  const requestId = simpleUuid();
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
