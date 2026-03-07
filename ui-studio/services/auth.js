/**
 * Auth — sesión taller
 * Guarda solo token, role, operator_label, logged_at. Nunca email/password.
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

  if (res.status === 401 || !data?.ok) {
    const err = new Error(data?.error || 'INVALID_CREDENTIALS');
    err.status = res.status;
    throw err;
  }

  const payload = {
    token: data.workshop_token || '',
    role: data.role || 'taller',
    operator_label: data.operator_label || 'OPERADOR SENIOR',
    logged_at: new Date().toISOString(),
  };

  setWorkshopSession(payload);
  return payload;
}

export { getWorkshopSession, clearWorkshopSession } from './workshopSession';
