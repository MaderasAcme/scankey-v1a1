/**
 * Config API — base URL, API key, getApiConfig.
 */
import { storage } from '../../utils/storage';

const KEY_BASE = 'scankey_api_base';
const KEY_API_KEY = 'scankey_api_key';

const ENV_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GATEWAY_BASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 'http://localhost:8080' : '') ||
  '';
const API_KEY_ENV = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || '';

const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * Devuelve la configuración API para mostrar banner/error si falta base URL.
 * Prioridad: globalThis > ENV > localStorage
 * @returns {{ base: string, hasBase: boolean, fromEnv: boolean }}
 */
export function getApiConfig() {
  const cfg = (typeof globalThis !== 'undefined' && globalThis.__SCN_CONFIG__) || {};
  const fromGlobal = (cfg.API_BASE || '').trim();
  const envBase = (ENV_BASE || '').trim();
  const fromStorage = (storage.get(KEY_BASE) || '').trim();
  let base = '';
  let source = '';
  if (fromGlobal) {
    base = fromGlobal;
    source = 'global';
  } else if (envBase) {
    base = envBase;
    source = 'env';
  } else {
    base = fromStorage;
    source = 'storage';
  }
  if (DEV) {
    // eslint-disable-next-line no-console
    console.log('[scankey] API base source:', source);
  }
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

/**
 * Prioridad: globalThis > ENV > localStorage
 */
export function getApiKey() {
  const cfg = (typeof globalThis !== 'undefined' && globalThis.__SCN_CONFIG__) || {};
  const fromGlobal = (cfg.API_KEY || '').trim();
  const fromEnv = (API_KEY_ENV || '').trim();
  const fromStorage = (storage.get(KEY_API_KEY) || '').trim();
  let key = '';
  let source = '';
  if (fromGlobal) {
    key = fromGlobal;
    source = 'global';
  } else if (fromEnv) {
    key = fromEnv;
    source = 'env';
  } else {
    key = fromStorage;
    source = 'storage';
  }
  if (DEV) {
    // eslint-disable-next-line no-console
    console.log('[scankey] API key source:', source);
  }
  return key;
}

export function setApiKey(val) {
  storage.set(KEY_API_KEY, String(val || '').trim());
}
