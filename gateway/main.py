import os, json, time, uuid, hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Set

import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import google.auth.transport.requests
from google.oauth2 import id_token
from google.cloud import storage

APP_VERSION = "0.5.0"

SCHEMA_VERSION = "2026-02-17"
POLICY_VERSION = "none"

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

def _proxy_httpx_json(r: httpx.Response, request_id: str):
    ct = (r.headers.get("content-type") or "application/json").split(";")[0]
    if ct == "application/json":
        try:
            payload = r.json()
            # SCN_PATCH_MANUFACTURER_HINT_DEFAULT
            if isinstance(payload, dict) and "manufacturer_hint" not in payload:
                payload["manufacturer_hint"] = {"found": False, "name": None, "confidence": 0.0}
        except Exception:
            payload = {"ok": False, "error": "invalid_json_from_upstream", "status_code": r.status_code}
        _inject_meta(payload, request_id)
        # SCN_PATCH_MANUFACTURER_HINT_BEFORE_RETURN
if isinstance(payload, dict) and 'manufacturer_hint' not in payload:
    payload['manufacturer_hint'] = {'found': False, 'name': None, 'confidence': 0.0}

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

# CORS
allowed = [o.strip() for o in (ALLOWED_ORIGINS_RAW or "").split(",") if o.strip()]
APP.add_middleware(
    CORSMiddleware,
    allow_origins=(["*"] if not allowed or allowed == ["*"] else allowed),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GCS client (usa el Service Account del servicio)
_gcs = storage.Client()

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

def _gcs_put_json(bucket: str, path: str, obj: Dict[str, Any]):
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    blob.upload_from_string(
        json.dumps(obj, ensure_ascii=False).encode("utf-8"),
        content_type="application/json; charset=utf-8",
    )

def _gcs_get_json(bucket: str, path: str) -> Dict[str, Any]:
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    return json.loads(blob.download_as_bytes().decode("utf-8"))

def _gcs_put_bytes(bucket: str, path: str, data: bytes, content_type: str = "image/jpeg"):
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    blob.upload_from_string(data, content_type=content_type)

def _gcs_get_bytes(bucket: str, path: str) -> bytes:
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    return blob.download_as_bytes()

def _find_job_path(job_id: str, lookback_days: int = 14) -> str:
    now = datetime.now(timezone.utc)
    b = _gcs.bucket(KEY_BUCKET)
    for i in range(lookback_days + 1):
        dp = _date_prefix(now - timedelta(days=i))
        p = f"{JOB_PREFIX}/{dp}/{job_id}.json"
        if b.blob(p).exists():
            return p
    raise FileNotFoundError(job_id)

async def _motor_post(path: str, files=None, data=None) -> httpx.Response:
    if not MOTOR_URL:
        raise HTTPException(500, "MOTOR_URL no configurado")
    headers = _get_auth_headers()

    last_exc = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                return await client.post(f"{MOTOR_URL}{path}", headers=headers, files=files, data=data)
        except Exception as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor timeout/error: {type(last_exc).__name__}")


async def _motor_get(path: str):
    if not MOTOR_URL:
        raise HTTPException(500, "MOTOR_URL no configurado")
    headers = _get_auth_headers()

    last_exc = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                return await client.get(f"{MOTOR_URL}{path}", headers=headers)
        except Exception as e:
            last_exc = e
            if attempt == 2:
                raise HTTPException(504, f"motor timeout/error: {type(last_exc).__name__}")

# -----------------------------
# Routes
# -----------------------------
@APP.get("/health")
def health():
    return {"ok": True, "service": "gateway", "version": APP_VERSION}

@APP.api_route("/motor/health", methods=["GET","POST"])
@APP.api_route("/motor/health/", methods=["GET","POST"], include_in_schema=False)
async def motor_health(req: Request, _: bool = Depends(require_apikey)):
    r = await _motor_get("/health")
    rid = getattr(req.state, "request_id", _get_request_id(req))
    return _proxy_httpx_json(r, rid)

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
    f = front or image_front
    b = back or image_back
    if f is None:
        raise HTTPException(400, "front requerido (front o image_front)")

    f_bytes = await f.read()
    b_bytes = await b.read() if b is not None else b""

    files = {"front": ("front.jpg", f_bytes, f.content_type or "image/jpeg")}
    if b_bytes:
        files["back"] = ("back.jpg", b_bytes, (b.content_type if b else None) or "image/jpeg")

    data = {}
    mt = (modo_taller or "").strip().lower()
    if (modo or "").strip():
        data["modo"] = modo
    elif mt in ("1", "true", "yes", "y"):
        data["modo"] = "taller"

    r = await _motor_post("/api/analyze-key", files=files, data=data)
    rid = getattr(req.state, "request_id", _get_request_id(req))
    data = _ensure_contract_v2(data)

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
async def job_status(req: Request, 
    job_id: str,
    process: str = "1",
    _: bool = Depends(require_apikey),
):
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

        r = await _motor_post("/api/analyze-key", files=files, data=data)

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

@APP.post("/api/feedback")
async def feedback(req: Request, _: bool = Depends(require_apikey)):
    try:
        payload = await req.json()
    except Exception:
        raise HTTPException(400, "JSON inválido")

    dp = _date_prefix(datetime.now(timezone.utc))
    ts = int(time.time())
    input_id = (payload.get("input_id") or payload.get("job_id") or uuid.uuid4().hex)

    path = f"{FEEDBACK_PREFIX}/{dp}/{input_id}_{ts}.json"
    _gcs_put_json(KEY_BUCKET, path, {"received_at": _now_iso(), **payload})
    return {"ok": True, "stored": path}
