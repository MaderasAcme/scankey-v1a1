
/**
 * Lead Engineer - ScanKey Runtime Config Resolver
 * Gestiona la jerarquía de variables de entorno de forma segura.
 */

// Importación dinámica segura para evitar fallos en entornos web puros
let expoConfig = {};
try {
  const Constants = require('expo-constants').default;
  expoConfig = Constants?.expoConfig?.extra || {};
} catch (e) {
  // Silencioso: fallback a variables de proceso
}

const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || expoConfig.apiBaseUrl || "https://api.scankey.tech/v1",
  timeoutMs: parseInt(process.env.EXPO_PUBLIC_TIMEOUT_MS || expoConfig.timeoutMs || "25000", 10),
  maxRetries: parseInt(process.env.EXPO_PUBLIC_MAX_RETRIES || expoConfig.maxRetries || "2", 10),
  env: process.env.EXPO_PUBLIC_ENV || "production"
};

export default config;
