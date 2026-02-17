
# Runbook Operativo - ScanKey Pro

Este documento es la referencia para la operación real del sistema ScanKey.

## 🚨 Síntomas Comunes y Diagnóstico

### 1. Error "5xx" o Fallo en Análisis
*   **Síntoma:** El loader se detiene y muestra "Error en el servidor".
*   **Diagnóstico:**
    1.  Revisar `/health` para confirmar si el servicio está vivo.
    2.  Check logs: Buscar `severity: ERROR` y filtrar por `request_id`.
    3.  Verificar `latency_ms`. Si es > 25s, es un timeout de Cloud Run.
*   **Acción:** Aumentar memoria en Cloud Run o verificar saturación del motor.

### 2. Timeouts Constantes
*   **Síntoma:** La app se queda en "Analizando... Intento 1/2" indefinidamente.
*   **Diagnóstico:**
    1.  Verificar conexión del cliente.
    2.  Revisar logs: ¿Hay peticiones que NO terminan o terminan en 504 (Gateway Timeout)?
*   **Acción:** Comprobar si hay una revisión de Cloud Run con "Cold Starts" lentos (>10s).

### 3. Resultados Dudosos (Low Confidence) Masivos
*   **Síntoma:** La mayoría de llaves reales devuelven banner ámbar.
*   **Diagnóstico:**
    1.  Verificar `model_version` en `/health`. ¿Se desplegó un modelo incorrecto?
    2.  Verificar en logs el `top_confidence` promedio.
*   **Acción:** Rollback manual de la variable de entorno `MODEL_VERSION` o re-entrenamiento.

## 🛠 Diagnóstico en 3 Pasos
1.  **Check Health:** Ejecutar `scripts/uptime_check.sh [API_URL]`. Debe devolver `status: ok`.
2.  **Audit Logs:** Buscar el `request_id` afectado. Identificar el `status_code` y la latencia.
3.  **Acción Correctiva:** Rollback de env vars o reinicio de servicio si el uptime es < 60s (CrashLoop).

## 🛡 Guardrails de Seguridad
*   **LOGS:** Prohibido loggear cuerpos (base64) o metadatos de imágenes.
*   **FUGAS:** Si se detecta un token o API Key en logs, rotar inmediatamente y purgar historial de GCP.
*   **ACCESO:** El acceso al taller mediante PIN `08800` es local; no requiere red pero la sincronización de feedback sí.

## ✅ Checklist de Deploy

### Antes de desplegar:
- [ ] Pasar `npm run qa:secrets`.
- [ ] Verificar que `EXPO_PUBLIC_API_BASE_URL` no apunte a localhost.
- [ ] Validar contrato con `node scripts/contract_check.js`.

### Después de desplegar:
- [ ] Ejecutar `scripts/smoke_test.sh`.
- [ ] Verificar `Salud del sistema` en la App > Taller.
- [ ] Observar logs durante 5 minutos para detectar picos de 4xx/5xx.
