import io
import os, json, time, uuid, hashlib, hmac, logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Set

import httpx
from PIL import Image

_log = logging.getLogger(__name__)
from normalize import normalize_contract
from quality_gate_active import check_quality_gate
from policy_actions import execute_policy_actions
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import google.auth.transport.requests
from google.oauth2 import id_token
from google.cloud import storage

APP_VERSION = "0.5.0"

SCHEMA_VERSION = "2026-02-17"
POLICY_VERSION = "v1"  # BLOQUE 3: policy engine

_cached_id_token = None
_cached_id_token_expiry = 0
_TOKEN_REFRESH_MARGIN_SECONDS = 60 # Refresh 60 seconds before expiration

# IMPORTANTE: Dockerfile usa uvicorn main:APP
APP = FastAPI(title="ScanKey Gateway", version=APP_VERSION, redirect_slashes=False)


# --- schema/meta (auto-inyectado) ---
def _get_request_id(req: Request) -> str:
    rid = (req.headers.get("x-request-id") or "").strip()
    return rid or uuid.uuid4().hex


def _ensure_contract_v2(data: dict) -> dict:
    d = dict(data or {})

    # 1) manufacturer_hint (required)
    mh = d.get("manufacturer_hint")
    if not isinstance(mh, dict):
        d["manufacturer_hint"] = {"found": False, "name": None, "confidence": 0.0}
    else:
        d["manufacturer_hint"].setdefault("found", False)
        d["manufacturer_hint"].setdefault("name", None)
        d["manufacturer_hint"].setdefault("confidence", 0.0)

    # 2) results (required, len=3) + compatibility_tags required as array
    res = d.get("results")
    if not isinstance(res, list):
        res = []
    out = []
    for i, r in enumerate(res[:3], start=1):
        rr = dict(r or {})
        rr.setdefault("rank", i)

        # map legacy -> contract
        if rr.get("id_model_ref") is None and rr.get("ref") is not None:
            rr["id_model_ref"] = rr.get("ref")

        rr.setdefault("type", "key")
        rr.setdefault("brand", None)
        rr.setdefault("model", rr.get("model") or rr.get("id_model_ref"))
        rr.setdefault("confidence", 0.0)
        if not isinstance(rr.get("compatibility_tags"), list):
            rr["compatibility_tags"] = []
        out.append(rr)

    while len(out) < 3:
        out.append({
            "rank": len(out)+1,
            "type": "key",
            "brand": None,
            "model": None,
            "id_model_ref": None,
            "confidence": 0.0,
            "compatibility_tags": []
        })

    d["results"] = out
    return d


def _inject_meta(obj, request_id: str):
    if isinstance(obj, dict):
        obj.setdefault("schema_version", SCHEMA_VERSION)
        obj.setdefault("policy_version", POLICY_VERSION)
        obj.setdefault("request_id", request_id)
        obj.setdefault("gateway_version", APP_VERSION)
    return obj


def _log_analyze(request_id: str, processing_time_ms: int, payload: Dict[str, Any]):
    """Log mínimo: request_id, processing_time_ms, model_version, resultado flags. Sin imágenes ni form-data."""
    if not isinstance(payload, dict):
        return
    debug = payload.get("debug") or {}
    model_version = debug.get("model_version") or payload.get("model_version") or ""
    _log.info(
        "analyze_key",
        extra={
            "request_id": request_id,
            "processing_time_ms": processing_time_ms,
            "model_version": model_version,
            "high_confidence": payload.get("high_confidence"),
            "low_confidence": payload.get("low_confidence"),
        },
    )

def _proxy_httpx_json(r: httpx.Response, request_id: str):
    ct = (r.headers.get("content-type") or "application/json").split(";")[0]
    if ct == "application/json":
        try:
            payload = r.json()
            # SCN_PATCH_FIX_COMPAT_TAGS
            if isinstance(payload, dict):
                payload.setdefault('manufacturer_hint', {'found': False, 'name': None, 'confidence': 0.0})
                for _k in ('results','candidates'):
                    _lst = payload.get(_k)
                    if isinstance(_lst, list):
                        for _it in _lst:
                            if isinstance(_it, dict):
                                _ct = _it.get('compatibility_tags')
                                if _ct is None:
                                    _it['compatibility_tags'] = []
                                elif isinstance(_ct, list):
                                    pass
                                elif isinstance(_ct, str):
                                    _it['compatibility_tags'] = [_ct]
                                else:
                                    _it['compatibility_tags'] = []

            # SCN_PATCH_MANUFACTURER_HINT_DEFAULT
            if isinstance(payload, dict) and "manufacturer_hint" not in payload:
                payload["manufacturer_hint"] = {"found": False, "name": None, "confidence": 0.0}
        except Exception:
            payload = {"ok": False, "error": "invalid_json_from_upstream", "status_code": r.status_code}
        _inject_meta(payload, request_id)
        return JSONResponse(content=payload, status_code=r.status_code)
    return Response(content=r.content, status_code=r.status_code, media_type=ct)

@APP.middleware("http")
async def _mw_request_id(request: Request, call_next):
    rid = _get_request_id(request)
    request.state.request_id = rid
    resp = await call_next(request)
    resp.headers["x-request-id"] = rid
    resp.headers["x-schema-version"] = SCHEMA_VERSION
    resp.headers["x-policy-version"] = POLICY_VERSION
    return resp


# -----------------------------
# Config
# -----------------------------
MOTOR_URL = (os.getenv("MOTOR_URL") or "").rstrip("/")
API_KEYS_RAW = os.getenv("API_KEYS", "")
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "*")
TIMEOUT = float(os.getenv("TIMEOUT", "15"))

# New Config for ID Token Proxy
SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED = os.getenv("SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED", "true").lower() == "true"
MOTOR_AUTH_HEADER = os.getenv("MOTOR_AUTH_HEADER", "Authorization")

KEY_BUCKET = os.getenv("KEY_BUCKET", "scankey-dc007-keys")
KEY_PREFIX = os.getenv("KEY_PREFIX", "ingest").strip("/")
JOB_PREFIX = os.getenv("JOB_PREFIX", "jobs").strip("/")
FEEDBACK_PREFIX = os.getenv("FEEDBACK_PREFIX", "feedback").strip("/")
IDEMPOTENCY_KEYS_PREFIX = os.getenv("IDEMPOTENCY_KEYS_PREFIX", "idempotency_keys").strip("/")
IDEMPOTENCY_TTL_SECONDS = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "86400"))  # 24h ventana

# P1.1: QualityGate (soft-block)
SCN_FEATURE_QUALITY_GATE_ACTIVE = os.getenv("SCN_FEATURE_QUALITY_GATE_ACTIVE", "false").lower() in ("1", "true", "yes")
# BLOQUE 3.1: PolicyEngine operativo (BLOCK 422, RUN_OCR, ALLOW_WITH_OVERRIDE)
SCN_FEATURE_POLICY_ENGINE_ACTIVE = os.getenv("SCN_FEATURE_POLICY_ENGINE_ACTIVE", "false").lower() in ("1", "true", "yes")

# P0.5: Input validation
MAX_PAYLOAD_MB = float(os.getenv("SCN_MAX_PAYLOAD_MB", "10"))
MAX_PAYLOAD_BYTES = int(MAX_PAYLOAD_MB * 1024 * 1024)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_IMAGE_DIM = int(os.getenv("SCN_MAX_IMAGE_DIM", "8192"))

# Workshop login (auth real)
WORKSHOP_LOGIN_EMAIL = (os.getenv("WORKSHOP_LOGIN_EMAIL") or "").strip()
WORKSHOP_LOGIN_PASSWORD = (os.getenv("WORKSHOP_LOGIN_PASSWORD") or "").strip()
WORKSHOP_TOKEN = (os.getenv("WORKSHOP_TOKEN") or "").strip()

# CORS
allowed = [o.strip() for o in (ALLOWED_ORIGINS_RAW or "").split(",") if o.strip()]
APP.add_middleware(
    CORSMiddleware,
    allow_origins=(["*"] if not allowed or allowed == ["*"] else allowed),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GCS client (lazy cuando SCN_LOCAL_DEV=1)
SCN_LOCAL_DEV = os.getenv("SCN_LOCAL_DEV", "").lower() in ("1", "true", "yes")
_gcs = None
if not SCN_LOCAL_DEV:
    try:
        _gcs = storage.Client()
    except Exception as e:
        _log.warning("GCS client init failed (local dev?): %s", e)

# -----------------------------
# Helpers
# -----------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _parse_keys(raw: str) -> Set[str]:
    parts = []
    for chunk in (raw or "").replace("\n", ";").replace(",", ";").split(";"):
        s = chunk.strip()
        if s:
            parts.append(s)
    return set(parts)

_API_KEYS = _parse_keys(API_KEYS_RAW)

def require_apikey(req: Request):
    if not _API_KEYS:
        raise HTTPException(status_code=500, detail="API_KEYS no configurado en gateway")
    k = (req.headers.get("x-api-key") or "").strip()
    if not k or k not in _API_KEYS:
        raise HTTPException(status_code=401, detail="API key inválida")
    return True



def fetch_id_token_cached(audience: str) -> str:
    global _cached_id_token, _cached_id_token_expiry

    now = time.time()
    # Check if the cached token is still valid with a refresh margin
    if _cached_id_token and _cached_id_token_expiry > now + _TOKEN_REFRESH_MARGIN_SECONDS:
        return _cached_id_token

    # Fetch a new token
    request_object = google.auth.transport.requests.Request()
    new_token = id_token.fetch_id_token(request_object, audience)

    # Extract expiry from the newly fetched token
    try:
        # id_token.verify_oauth2_token returns the claims (a dict)
        claims = id_token.verify_oauth2_token(new_token, request_object, audience=audience)
        _cached_id_token_expiry = claims.get('exp', 0)
    except Exception as e:
        # Fallback if expiry extraction fails, assume 1 hour validity for caching
        print(f"Warning: Could not extract expiry from ID token: {e}. Assuming 1 hour validity.")
        _cached_id_token_expiry = now + 3600 # 1 hour from now

    _cached_id_token = new_token
    return _cached_id_token

def _get_auth_headers() -> Dict[str, str]:
    headers = {}
    if SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED:
        if not MOTOR_URL:
            raise HTTPException(500, "MOTOR_URL no configurado para ID Token Proxy")
        token = fetch_id_token_cached(MOTOR_URL)
        headers[MOTOR_AUTH_HEADER] = f"Bearer {token}"
    return headers

def _sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def _date_prefix(dt: datetime) -> str:
    return f"{dt.year:04d}/{dt.month:02d}/{dt.day:02d}"

def _gcs_ok() -> bool:
    return _gcs is not None

def _gcs_put_json(bucket: str, path: str, obj: Dict[str, Any]):
    if not _gcs:
        raise RuntimeError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    blob.upload_from_string(
        json.dumps(obj, ensure_ascii=False).encode("utf-8"),
        content_type="application/json; charset=utf-8",
    )

def _gcs_get_json(bucket: str, path: str) -> Dict[str, Any]:
    if not _gcs:
        raise FileNotFoundError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    return json.loads(blob.download_as_bytes().decode("utf-8"))

def _gcs_put_bytes(bucket: str, path: str, data: bytes, content_type: str = "image/jpeg"):
    if not _gcs:
        raise RuntimeError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    blob.upload_from_string(data, content_type=content_type)

def _gcs_get_bytes(bucket: str, path: str) -> bytes:
    if not _gcs:
        raise FileNotFoundError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    return blob.download_as_bytes()

def _find_job_path(job_id: str, lookback_days: int = 14) -> str:
    if not _gcs:
        raise FileNotFoundError("GCS no disponible (modo local)")
    now = datetime.now(timezone.utc)
    b = _gcs.bucket(KEY_BUCKET)
    for i in range(lookback_days + 1):
        dp = _date_prefix(now - timedelta(days=i))
        p = f"{JOB_PREFIX}/{dp}/{job_id}.json"
        if b.blob(p).exists():
            return p
    raise FileNotFoundError(job_id)

async def _motor_post(
    path: str,
    files=None,
    data=None,
    request_id: Optional[str] = None,
    req: Optional[Request] = None,
) -> httpx.Response:
    if not MOTOR_URL:
        raise HTTPException(500, "MOTOR_URL no configurado")
    headers = dict(_get_auth_headers())
    if request_id:
        headers["X-Request-ID"] = request_id
    if req is not None:
        workshop_token = (req.headers.get("X-Workshop-Token") or "").strip()
        if workshop_token:
            headers["X-Workshop-Token"] = workshop_token

    last_exc = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT)) as client:
                return await client.post(f"{MOTOR_URL}{path}", headers=headers, files=files, data=data)
        except httpx.TimeoutException as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor timeout: {type(last_exc).__name__}")
        except Exception as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor error: {type(last_exc).__name__}")


async def _motor_get(path: str, request_id: Optional[str] = None):
    if not MOTOR_URL:
        raise HTTPException(500, "MOTOR_URL no configurado")
    headers = dict(_get_auth_headers())
    if request_id:
        headers["X-Request-ID"] = request_id

    last_exc = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT)) as client:
                return await client.get(f"{MOTOR_URL}{path}", headers=headers)
        except httpx.TimeoutException as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor timeout: {type(last_exc).__name__}")
        except Exception as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor error: {type(last_exc).__name__}")

# -----------------------------
# Routes
# -----------------------------
@APP.get("/health")
def health():
    return {"ok": True, "service": "gateway", "version": APP_VERSION}


@APP.post("/api/auth/login")
async def auth_login(req: Request):
    """Valida credenciales contra ENV. No loggear password. Comparación segura."""
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "JSON inválido")
    email_raw = (body.get("email") or "").strip()
    email = (email_raw.lower() if email_raw else "")
    password = str(body.get("password") or "")
    if not WORKSHOP_LOGIN_EMAIL or not WORKSHOP_LOGIN_PASSWORD or not WORKSHOP_TOKEN:
        return JSONResponse(
            content={"ok": False, "error": "LOGIN_NOT_CONFIGURED"},
            status_code=503,
        )
    expected_email = WORKSHOP_LOGIN_EMAIL.strip().lower()
    try:
        email_ok = hmac.compare_digest(email, expected_email)
        password_ok = hmac.compare_digest(password, WORKSHOP_LOGIN_PASSWORD)
    except (TypeError, ValueError):
        email_ok = False
        password_ok = False
    if not (email_ok and password_ok):
        return JSONResponse(
            content={"ok": False, "error": "INVALID_CREDENTIALS"},
            status_code=401,
        )
    return {
        "ok": True,
        "role": "taller",
        "workshop_token": WORKSHOP_TOKEN,
        "operator_label": "OPERADOR SENIOR",
        "expires_in_days": 7,
    }


@APP.api_route("/motor/health", methods=["GET","POST"])
@APP.api_route("/motor/health/", methods=["GET","POST"], include_in_schema=False)
async def motor_health(req: Request, _: bool = Depends(require_apikey)):
    rid = getattr(req.state, "request_id", _get_request_id(req))
    r = await _motor_get("/health", request_id=rid)
    rid = getattr(req.state, "request_id", _get_request_id(req))
    return _proxy_httpx_json(r, rid)

def _validate_image_payload(f_bytes: bytes, content_type: Optional[str], field: str) -> None:
    """P0.5: Validación dura. 413/415/400."""
    if len(f_bytes) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            413,
            f"Payload demasiado grande: {field} > {MAX_PAYLOAD_MB}MB",
        )
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct and ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            415,
            f"Content-Type no soportado: {ct}. Usa image/jpeg, image/png o image/webp.",
        )
    try:
        img = Image.open(io.BytesIO(f_bytes))
        img.verify()
    except Exception as e:
        raise HTTPException(400, f"Imagen inválida: {field} ({type(e).__name__})")
    # Verificar dimensiones tras reopen (verify() cierra el stream)
    try:
        img2 = Image.open(io.BytesIO(f_bytes))
        w, h = img2.size
        if w > MAX_IMAGE_DIM or h > MAX_IMAGE_DIM:
            raise HTTPException(
                400,
                f"Imagen demasiado grande: {w}x{h} (máx {MAX_IMAGE_DIM})",
            )
    except HTTPException:
        raise
    except Exception:
        pass


@APP.post("/api/analyze-key")
async def proxy_analyze_key(
    req: Request,
    front: UploadFile = File(None),
    back: UploadFile = File(None),
    image_front: UploadFile = File(None),
    image_back: UploadFile = File(None),
    modo: Optional[str] = Form(None),
    modo_taller: Optional[str] = Form(None),
    _: bool = Depends(require_apikey),
):
    # Logs sin imágenes: no loggear cuerpos ni bytes de archivos
    f = front or image_front
    b = back or image_back
    if f is None:
        raise HTTPException(400, "front requerido (front o image_front)")

    f_bytes = await f.read()
    b_bytes = await b.read() if b is not None else b""

    _validate_image_payload(f_bytes, f.content_type, "front")
    if b_bytes and len(b_bytes) > 500:
        _validate_image_payload(b_bytes, b.content_type if b else None, "back")

    files = {"front": ("front.jpg", f_bytes, f.content_type or "image/jpeg")}
    if b_bytes:
        files["back"] = ("back.jpg", b_bytes, (b.content_type if b else None) or "image/jpeg")

    data = {}
    mt = (modo_taller or "").strip().lower()
    if (modo or "").strip():
        data["modo"] = modo
    elif mt in ("1", "true", "yes", "y"):
        data["modo"] = "taller"

    rid = getattr(req.state, "request_id", _get_request_id(req))
    t0 = time.time()
    r = await _motor_post("/api/analyze-key", files=files, data=data, request_id=rid, req=req)

    if r.status_code == 200:
        ct = (r.headers.get("content-type") or "").split(";")[0]
        if ct == "application/json":
            try:
                payload = r.json()
                payload = normalize_contract(payload)
                _inject_meta(payload, rid)
                proc_ms = int((time.time() - t0) * 1000)
                _log_analyze(rid, proc_ms, payload)

                # BLOQUE 3.1: PolicyEngine operativo o QualityGate legacy
                override = (req.headers.get("X-Quality-Override") or "").strip() == "1"
                is_workshop = bool((req.headers.get("X-Workshop-Token") or "").strip()) or mt in ("1", "true", "yes", "y")

                if SCN_FEATURE_POLICY_ENGINE_ACTIVE:
                    block_resp, modified = await execute_policy_actions(payload, f_bytes, override, is_workshop)
                    if block_resp is not None:
                        _inject_meta(block_resp, rid)
                        return JSONResponse(content=block_resp, status_code=422)
                    if modified is not None:
                        payload = modified
                elif SCN_FEATURE_QUALITY_GATE_ACTIVE:
                    block_resp, modified = check_quality_gate(payload, override)
                    if block_resp is not None:
                        _inject_meta(block_resp, rid)
                        return JSONResponse(content=block_resp, status_code=422)
                    if modified is not None:
                        payload = modified

                return JSONResponse(content=payload, status_code=200)
            except Exception:
                pass
    return _proxy_httpx_json(r, rid)
@APP.post("/api/ingest-key")
async def ingest_key(
    req: Request,
    front: UploadFile = File(None),
    back: UploadFile = File(None),
    image_front: UploadFile = File(None),
    image_back: UploadFile = File(None),
    _: bool = Depends(require_apikey),
):
    if not _gcs_ok():
        raise HTTPException(status_code=501, detail="Ingest no disponible en modo local. Usa /api/analyze-key.")
    return await _ingest_key_impl(req, front, back, image_front, image_back)


async def _ingest_key_impl(
    req: Request,
    front: UploadFile,
    back: Optional[UploadFile],
    image_front: Optional[UploadFile],
    image_back: Optional[UploadFile],
):
    f = front or image_front
    b = back or image_back
    if f is None:
        raise HTTPException(400, "front requerido (front o image_front)")

    f_bytes = await f.read()
    b_bytes = await b.read() if b is not None else b""

    job_id = uuid.uuid4().hex
    input_id = job_id
    dp = _date_prefix(datetime.now(timezone.utc))

    a_path = f"{KEY_PREFIX}/{dp}/{input_id}_A.jpg"
    b_path = f"{KEY_PREFIX}/{dp}/{input_id}_B.jpg" if b_bytes else None
    job_path = f"{JOB_PREFIX}/{dp}/{job_id}.json"

    _gcs_put_bytes(KEY_BUCKET, a_path, f_bytes, f.content_type or "image/jpeg")
    if b_path:
        _gcs_put_bytes(KEY_BUCKET, b_path, b_bytes, (b.content_type if b else None) or "image/jpeg")

    job = {
        "job_id": job_id,
        "input_id": input_id,
        "status": "queued",
        "created_at": _now_iso(),
        "bucket": KEY_BUCKET,
        "objects": {"A": a_path, "B": b_path},
        "hash": {"A": _sha256(f_bytes), "B": (_sha256(b_bytes) if b_bytes else None)},
        "attempts": 0,
        "last_error": None,
        "result": None,
    }
    _gcs_put_json(KEY_BUCKET, job_path, job)
    return {"ok": True, "job_id": job_id, "status": "queued", "job_object": job_path}

@APP.get("/api/job/{job_id}")
async def job_status(
    req: Request,
    job_id: str,
    process: str = "1",
    _: bool = Depends(require_apikey),
):
    if not _gcs_ok():
        raise HTTPException(status_code=501, detail="Job status no disponible en modo local.")
    return await _job_status_impl(req, job_id, process)


async def _job_status_impl(req: Request, job_id: str, process: str = "1"):
    try:
        job_path = _find_job_path(job_id)
    except FileNotFoundError:
        raise HTTPException(404, "job no encontrado")

    job = _gcs_get_json(KEY_BUCKET, job_path)

    if job.get("status") in ("done", "error") or process not in ("1", "true", "yes", "y"):
        return {"ok": True, **job}

    if not MOTOR_URL:
        job["last_error"] = "MOTOR_URL no configurado"
        _gcs_put_json(KEY_BUCKET, job_path, job)
        return {"ok": True, **job}

    try:
        job["status"] = "processing"
        job["attempts"] = int(job.get("attempts") or 0) + 1
        _gcs_put_json(KEY_BUCKET, job_path, job)

        a_bytes = _gcs_get_bytes(KEY_BUCKET, job["objects"]["A"])
        b_obj = job["objects"].get("B")
        b_bytes = _gcs_get_bytes(KEY_BUCKET, b_obj) if b_obj else b""

        files = {"front": ("front.jpg", a_bytes, "image/jpeg")}
        if b_bytes:
            files["back"] = ("back.jpg", b_bytes, "image/jpeg")

        # web “aprende” en modo taller
        data = {"modo": "taller"}
        rid = getattr(req.state, "request_id", _get_request_id(req))

        r = await _motor_post("/api/analyze-key", files=files, data=data, request_id=rid)

        if r.status_code >= 400:
            job["status"] = "error"
            job["last_error"] = f"motor {r.status_code}"
            _gcs_put_json(KEY_BUCKET, job_path, job)
            return {"ok": True, **job}

        job["status"] = "done"
        job["result"] = r.json()
        job["finished_at"] = _now_iso()
        _gcs_put_json(KEY_BUCKET, job_path, job)
        return {"ok": True, **job}

    except Exception as e:
        job["status"] = "error"
        job["last_error"] = f"{type(e).__name__}: {str(e)[:180]}"
        _gcs_put_json(KEY_BUCKET, job_path, job)
        return {"ok": True, **job}


# -----------------------------
# BLOQUE 4.1: Idempotencia feedback
# -----------------------------
def _normalize_manual_for_key(payload: Dict[str, Any]) -> Dict[str, str]:
    """Extrae y normaliza manual_data/manual para hash determinista."""
    manual = payload.get("manual_data") or payload.get("manual")
    if not isinstance(manual, dict):
        return {}
    out = {}
    for k, v in sorted(manual.items()):
        if v is None:
            out[k] = ""
        elif isinstance(v, (str, int, float, bool)):
            out[k] = str(v).strip()
        else:
            out[k] = json.dumps(v, sort_keys=True, ensure_ascii=False)
    return out


def _compute_feedback_idempotency_key(payload: Dict[str, Any]) -> str:
    """
    Clave determinista para un feedback lógico.
    Hash de: input_id, selected_id/correction target, correction, manual_data normalizado, fecha truncada.
    """
    dt = datetime.now(timezone.utc)
    date_str = f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}"
    input_id = (payload.get("input_id") or payload.get("job_id") or "").strip()
    selected = (
        payload.get("selected_id")
        or payload.get("selected_id_model_ref")
        or payload.get("id_model_ref")
        or ""
    )
    if not selected and isinstance(payload.get("choice"), dict):
        selected = payload.get("choice", {}).get("id_model_ref") or payload.get("choice", {}).get("selected_id") or ""
    correction = bool(payload.get("correction", False))
    manual_norm = _normalize_manual_for_key(payload)
    manual_str = json.dumps(manual_norm, sort_keys=True, ensure_ascii=False)
    chosen_rank = payload.get("chosen_rank") or payload.get("selected_rank")
    rank_str = str(chosen_rank) if chosen_rank is not None else ""
    canonical = f"{input_id}|{selected}|{correction}|{rank_str}|{manual_str}|{date_str}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _get_feedback_idempotency_key(req: Request, payload: Dict[str, Any]) -> str:
    """Obtiene clave: Idempotency-Key header o fallback determinista desde payload."""
    header_key = (req.headers.get("Idempotency-Key") or req.headers.get("idempotency-key") or "").strip()
    if header_key and len(header_key) <= 128:
        return header_key
    return _compute_feedback_idempotency_key(payload)


def _idempotency_registry_path(key: str, date_prefix: str) -> str:
    return f"{IDEMPOTENCY_KEYS_PREFIX}/{date_prefix}/{key}.json"


def _idempotency_local_dir() -> str:
    """Directorio local para registro idempotencia cuando GCS no está disponible."""
    base = os.getenv("IDEMPOTENCY_LOCAL_DIR", "").strip() or os.path.join(os.path.dirname(__file__), ".idempotency_keys")
    os.makedirs(base, exist_ok=True)
    return base


def _check_idempotency_seen(key: str) -> tuple[bool, Optional[Dict[str, Any]]]:
    """Devuelve (visto, respuesta_cacheada). GCS o fichero local según disponibilidad."""
    dp = _date_prefix(datetime.now(timezone.utc))
    if _gcs_ok():
        path = _idempotency_registry_path(key, dp)
        try:
            rec = _gcs_get_json(KEY_BUCKET, path)
        except FileNotFoundError:
            return False, None
    else:
        local_dir = _idempotency_local_dir()
        subdir = os.path.join(local_dir, dp.replace("/", os.sep))
        os.makedirs(subdir, exist_ok=True)
        fpath = os.path.join(subdir, f"{key}.json")
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                rec = json.load(f)
        except FileNotFoundError:
            return False, None
        except (json.JSONDecodeError, OSError):
            return False, None
    first_seen = rec.get("first_seen_unix", 0)
    if time.time() - first_seen > IDEMPOTENCY_TTL_SECONDS:
        return False, None
    return True, rec.get("response")


def _store_idempotency(key: str, response: Dict[str, Any]) -> None:
    """Registra clave idempotente con respuesta cacheada. GCS o fichero local."""
    dp = _date_prefix(datetime.now(timezone.utc))
    rec = {"first_seen_unix": int(time.time()), "first_seen_iso": _now_iso(), "response": response}
    if _gcs_ok():
        path = _idempotency_registry_path(key, dp)
        _gcs_put_json(KEY_BUCKET, path, rec)
    else:
        local_dir = _idempotency_local_dir()
        subdir = os.path.join(local_dir, dp.replace("/", os.sep))
        os.makedirs(subdir, exist_ok=True)
        fpath = os.path.join(subdir, f"{key}.json")
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False, indent=None)
        except OSError:
            _log.warning("No se pudo guardar idempotency key local: %s", fpath)


@APP.post("/api/feedback")
async def feedback(req: Request, _: bool = Depends(require_apikey)):
    try:
        payload = await req.json()
    except Exception:
        raise HTTPException(400, "JSON inválido")
    if not isinstance(payload, dict):
        payload = {}

    idem_key = _get_feedback_idempotency_key(req, payload)
    seen, cached = _check_idempotency_seen(idem_key)
    if seen and cached is not None:
        _log.info("feedback_idempotent", extra={"idempotency_key": idem_key[:16] + "..."})
        out = dict(cached) if isinstance(cached, dict) else {"ok": True}
        out["deduped"] = True
        return JSONResponse(content=out)

    if not _gcs_ok():
        resp = {"ok": True, "stored": "local"}
        _store_idempotency(idem_key, resp)
        return resp

    dp = _date_prefix(datetime.now(timezone.utc))
    ts = int(time.time())
    input_id = (payload.get("input_id") or payload.get("job_id") or uuid.uuid4().hex)

    path = f"{FEEDBACK_PREFIX}/{dp}/{input_id}_{ts}.json"
    _gcs_put_json(KEY_BUCKET, path, {"received_at": _now_iso(), **payload})
    resp = {"ok": True, "stored": path}
    _store_idempotency(idem_key, resp)
    return resp
