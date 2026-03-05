
import time
import uuid
import random
import json
import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from .schemas import AnalyzeResponse, FeedbackRequest, HealthResponse
from .utils.normalize import normalize_engine_output
from .utils.ab_fusion import fuse_ab_responses
from .utils.ocr_gate_mock import apply_ocr_gate_mock
from .utils.logging import logger, setup_logging
from .utils.rate_limit import is_rate_limited
import os

# Lead Engineer - Backend Observability & Operations
# FastAPI + Cloud Run (Standard PORT 8080)

app = FastAPI(title="ScanKey Pro API", version="2.1.0")
APP_START_TIME = time.time()
MODEL_VERSION = os.getenv("MODEL_VERSION", "scankey-v3-vision-prod")
LABELS_COUNT = int(os.getenv("LABELS_COUNT", "512"))

# 1. Seguridad y CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Middleware de Observabilidad (OBJETIVO 2: Logs Estructurados)
@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    # Generar o usar Request ID para trazabilidad punta a punta
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    start_time = time.time()
    
    # Almacenar en state para acceso en los endpoints
    request.state.request_id = request_id
    
    response = await call_next(request)
    
    latency_ms = int((time.time() - start_time) * 1000)
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Process-Time-Ms"] = str(latency_ms)
    
    # Log estructurado (NO loggear imágenes ni datos sensibles)
    log_data = {
        "event": "http_request",
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "latency_ms": latency_ms,
        "model_version": MODEL_VERSION
    }
    
    if response.status_code >= 400:
        logger.error(f"Request failed: {request.method} {request.url.path}", extra=log_data)
    else:
        logger.info(f"Request handled: {request.method} {request.url.path}", extra=log_data)
    
    return response

@app.on_event("startup")
async def startup_event():
    setup_logging()
    logger.info("Service operational", extra={"model_version": MODEL_VERSION, "env": os.getenv("EXPO_PUBLIC_ENV", "prod")})

# 3. Endpoints de Operación

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    OBJETIVO 1: Endpoint de salud con telemetría útil para monitoreo.
    """
    uptime_s = int(time.time() - APP_START_TIME)
    return {
        "status": "ok",
        "version": "2.1.0",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_version": MODEL_VERSION,
        "labels_count": LABELS_COUNT,
        "uptime_s": uptime_s,
        "region": os.getenv("K_SERVICE", "local-dev"), # Inyectado por Cloud Run
        "build_sha": os.getenv("BUILD_SHA", "unknown")  # Inyectado en CI/CD
    }

@app.post("/api/analyze-key", response_model=AnalyzeResponse)
async def analyze_key(
    request: Request,
    front: Optional[UploadFile] = File(None),
    back: Optional[UploadFile] = File(None),
    image_front: Optional[UploadFile] = File(None),
    image_back: Optional[UploadFile] = File(None),
    modo: Optional[str] = Form(None),
    mock_low_confidence: Optional[str] = Form(None),
):
    start_time = time.time()
    request_id = getattr(request.state, "request_id", "unknown")
    
    # Rate Limiting por IP
    if is_rate_limited(request.client.host if request.client else "127.0.0.1"):
        logger.warning("Rate limit hit", extra={"ip": request.client.host, "request_id": request_id})
        raise HTTPException(status_code=429, detail="Demasiadas peticiones. Por favor, espere.")

    f_file = front or image_front
    b_file = back or image_back

    if not f_file or not b_file:
        raise HTTPException(status_code=400, detail="Se requieren dos imágenes (frontal y trasera).")

    # Validación básica (NO loggear tamaños ni contenido)
    if f_file.content_type not in ["image/jpeg", "image/png"]:
         raise HTTPException(status_code=415, detail="Formato no soportado.")

    # Simulación del motor con fusión A/B (consenso: Yale en ambos lados)
    input_id = f"sk_{uuid.uuid4().hex[:12]}"
    proc_time = int((time.time() - start_time) * 1000)

    force_low = (mock_low_confidence or "").strip().lower() in ("1", "true", "yes")
    if force_low:
        results_a = [
            {"brand": "Desconocido", "model": None, "type": "Serreta", "confidence": 0.45, "explain_text": "Baja certeza.", "compatibility_tags": []},
            {"brand": "Lince", "model": "C5", "type": "Serreta", "confidence": 0.30, "explain_text": "Baja probabilidad.", "compatibility_tags": []},
            {"type": "No identificado", "confidence": 0.0, "explain_text": "Sin más candidatos.", "compatibility_tags": []},
        ]
        results_b = [
            {"brand": "Desconocido", "model": None, "type": "Serreta", "confidence": 0.40, "explain_text": "Baja certeza.", "compatibility_tags": []},
            {"brand": "Lince", "model": "C5", "type": "Serreta", "confidence": 0.28, "explain_text": "Baja probabilidad.", "compatibility_tags": []},
            {"type": "No identificado", "confidence": 0.0, "explain_text": "Sin más candidatos.", "compatibility_tags": []},
        ]
    else:
        results_a = [
            {"brand": "Yale", "model": "24D", "type": "Serreta", "confidence": 0.94, "explain_text": "Coincidencia Yale frontal.", "compatibility_tags": ["yale-compatible"]},
            {"brand": "Tesa", "model": "TE5", "type": "Serreta", "confidence": 0.70, "explain_text": "Perfil similar.", "compatibility_tags": []},
            {"brand": "Lince", "model": "C5", "type": "Serreta", "confidence": 0.38, "explain_text": "Baja probabilidad.", "compatibility_tags": []},
        ]
        results_b = [
            {"brand": "Yale", "model": "24D", "type": "Serreta", "confidence": 0.92, "explain_text": "Coincidencia Yale trasera.", "compatibility_tags": ["yale-compatible"]},
            {"brand": "Tesa", "model": "TE5", "type": "Serreta", "confidence": 0.68, "explain_text": "Perfil similar.", "compatibility_tags": []},
            {"brand": "Lince", "model": "C5", "type": "Serreta", "confidence": 0.35, "explain_text": "Baja probabilidad.", "compatibility_tags": []},
        ]
    fused_results = fuse_ab_responses(results_a, results_b)

    raw_output = {"results": fused_results}
    normalized = normalize_engine_output(raw_output, input_id, proc_time)

    # OCR gated: si low_confidence, añade ocr_hint/ocr_detail
    modo_taller = (modo or "").strip().lower() == "taller"
    normalized = apply_ocr_gate_mock(normalized, is_workshop=modo_taller)

    # LOG ESTRUCTURADO DE NEGOCIO (OBJETIVO 2)
    logger.info("Key analysis finished", extra={
        "request_id": request_id,
        "input_id": input_id,
        "top_confidence": normalized["results"][0]["confidence"],
        "low_confidence": normalized["low_confidence"],
        "high_confidence": normalized["high_confidence"],
        "model_version": MODEL_VERSION,
        "latency_ms": int((time.time() - start_time) * 1000)
    })

    return normalized

def _store_correction_always(payload: dict) -> None:
    """Guardado de correcciones manuales siempre (solo metadatos; nunca imágenes)."""
    try:
        dir_path = os.getenv("FEEDBACK_CORRECTIONS_DIR", "").strip() or os.path.join(os.path.dirname(__file__), "..", "feedback_corrections")
        path = Path(dir_path)
        path.mkdir(parents=True, exist_ok=True)
        fname = f"{payload.get('input_id', uuid.uuid4().hex)}_{int(time.time())}.json"
        out_path = path / fname
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=0)
    except Exception:
        pass


@app.post("/api/feedback")
async def receive_feedback(request: Request, feedback: FeedbackRequest):
    request_id = getattr(request.state, "request_id", "unknown")
    # Logs sin imágenes: solo metadatos
    logger.info("Feedback received", extra={
        "request_id": request_id,
        "input_id": feedback.input_id,
        "correction": feedback.correction,
    })
    try:
        payload = feedback.model_dump(mode="json") if hasattr(feedback, "model_dump") else feedback.dict()
    except Exception:
        payload = {"input_id": feedback.input_id, "correction": feedback.correction, "manual_data": feedback.manual_data}
    if feedback.correction:
        _store_correction_always(payload)
    return {"status": "ok"}
