
import time
import uuid
import random
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from .schemas import AnalyzeResponse, FeedbackRequest, HealthResponse
from .utils.normalize import normalize_engine_output
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
    image_back: Optional[UploadFile] = File(None)
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

    # Simulación del motor de análisis
    input_id = f"sk_{uuid.uuid4().hex[:12]}"
    proc_time = int((time.time() - start_time) * 1000)
    
    # Mock data para normalización
    raw_output = {
        "results": [
            {"brand": "Yale", "type": "Serreta", "confidence": 0.96, "explain_text": "Coincidencia exacta Yale."},
            {"brand": "Tesa", "type": "Serreta", "confidence": 0.72, "explain_text": "Perfil similar."},
            {"brand": "Lince", "type": "Serreta", "confidence": 0.40, "explain_text": "Baja probabilidad."}
        ]
    }
    
    normalized = normalize_engine_output(raw_output, input_id, proc_time)

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

@app.post("/api/feedback")
async def receive_feedback(request: Request, feedback: FeedbackRequest):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.info("Feedback received", extra={
        "request_id": request_id,
        "input_id": feedback.input_id,
        "correction": feedback.correction
    })
    return {"status": "ok"}
