
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

## 🔒 Seguridad y Privacidad
- **Cero persistencia local de imágenes.**
- **Logs anonimizados:** Solo telemetría técnica, nunca contenido visual.
- **Protocolo de PIN:** Acceso al taller protegido por código de seguridad.

---
**Lead Engineer Note:** Observabilidad y Runbook integrados para garantizar disponibilidad y seguridad en entornos de producción.
