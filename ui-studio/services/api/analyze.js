/**
 * Analyze API — analyzeKey.
 */
import { getApiConfig, getApiKey } from './config.js';
import { getWorkshopSession } from '../workshopSession';

function simpleUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
const _isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * Analiza llave(s) con FormData (front + back, image_front + image_back).
 * @param {Object} photos - { A: { optimizedDataUrl, originalDataUrl }, B?: ... }
 * @param {Object} [opts]
 * @returns {Promise<Object>}
 */
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
