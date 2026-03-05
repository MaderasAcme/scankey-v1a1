/**
 * Lead Engineer - API Service
 * getApiBase, setApiBase, getApiKey, setApiKey, getHealth, analyzeKey
 * Uses VITE_* env at build, localStorage for runtime override.
 */
import { storage } from '../utils/storage';

const KEY_BASE = 'scankey_api_base';
const KEY_API_KEY = 'scankey_api_key';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GATEWAY_BASE_URL) || 'https://TU_GATEWAY_AQUI';
const API_KEY_ENV = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || '';

export function getApiBase() {
  const cfg = (typeof globalThis !== 'undefined' && globalThis.__SCN_CONFIG__) || {};
  const fromCfg = (cfg.API_BASE || '').trim();
  if (fromCfg) return fromCfg;
  return (storage.get(KEY_BASE) || '').trim() || BASE;
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

export async function getHealth() {
  const base = getApiBase().replace(/\/+$/, '');
  const apiKey = getApiKey();
  const headers = {};
  if (apiKey) headers['X-API-Key'] = apiKey;
  const res = await fetch(`${base}/health`, { headers });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/** Genera uuid simple (sin crypto si no disponible). */
function simpleUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Convierte dataURL base64 a Blob (image/jpeg). */
function dataUrlToBlob(dataUrl) {
  const [, base64] = (dataUrl || '').split(',');
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

const ANALYZE_TIMEOUT_MS = 30000;

/**
 * Analiza llave(s) con FormData robusto (front + back, image_front + image_back).
 * Intento 1: optimized. Intento 2 (si timeout/5xx/504): original.
 * @param {Object} opts
 * @param {string} opts.frontDataUrl - dataURL (base64) imagen frontal
 * @param {string} [opts.backDataUrl] - dataURL (base64) imagen trasera, opcional
 * @param {string} [opts.modo] - 'taller' | 'cliente' | ''
 * @param {function(number, number): void} [opts.onAttempt] - (attempt, total) e.g. (1,2) / (2,2)
 * @returns {Promise<Object>} respuesta normalizada (TOP3, contrato)
 */
export async function analyzeKey({ frontDataUrl, backDataUrl, modo, onAttempt }) {
  const base = getApiBase().replace(/\/+$/, '');
  const apiKey = getApiKey();
  const url = `${base}/api/analyze-key`;
  const requestId = simpleUuid();

  const buildFormData = () => {
    const fd = new FormData();
    const frontBlob = dataUrlToBlob(frontDataUrl);
    const backBlob = backDataUrl ? dataUrlToBlob(backDataUrl) : null;
    if (!frontBlob) throw new Error('Imagen frontal inválida');
    fd.append('front', frontBlob, 'front.jpg');
    fd.append('image_front', frontBlob, 'front.jpg');
    if (backBlob) {
      fd.append('back', backBlob, 'back.jpg');
      fd.append('image_back', backBlob, 'back.jpg');
    }
    if (modo) fd.append('modo', modo);
    return fd;
  };

  const doRequest = (attempt) => {
    const form = buildFormData();
    const headers = {
      'X-Request-ID': requestId,
    };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ANALYZE_TIMEOUT_MS);
    return fetch(url, {
      method: 'POST',
      headers,
      body: form,
      signal: ac.signal,
    }).finally(() => clearTimeout(t));
  };

  try {
    if (onAttempt) onAttempt(1, 2);
    let res = await doRequest(1);
    const needsRetry = res.status >= 500 || res.status === 504 || res.status === 0;
    if (needsRetry) {
      if (onAttempt) onAttempt(2, 2);
      res = await doRequest(2);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`analyze-key ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      try {
        if (onAttempt) onAttempt(2, 2);
        const res2 = await doRequest(2);
        if (res2.ok) return res2.json();
        const text = await res2.text();
        throw new Error(`analyze-key ${res2.status}: ${text || res2.statusText}`);
      } catch (e2) {
        throw new Error(`Timeout en analyze-key tras reintento: ${e2.message || e2}`);
      }
    }
    throw e;
  }
}
