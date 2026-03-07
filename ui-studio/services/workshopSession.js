/**
 * Workshop session — storage only (sin dependencia de api).
 * Usado por api.js para añadir X-Workshop-Token sin ciclo.
 */
import { loadJSON, saveJSON, clearKey } from '../utils/storage';

const SESSION_KEY = 'scn_workshop_session';

const EXPIRES_IN_DAYS = 7;

/**
 * Comprueba si la sesión existe y no ha expirado.
 * @returns {boolean}
 */
export function isWorkshopSessionValid() {
  const data = loadJSON(SESSION_KEY, null);
  if (!data || !data.token) return false;
  let expiresAt = data.expires_at;
  if (!expiresAt && data.logged_at) {
    const logged = new Date(data.logged_at);
    logged.setDate(logged.getDate() + EXPIRES_IN_DAYS);
    expiresAt = logged.toISOString();
  }
  if (expiresAt) {
    try {
      if (new Date(expiresAt) <= new Date()) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

/**
 * Obtiene la sesión taller actual. Devuelve null si no hay sesión o ha expirado.
 * @returns {{ token: string, role: string, operator_label: string, logged_at: string, expires_at?: string } | null}
 */
export function getWorkshopSession() {
  const data = loadJSON(SESSION_KEY, null);
  if (!data || !data.token) return null;
  if (!isWorkshopSessionValid()) return null;
  return {
    token: data.token,
    role: data.role || 'taller',
    operator_label: data.operator_label || '',
    logged_at: data.logged_at || null,
    expires_at: data.expires_at || null,
  };
}

/**
 * Guarda sesión (solo para loginWorkshop).
 */
export function setWorkshopSession(payload) {
  saveJSON(SESSION_KEY, payload);
}

/**
 * Limpia la sesión taller.
 */
export function clearWorkshopSession() {
  clearKey(SESSION_KEY);
}
