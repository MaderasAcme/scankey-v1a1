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
