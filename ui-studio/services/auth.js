/**
 * Auth — sesión taller
 * Guarda solo token, role, operator_label, logged_at, expires_at. Nunca email/password.
 */
import { getApiConfig } from './api';
import { setWorkshopSession, clearWorkshopSession } from './workshopSession';
import { TEMP_LOGIN_EMAIL, TEMP_LOGIN_PASSWORD } from '../config/tempWebLogin';

const LOGIN_TIMEOUT_MS = 15000;

/**
 * Login al taller. Llama POST /api/auth/login y guarda sesión.
 * Lanza Error con message = código: API_NOT_CONFIGURED | LOGIN_NOT_CONFIGURED | INVALID_CREDENTIALS | SERVER_ERROR | TIMEOUT | NETWORK_ERROR
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, role: string, operator_label: string }>}
 */
export async function loginWorkshop(email, password) {
  const { base, hasBase } = getApiConfig();
  if (!hasBase || !base) {
    const err = new Error('API_NOT_CONFIGURED');
    err.status = 0;
    throw err;
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LOGIN_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }),
      signal: ac.signal,
    });
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    const isNetwork =
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      (e?.constructor?.name === 'TypeError');
    const err = new Error(e?.name === 'AbortError' ? 'TIMEOUT' : isNetwork ? 'NETWORK_ERROR' : 'NETWORK_ERROR');
    err.status = e?.name === 'AbortError' ? 408 : 0;
    err.cause = e;
    throw err;
  } finally {
    clearTimeout(t);
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 503) {
    const err = new Error(data?.error || 'LOGIN_NOT_CONFIGURED');
    err.status = 503;
    throw err;
  }

  if (res.status === 401) {
    const err = new Error(data?.error || 'INVALID_CREDENTIALS');
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data?.error || 'SERVER_ERROR');
    err.status = res.status;
    throw err;
  }

  const token = (data.workshop_token ?? '').toString().trim();
  if (!token) {
    const err = new Error('INVALID_LOGIN_PAYLOAD');
    err.status = res.status;
    throw err;
  }

  const loggedAt = new Date().toISOString();
  const expiresInDays = Number(data.expires_in_days) || 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const payload = {
    token,
    role: (data.role ?? 'taller').toString().trim() || 'taller',
    operator_label: (data.operator_label ?? 'OPERADOR SENIOR').toString().trim() || 'OPERADOR SENIOR',
    logged_at: loggedAt,
    expires_at: expiresAt.toISOString(),
  };

  setWorkshopSession(payload);
  return payload;
}

/**
 * Temporal web testing login; replace with backend auth when gateway auth is restored.
 * Valida credenciales en frontend sin llamar a /api/auth/login.
 * Lanza Error('INVALID_CREDENTIALS') si no coinciden.
 */
export function loginWorkshopTemporary(email, password) {
  const e = String(email || '').trim();
  const p = String(password || '');
  if (e !== TEMP_LOGIN_EMAIL || p !== TEMP_LOGIN_PASSWORD) {
    const err = new Error('INVALID_CREDENTIALS');
    err.status = 401;
    throw err;
  }
  const loggedAt = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const payload = {
    token: 'temp-web-login',
    role: 'taller',
    operator_label: 'OPERADOR SENIOR',
    logged_at: loggedAt,
    expires_at: expiresAt.toISOString(),
  };
  setWorkshopSession(payload);
  return payload;
}

export { getWorkshopSession, clearWorkshopSession, isWorkshopSessionValid } from './workshopSession';
