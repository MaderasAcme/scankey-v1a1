# Comparación: scankey-motor vs backends

**Fecha:** 2025-03-13  
**Objetivo:** scankey-motor como base única. Rescatar ideas de backend/main.py y ui-studio/backend/main.py.

---

## 1. scankey-motor (motor/main.py) — BASE OFICIAL

| Aspecto | Detalle |
|---------|---------|
| **Entrypoint** | `motor.main:app` (FastAPI) |
| **Arranque** | `gunicorn -k uvicorn.workers.UvicornWorker` o `uvicorn motor.main:app` |
| **Puerto** | 8081 (PORT) |
| **/health** | `ok`, `uptime_s`, `model_ready`, `model_loading`, `labels_count`, `model_version`, `multi_label_enabled`, `model_path`, `error` |
| **/api/analyze-key** | Inferencia ONNX real (o mock si `SCN_MOCK_ENGINE=1`) |
| **Carga modelo** | `model_bootstrap.ensure_model()` (GCS) + `ort.InferenceSession` en background |
| **Dependencias mínimas** | fastapi, uvicorn, gunicorn, python-multipart, pillow, numpy, onnxruntime, google-cloud-storage, opencv-python-headless |
| **Modo local sin modelo** | `SCN_MOCK_ENGINE=1` → respuestas simuladas |

**Qué tiene:**
- Inferencia ONNX real
- /health rico (model_ready, uptime, labels_count)
- SCN_MOCK_ENGINE para desarrollo local sin modelo
- Feature flags, umbrales configurables
- Fusión A/B, OCR on-demand, catalog_match
- Request ID, CORS, legacy_results_middleware

---

## 2. backend/main.py (OCR)

| Aspecto | Detalle |
|---------|---------|
| **Función** | OCR (Tesseract) + cruce con catálogo JMA |
| **/health** | `ok`, `ready`, `service` |
| **/api/ocr** | OCR sobre imagen, catalog_match |

**Qué rescatar:**
- **CORS explícito** (localhost:5173, scankeyapp.com) — motor usa `*`; en prod podría acotarse
- **Patrón de run_ocr opcional** — si ocr_engine falla, no tumba el backend (`run_ocr = getattr(..., None)` con fallback)
- **Cruces con catálogo** — motor ya usa `common.catalog_match`; backend usa `catalog_match.match_text(out["text"])` para OCR; útil si OCR on-demand se integra más

**Qué NO copiar:**
- No es el motor de analyze-key
- No tiene modelo ONNX
- /health básico; motor ya es más completo

---

## 3. ui-studio/backend/main.py (Pro mock)

| Aspecto | Detalle |
|---------|---------|
| **Función** | API Pro simulada (mock) |
| **/health** | Telemetría: `status`, `version`, `model_version`, `uptime_s`, `region`, `build_sha` |
| **/api/analyze-key** | Respuestas fijas (Yale 24D o mock low_confidence) |
| **Utils** | `normalize_engine_output`, `fuse_ab_responses`, `apply_ocr_gate_mock` |

**Qué rescatar:**
- **Estructura /health con telemetría** — `region` (K_SERVICE), `build_sha` — motor podría añadir si se despliega en Cloud Run
- **Rate limiting por IP** — motor no lo tiene; gateway sí
- **Logging estructurado** — `logger.info(..., extra={request_id, latency_ms, ...})` — motor tiene algo similar con request_id
- **Schemas Pydantic** (AnalyzeResponse, FeedbackRequest, HealthResponse) — motor es más libre; podría adoptarse para validación
- **apply_ocr_gate_mock** — lógica OCR gated cuando low_confidence; motor tiene OCR on-demand pero distinto flujo

**Qué NO copiar:**
- Respuestas mock hardcodeadas — motor ya tiene SCN_MOCK_ENGINE
- No tiene inferencia real
- Duplicaría funcionalidad del motor

---

## 4. Conclusión: por qué scankey-motor es la base correcta

1. **Inferencia real** — Único backend con ONNX y pipeline completo
2. **Contrato ya establecido** — /api/analyze-key, /health, /api/feedback usados por gateway y UI
3. **Mock integrado** — SCN_MOCK_ENGINE permite desarrollo local sin modelo
4. **Feature flags** — Configuración flexible vía env
5. **common/catalog_match** — Reutilizado; backend y motor comparten lógica
6. **No fragmentar** — backend y ui-studio/backend son OCR o mock; el motor es la pieza central

---

## 5. Resumen ejecutivo

| Ítem | Valor |
|------|-------|
| **Motor base** | scankey-motor (motor/main.py) |
| **Rescatar de backend** | CORS acotado opcional, patrón run_ocr defensivo |
| **Rescatar de ui-studio/backend** | region/build_sha en /health, rate limit, schemas Pydantic, logging extra |
| **No copiar** | Duplicar analyze-key, mock hardcodeado |

---

## 6. Ejecución local (entregable)

| Ítem | Valor |
|------|-------|
| **Comando exacto** | `$env:PYTHONPATH="C:\Users\guill\Desktop\scankey-v1a1"; $env:SCN_MOCK_ENGINE="1"; python -m uvicorn motor.main:app --host 0.0.0.0 --port 8081` |
| **URL local** | http://localhost:8081 |
| **/health** | `{"ok":true,"uptime_s":...,"model_ready":false,"model_loading":false,"labels_count":0,"model_version":"scankey-v2-prod","multi_label_enabled":false,"multi_label_fields_supported":[],"model_path":"/tmp/modelo_llaves.onnx","error":"...NO_SUCHFILE..."}` (model_ready:false normal con SCN_MOCK_ENGINE) |
| **Siguiente paso** | Gateway (8080) + UI (5173) para flujo completo; o conseguir modelo ONNX para model_ready:true |
