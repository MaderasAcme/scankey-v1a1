/**
 * Auth — sesión taller
 * Guarda solo token, role, operator_label, logged_at, expires_at. Nunca email/password.
 */
import { getApiConfig } from './api';
import { setWorkshopSession, clearWorkshopSession } from './workshopSession';

/**
 * Login al taller. Llama POST /api/auth/login y guarda sesión.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, role: string, operator_label: string }>}
 */
export async function loginWorkshop(email, password) {
  const { base, hasBase } = getApiConfig();
  if (!hasBase || !base) {
    throw new Error('API no configurada');
  }

  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 503) {
    const err = new Error(data?.error || 'LOGIN_NOT_CONFIGURED');
    err.status = 503;
    throw err;
  }

  if (res.status === 401 || !data?.ok) {
    const err = new Error(data?.error || 'INVALID_CREDENTIALS');
    err.status = res.status;
    throw err;
  }

  const loggedAt = new Date().toISOString();
  const expiresInDays = Number(data.expires_in_days) || 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const payload = {
    token: data.workshop_token || '',
    role: data.role || 'taller',
    operator_label: data.operator_label || 'OPERADOR SENIOR',
    logged_at: loggedAt,
    expires_at: expiresAt.toISOString(),
  };

  setWorkshopSession(payload);
  return payload;
}

export { getWorkshopSession, clearWorkshopSession, isWorkshopSessionValid } from './workshopSession';
