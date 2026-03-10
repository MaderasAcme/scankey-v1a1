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

function _devLog(tag, obj) {
  if (_isDev) console.log(`[scankey] ${tag}`, obj);
}

/**
 * Traducción de errores HTTP a mensajes claros para el usuario.
 */
function _userFacingError(status, text, body) {
  if (status === 401) {
    const detail = (body?.detail || text || '').toLowerCase();
    if (detail.includes('api key') || detail.includes('inválida')) {
      return 'API key inválida o no configurada. Configura VITE_API_KEY en .env.local (local) o en variables de build (producción).';
    }
    return 'No autorizado. Verifica la API key en Perfil.';
  }
  if (status === 400) {
    const detail = body?.detail || text || '';
    if (detail.includes('imagen') || detail.includes('image')) {
      return `Imagen inválida: ${detail}`;
    }
    return detail || 'Solicitud inválida.';
  }
  if (status === 0 || status === undefined) {
    return 'No se pudo conectar. Comprueba la URL del gateway (CORS, red) y que el backend esté levantado.';
  }
  if (status >= 500 || status === 504) {
    return `Gateway no disponible (${status}). Reintenta más tarde.`;
  }
  return text || `Error del gateway: ${status}`;
}

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
  _devLog('analyze-key start', { base, url, request_id: requestId, hasB: Boolean(photos?.B), hasApiKey: Boolean(apiKey) });

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
    let res;
    try {
      res = await doRequest(false);
    } catch (fetchErr) {
      _devLog('analyze-key fetch failed', { error: fetchErr?.message, name: fetchErr?.name });
      const msg = fetchErr?.message || String(fetchErr);
      if (msg === 'Failed to fetch' || fetchErr?.name === 'TypeError') {
        throw new Error(_userFacingError(0, msg));
      }
      throw fetchErr;
    }
    _devLog('analyze-key response', { status: res.status, ok: res.ok });
    const needsRetry = res.status >= 500 || res.status === 504 || res.status === 0;
    if (needsRetry) {
      _devLog('analyze-key retry with original', { status: res.status });
      if (onAttempt) onAttempt(2, 2);
      res = await doRequest(true);
      _devLog('analyze-key retry response', { status: res.status, ok: res.ok });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let body = null;
      try {
        if (text) body = JSON.parse(text);
      } catch (_) {}
      _devLog('analyze-key error', { status: res.status, body });
      if (res.status === 422 && body && (body.error === 'QUALITY_GATE' || body.error === 'POLICY_BLOCK')) {
        const err = new Error(body.message || (body.error === 'POLICY_BLOCK' ? 'Política de bloqueo' : 'Calidad insuficiente'));
        err.code = body.error;
        err.reasons = body.reasons || [];
        err.debug = body.debug || {};
        throw err;
      }
      throw new Error(_userFacingError(res.status, text || res.statusText, body));
    }
    const data = await res.json();
    const hasResults = Array.isArray(data?.results) && data.results.length > 0;
    _devLog('analyze-key ok', {
      request_id: data?.request_id,
      results_count: data?.results?.length,
      has_results: hasResults,
      top1: hasResults ? `${data.results[0]?.brand || '?'} ${data.results[0]?.model || ''}`.trim() : null,
    });
    if (!hasResults) {
      _devLog('analyze-key warn', { message: 'payload sin results válidos', keys: Object.keys(data || {}) });
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      _devLog('analyze-key timeout, retrying with original', {});
      try {
        if (onAttempt) onAttempt(2, 2);
        const res2 = await doRequest(true);
        if (res2.ok) {
          const data2 = await res2.json();
          _devLog('analyze-key ok (timeout retry)', {
            request_id: data2?.request_id,
            results: data2?.results?.length,
          });
          return data2;
        }
        const text = await res2.text();
        let body = null;
        try {
          if (text) body = JSON.parse(text);
        } catch (_) {}
        throw new Error(_userFacingError(res2.status, text || res2.statusText, body));
      } catch (e2) {
        if (e2.message && !e2.message.startsWith('Gateway') && !e2.message.startsWith('API') && !e2.message.startsWith('No se')) {
          throw new Error(`Timeout en analyze-key tras reintento: ${e2.message || e2}`);
        }
        throw e2;
      }
    }
    throw e;
  }
}
