
# ScanKey Pro - Backend (FastAPI)

Servicio de alto rendimiento para el análisis estructural de llaves mediante IA, optimizado para despliegue en **Google Cloud Run**.

## 🚀 Ejecución Local

1. Instalar dependencias:
   ```bash
   pip install fastapi uvicorn pydantic python-multipart
   ```

2. Ejecutar servidor:
   ```bash
   PORT=8080 python -m backend.main
   ```

## 🛠 Endpoints

### `POST /api/analyze-key`
Analiza un par de imágenes (Lado A y Lado B).
- **Multipart Form Data**: Soporta campos `front`/`back` o `image_front`/`image_back`.
- **Contrato**: Devuelve exactamente 3 candidatos, flags de confianza y metadatos de debug.

### `POST /api/feedback`
Registra la selección final del usuario o correcciones manuales.
- **JSON**: Requiere `input_id`.
- **Respuesta**: 200 (OK) o 202 (Accepted para revisión).

## 📊 Observabilidad
- Los logs están estructurados en formato JSON para **Cloud Logging**.
- Cada petición incluye un `X-Request-Id` para trazabilidad punta a punta.
- No se loggean binarios ni datos sensibles.

## 🔒 Seguridad
- CORS configurable mediante `CORS_ORIGINS`.
- Límite de tamaño de imagen: 12MB.
- Rate limiting por IP habilitado (ventana de 60s).
