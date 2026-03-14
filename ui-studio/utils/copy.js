
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
    // Flujo guiado mismo-pantalla
    stepA: "Haz una foto del lado A",
    stepAAfter: "Perfecto. Ahora haz la foto del lado B",
    stepBOptional: "Lado B opcional",
    stepBRequired: "Pendiente",
    usePhoto: "Usar foto",
    captureA: "Capturar lado A",
    captureB: "Capturar lado B",
    analyzeKey: "Analizar llave",
    repeat: "Repetir",
    confirmAndContinue: "Confirmar y continuar",
    reviewTitle: "Revisa la captura",
    uploadPhoto: "Subir foto",
    noCamera: "No se pudo acceder a la cámara",
    noCameraHint: "Puedes subir una foto manualmente",
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
