/**
 * Lead Engineer - Storage Abstraction
 * Maneja localStorage con fallbacks para evitar bloqueos en entornos restrictivos.
 * REGLA: No almacenar nunca imágenes ni base64; solo configuración y colas de metadatos (feedback queue, history sin fotos).
 */

export const storage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};
