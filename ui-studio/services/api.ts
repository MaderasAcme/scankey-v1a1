
/**
 * Lead Engineer - ScanKey Core Services
 * Hardened Privacy: Solo persistencia de metadata en historial.
 */

import { engineCache, generateHash } from '../utils/cache';
import { storage } from '../utils/storage';
import { getConnectivitySnapshot } from '../utils/connectivity';
export { toUserMessage } from '../utils/errors';

/**
 * Configuración del Gateway ScanKey.
 */
export const DEFAULT_API_BASE = "https://scankey-gateway-2apb4vvlhq-no.a.run.app";

/**
 * Obtiene la configuración del Gateway desde el storage.
 * Keys exactas: scankey_base_url, scankey_api_key
 */
export const getApiBase = () => {
  const base = storage.get('scankey_base_url') || DEFAULT_API_BASE;
  return base.trim().replace(/\/+$/, '');
};

export const getApiKey = () => (storage.get('scankey_api_key') || '').trim();

export const setApiBase = (url: string) => storage.set('scankey_base_url', (url || '').trim());
export const setApiKey = (key: string) => storage.set('scankey_api_key', (key || '').trim());

const parseError = async (r: Response) => {
  const txt = await r.text().catch(() => '');
  try {
    const j = JSON.parse(txt || '{}');
    return j.detail || j.error || txt || `HTTP ${r.status}`;
  } catch {
    return txt || `HTTP ${r.status}`;
  }
};

const normalizeEngineResponse = (raw: any) => {
  if (!raw) return null;
  const cacheKey = raw.input_id || generateHash(raw);
  const cached = engineCache.get(cacheKey);
  if (cached) return cached;

  const results = Array.isArray(raw.results) ? [...raw.results] : [];
  results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  while (results.length < 3) {
    results.push({
      rank: results.length + 1,
      id_model_ref: `placeholder_${results.length}`,
      type: "Sin identificar",
      confidence: 0,
      explain_text: "No se encontraron más candidatos viables.",
      compatibility_tags: [],
      crop_bbox: null
    });
  }

  const topConfidence = results[0]?.confidence || 0;
  const normalized = {
    input_id: raw.input_id || `gen_${Date.now()}`,
    timestamp: raw.timestamp || new Date().toISOString(),
    manufacturer_hint: {
      found: !!raw.manufacturer_hint?.found,
      name: raw.manufacturer_hint?.name || null,
      confidence: raw.manufacturer_hint?.confidence || 0
    },
    results: results.slice(0, 3),
    high_confidence: raw.high_confidence !== undefined ? raw.high_confidence : topConfidence >= 0.95,
    low_confidence: raw.low_confidence !== undefined ? raw.low_confidence : topConfidence < 0.60,
    manual_correction_hint: raw.manual_correction_hint || { fields: ["marca", "modelo", "tipo"] },
    debug: raw.debug || { model_version: "unknown", processing_time_ms: 0 }
  };

  engineCache.set(cacheKey, normalized);
  return normalized;
};

/**
 * Petición técnica al Gateway.
 */
const postAnalyze = async (frontFile: any, backFile: any) => {
  const base = getApiBase();
  const apiKey = getApiKey();

  // Validaciones con mensajes EXACTOS
  if (!base || base === "") throw new Error('Falta BASE_URL (pégala en Settings)');
  if (!apiKey || apiKey === "") throw new Error('Falta API Key (pégala en Settings)');

  const b64toBlob = async (base64: any) => {
    if (!base64 || typeof base64 !== 'string') return base64;
    if (!base64.startsWith('data:')) return base64;
    const res = await fetch(base64);
    return await res.blob();
  };

  const fd = new FormData();
  const fBlob = await b64toBlob(frontFile);
  const bBlob = await b64toBlob(backFile);

  fd.append('front', fBlob, 'front.jpg');
  fd.append('back', bBlob, 'back.jpg');
  fd.append('image_front', fBlob, 'front.jpg');
  fd.append('image_back', bBlob, 'back.jpg');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const r = await fetch(`${base}/api/analyze-key`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: fd,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!r.ok) {
      const msg = await parseError(r);
      const e: any = new Error(msg);
      e.status = r.status;
      throw e;
    }

    const json = await r.json();
    return normalizeEngineResponse(json);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

/**
 * Lógica de análisis con reintento (Optimized -> Original)
 */
export const analyzeKey = async (front: any, back: any, onAttempt: any) => {
  try {
    if (onAttempt) onAttempt(1);
    return await postAnalyze(front.optimized, back.optimized);
  } catch (e: any) {
    const status = e?.status;
    if (status === 401 || status === 403) throw e; 
    
    console.warn("Intento 1 fallido, ejecutando Intento 2 con originales...");
    if (onAttempt) onAttempt(2);
    return await postAnalyze(front.original, back.original);
  }
};

export const sendFeedback = async (payload: any) => {
  const queueKey = 'sk_feedback_queue';
  
  const addToQueue = (p: any) => {
    const qStr = storage.get(queueKey);
    const q = qStr ? JSON.parse(qStr) : [];
    q.push(p);
    storage.set(queueKey, JSON.stringify(q));
  };

  if (!getConnectivitySnapshot()) {
    addToQueue(payload);
    return { queued: true };
  }

  const base = getApiBase();
  const apiKey = getApiKey();
  if (!apiKey) {
    addToQueue(payload);
    return { queued: true };
  }

  try {
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      addToQueue(payload);
      return { queued: true };
    }
    return await res.json();
  } catch (e) {
    addToQueue(payload);
    return { queued: true };
  }
};

export const flushFeedback = async () => {
  const queueKey = 'sk_feedback_queue';
  const qStr = storage.get(queueKey);
  const queue = qStr ? JSON.parse(qStr) : [];
  
  if (queue.length === 0 || !getConnectivitySnapshot()) return false;
  
  const base = getApiBase();
  const apiKey = getApiKey();
  if (!apiKey) return false;
  
  try {
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(queue[0])
    });
    if (res.ok) {
      queue.shift();
      storage.set(queueKey, JSON.stringify(queue));
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

export const getHealth = async () => {
  const base = getApiBase();
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Falta API Key (pégala en Settings)");
  
  try {
    const res = await fetch(`${base}/health`, { 
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    throw e;
  }
};

export const getQueueLength = () => {
  try {
    const qStr = storage.get('sk_feedback_queue');
    return qStr ? JSON.parse(qStr).length : 0;
  } catch (e) { return 0; }
};

export const saveToHistory = (result: any) => {
  try {
    const hStr = storage.get('sk_history');
    const history = hStr ? JSON.parse(hStr) : [];
    if (!history.find((h: any) => h.input_id === result.input_id)) {
      history.unshift(result);
      storage.set('sk_history', JSON.stringify(history.slice(0, 50)));
    }
  } catch (e) {}
};

export const getHistory = () => {
  try {
    const hStr = storage.get('sk_history');
    return hStr ? JSON.parse(hStr) : [];
  } catch (e) { return []; }
};
