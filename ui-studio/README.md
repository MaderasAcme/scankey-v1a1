
# ScanKey Pro

Identificación profesional de llaves mediante IA. Análisis estructural TOP 3, gestión de taller y trazabilidad.

## 🚀 Instalación y Ejecución

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar entorno:**
   Copia el archivo `.env.example` a `.env` y ajusta las variables necesarias.

3. **Ejecutar:**
   - Web: `npm run web`
   - Mobile: `npm start`

## 📊 Operación Técnica

### Monitoreo de Salud
El sistema cuenta con un endpoint `/health` y una herramienta de diagnóstico integrada en la App (**Taller > Salud del sistema**).

### Scripts de Operación
- `bash scripts/uptime_check.sh`: Verifica disponibilidad y versión del motor.
- `bash scripts/smoke_test.sh`: Suite de pruebas post-despliegue.

### Logging Estructurado
Los logs del backend están formateados en JSON para una integración nativa con Google Cloud Logging, facilitando la trazabilidad mediante `request_id`.

## 📱 Ventanas UI (v2.1)
- **Results:** Modal de corrección manual (manual_correction_hint.fields), selección TOP3, feedback robusto.
- **History:** Lista de scans con estado (LOW/HIGH, top1, timestamp), detalle y feedback pendiente.
- **Taller:** Estado del sistema (gateway/motor health), cola de feedback, sincronizar, configuración local.
- **Guide:** Guía de captura y errores típicos (blur/glare/fondo/encuadre/A-B).
- **Profile:** Preferencias (modo, mostrar debug), borrar datos locales (historial + cola + settings).

## 🔒 Seguridad y Privacidad
- **Cero persistencia local de imágenes.** Solo metadatos (scn_history, scn_feedback_queue, scn_settings).
- **Logs anonimizados:** Solo telemetría técnica, nunca contenido visual.

---
**Lead Engineer Note:** Observabilidad y Runbook integrados para garantizar disponibilidad y seguridad en entornos de producción.
