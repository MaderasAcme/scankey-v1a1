
/**
 * Lead Engineer - ScanKey Hardening
 * Detecta capacidades de la plataforma sin romper el entorno de ejecución.
 */

export const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
export const isNative = !isWeb;

export const safeRequire = (moduleName) => {
  // En este entorno (ESM Browser), simulamos el fallo para módulos nativos
  // que no están en el importmap o no son compatibles.
  try {
    // Si estuviéramos en un bundler como Metro, usaríamos require.
    // Aquí simplemente verificamos contra una lista de conocidos.
    const nativeOnly = [
      'expo-camera', 
      '@react-native-async-storage/async-storage',
      'expo-image-manipulator',
      '@react-native-community/netinfo'
    ];
    
    if (isWeb && nativeOnly.includes(moduleName)) {
      return null;
    }
    
    // Fallback dinámico si se requiere en el futuro
    return null; 
  } catch (e) {
    return null;
  }
};

export const hasCapability = (cap) => {
  switch (cap) {
    case 'camera':
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    case 'localStorage':
      return typeof localStorage !== 'undefined';
    default:
      return false;
  }
};
