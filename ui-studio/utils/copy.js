
/**
 * Lead Engineer - Microcopy Source of Truth
 */
export const copy = {
  common: {
    loading: "Analizando...",
    retry: "Reintentar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    save: "Guardar",
    error: "No se pudo analizar. Reintenta de nuevo.",
    offline: "Necesitas internet para escanear",
    privacy: "Privacidad Protegida",
  },
  scan: {
    title: "Escaneo",
    sideA: "Lado A",
    sideB: "Lado B",
    captured: "Capturado",
    pending: "Pendiente",
    analyze: "Analizar",
    protocol: "Protocolo de Captura",
    attempt: (n) => `Intento ${n}/2`,
  },
  results: {
    title: "Resultados",
    highConfidence: "Alta confianza",
    lowConfidence: "Resultado dudoso",
    highConfidenceDesc: "Coincidencia verificada por el motor.",
    lowConfidenceDesc: "Se recomienda verificación manual.",
    accept: "Aceptar y duplicar",
    manual: "Corregir manualmente",
    saveHistory: "Guardar en historial",
  },
  profile: {
    title: "Perfil Técnico",
    operator: "Operador Senior",
    id: "SK-08800",
    email: "scankey@scankey.com",
    stats: "Estadísticas de sesión",
    logout: "Cerrar Sesión",
    secureArea: "Área de Acceso Restringido",
  }
};
