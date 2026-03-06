
/**
 * Lead Engineer - Connectivity Helper
 */

/** Seguro ante SSR/Node: no lanza si navigator falta */
export const getConnectivitySnapshot = () => {
  try {
    if (typeof navigator !== 'undefined' && navigator != null && 'onLine' in navigator) {
      return Boolean(navigator.onLine);
    }
  } catch (_) {}
  return true;
};

export const subscribeConnectivity = (callback) => {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};
