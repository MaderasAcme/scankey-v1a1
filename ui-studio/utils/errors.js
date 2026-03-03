
/**
 * Lead Engineer - Error Management
 */

export const classifyError = (err) => {
  if (err.name === 'AbortError') return "timeout";
  if (!navigator.onLine || err.message.includes('Network')) return "network";
  if (err.message.includes('HTTP')) return "http";
  return "unknown";
};

export const toUserMessage = (err) => {
  const kind = classifyError(err);
  
  const messages = {
    timeout: "Tiempo agotado. Mejora la luz y reintenta.",
    network: "Sin conexión. Verifica tu red Wi-Fi o datos.",
    http: "Error en el servidor. Reintentando...",
    unknown: "No se pudo analizar. Reintenta de nuevo."
  };

  return messages[kind] || messages.unknown;
};
