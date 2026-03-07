/**
 * Workshop session — storage only (sin dependencia de api).
 * Usado por api.js para añadir X-Workshop-Token sin ciclo.
 */
import { loadJSON, saveJSON, clearKey } from '../utils/storage';

const SESSION_KEY = 'scn_workshop_session';

/**
 * Obtiene la sesión taller actual.
 * @returns {{ token: string, role: string, operator_label: string, logged_at: string } | null}
 */
export function getWorkshopSession() {
  const data = loadJSON(SESSION_KEY, null);
  if (!data || !data.token) return null;
  return {
    token: data.token,
    role: data.role || 'taller',
    operator_label: data.operator_label || '',
    logged_at: data.logged_at || null,
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
