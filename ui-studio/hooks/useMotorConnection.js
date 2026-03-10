/**
 * useMotorConnection — estado de conexión con motor/gateway.
 * No confía solo en navigator.onLine: hace health check real al motor.
 * - motor_checking: comprobando
 * - motor_online: motor disponible
 * - motor_offline: motor no disponible (sin API, red, o gateway caído)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getMotorHealth, getApiConfig } from '../services/api';

const RETRY_INTERVAL_MS = 8000;
const HEALTH_TIMEOUT_MS = 5000;

export function useMotorConnection() {
  const [status, setStatus] = useState('motor_checking');
  const lastCheckRef = useRef(0);
  const retryTimerRef = useRef(null);

  const runCheck = useCallback(async () => {
    const { hasBase } = getApiConfig();
    if (!hasBase) {
      setStatus('motor_offline');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('motor_offline');
      return;
    }
    setStatus('motor_checking');
    lastCheckRef.current = Date.now();
    try {
      const result = await getMotorHealth({ timeoutMs: HEALTH_TIMEOUT_MS });
      if (result?.ok) {
        setStatus('motor_online');
      } else {
        setStatus('motor_offline');
      }
    } catch (_) {
      setStatus('motor_offline');
    }
  }, []);

  useEffect(() => {
    runCheck();

    const scheduleRetry = () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(runCheck, RETRY_INTERVAL_MS);
    };

    scheduleRetry();
    const interval = setInterval(runCheck, RETRY_INTERVAL_MS);

    const onOnline = () => {
      runCheck();
      scheduleRetry();
    };

    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(interval);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      window.removeEventListener('online', onOnline);
    };
  }, [runCheck]);

  const retryNow = useCallback(() => {
    runCheck();
  }, [runCheck]);

  return {
    status,
    isOnline: status === 'motor_online',
    isChecking: status === 'motor_checking',
    isOffline: status === 'motor_offline',
    retryNow,
  };
}
