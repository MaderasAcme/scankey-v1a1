# IMPORTANTE: Dockerfile usa uvicorn main:APP
"""Gateway entrypoint — APP, middleware, route wiring."""
import io
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import httpx
from PIL import Image

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from normalize import normalize_contract
from quality_gate_active import check_quality_gate
from policy_actions import execute_policy_actions
from rate_limit import check_rate_limit, get_identifier, is_enabled as rate_limit_enabled
from audit import audit_analyze, audit_feedback, audit_login

from core.config import (
    APP_VERSION,
    SCHEMA_VERSION,
    POLICY_VERSION,
    MOTOR_URL,
    KEY_BUCKET,
    KEY_PREFIX,
    JOB_PREFIX,
    FEEDBACK_PREFIX,
    SCN_FEATURE_QUALITY_GATE_ACTIVE,
    SCN_FEATURE_POLICY_ENGINE_ACTIVE,
    MAX_PAYLOAD_BYTES,
    MAX_PAYLOAD_MB,
    ALLOWED_IMAGE_TYPES,
    MAX_IMAGE_DIM,
    WORKSHOP_LOGIN_EMAIL,
    WORKSHOP_LOGIN_PASSWORD,
    WORKSHOP_TOKEN,
    ALLOWED_ORIGINS_RAW,
)
from core.request_meta import get_request_id, client_ip
from core.security import require_apikey, get_auth_headers, validate_login, get_workshop_token
from core.gcs_utils import (
    gcs_ok,
    gcs_put_json,
    gcs_get_json,
    gcs_put_bytes,
    gcs_get_bytes,
    find_job_path,
    sha256 as _sha256,
    date_prefix as _date_prefix,
)
from core.motor_proxy import motor_post as _motor_post, motor_get as _motor_get
from core.idempotency import (
    get_feedback_idempotency_key_from_request,
    check_idempotency_seen,
    store_idempotency,
)

import logging
_log = logging.getLogger(__name__)

APP = FastAPI(title="ScanKey Gateway", version=APP_VERSION, redirect_slashes=False)

# CORS
allowed = [o.strip() for o in (ALLOWED_ORIGINS_RAW or "").split(",") if o.strip()]
APP.add_middleware(
    CORSMiddleware,
    allow_origins=(["*"] if not allowed or allowed == ["*"] else allowed),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _inject_meta(obj, request_id: str):
    if isinstance(obj, dict):
        obj.setdefault("schema_version", SCHEMA_VERSION)
        obj.setdefault("policy_version", POLICY_VERSION)
        obj.setdefault("request_id", request_id)
        obj.setdefault("gateway_version", APP_VERSION)
    return obj


def _log_analyze(request_id: str, processing_time_ms: int, payload: Dict[str, Any]):
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
            if isinstance(payload, dict):
                payload.setdefault("manufacturer_hint", {"found": False, "name": None, "confidence": 0.0})
                for _k in ("results", "candidates"):
                    _lst = payload.get(_k)
                    if isinstance(_lst, list):
                        for _it in _lst:
                            if isinstance(_it, dict):
                                _ct = _it.get("compatibility_tags")
                                if _ct is None:
                                    _ct = []
                                elif isinstance(_ct, str):
                                    _ct = [_ct]
                                else:
                                    _ct = _ct if isinstance(_ct, list) else []
                                _it["compatibility_tags"] = _ct
                                _tags = _it.get("tags")
                                _it["tags"] = _tags if isinstance(_tags, list) else _ct
            if isinstance(payload, dict) and "manufacturer_hint" not in payload:
                payload["manufacturer_hint"] = {"found": False, "name": None, "confidence": 0.0}
        except Exception:
            payload = {"ok": False, "error": "invalid_json_from_upstream", "status_code": r.status_code}
        _inject_meta(payload, request_id)
        return JSONResponse(content=payload, status_code=r.status_code)
    return Response(content=r.content, status_code=r.status_code, media_type=ct)


@APP.middleware("http")
async def _mw_request_id(request: Request, call_next):
    rid = get_request_id(request)
    request.state.request_id = rid
    resp = await call_next(request)
    resp.headers["x-request-id"] = rid
    resp.headers["x-schema-version"] = SCHEMA_VERSION
    resp.headers["x-policy-version"] = POLICY_VERSION
    return resp


_RATE_LIMIT_PATHS = {
    "/api/auth/login": "login",
    "/api/analyze-key": "analyze",
    "/api/feedback": "feedback",
}


@APP.middleware("http")
async def _mw_rate_limit(request: Request, call_next):
    if not rate_limit_enabled():
        return await call_next(request)
    path = (request.scope.get("path") or "").split("?")[0]
    endpoint = _RATE_LIMIT_PATHS.get(path)
    if not endpoint:
        return await call_next(request)
    ident = get_identifier(request)
    limited, limit, remaining, retry_after = check_rate_limit(ident, endpoint)
    if limited:
        rid = getattr(request.state, "request_id", get_request_id(request))
        body = {
            "ok": False,
            "error": "RATE_LIMITED",
            "message": "Demasiadas solicitudes. Intenta de nuevo más tarde.",
        }
        resp = JSONResponse(content=body, status_code=429)
        resp.headers["x-request-id"] = rid
        if retry_after > 0:
            resp.headers["Retry-After"] = str(retry_after)
        resp.headers["X-RateLimit-Limit"] = str(limit)
        resp.headers["X-RateLimit-Remaining"] = "0"
        return resp
    resp = await call_next(request)
    resp.headers["X-RateLimit-Limit"] = str(limit)
    resp.headers["X-RateLimit-Remaining"] = str(remaining)
    return resp


# ---------- Routes ----------
@APP.get("/health")
def health():
    return {"ok": True, "service": "gateway", "version": APP_VERSION}


@APP.post("/api/auth/login")
async def auth_login(req: Request):
    rid = getattr(req.state, "request_id", get_request_id(req))
    ip = client_ip(req)
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "JSON inválido")
    email_raw = (body.get("email") or "").strip()
    email = email_raw.lower() if email_raw else ""
    password = str(body.get("password") or "")
    if not WORKSHOP_LOGIN_EMAIL or not WORKSHOP_LOGIN_PASSWORD or not WORKSHOP_TOKEN:
        audit_login(rid, "/api/auth/login", 503, "not_configured", ip=ip)
        return JSONResponse(
            content={"ok": False, "error": "LOGIN_NOT_CONFIGURED"},
            status_code=503,
        )
    if not validate_login(email, password):
        audit_login(rid, "/api/auth/login", 401, "invalid_credentials", ip=ip)
        return JSONResponse(
            content={"ok": False, "error": "INVALID_CREDENTIALS"},
            status_code=401,
        )
    audit_login(rid, "/api/auth/login", 200, "success", ip=ip)
    return {
        "ok": True,
        "role": "taller",
        "workshop_token": get_workshop_token(),
        "operator_label": "OPERADOR SENIOR",
        "expires_in_days": 7,
    }


@APP.api_route("/motor/health", methods=["GET", "POST"])
@APP.api_route("/motor/health/", methods=["GET", "POST"], include_in_schema=False)
async def motor_health(req: Request):
    rid = getattr(req.state, "request_id", get_request_id(req))
    r = await _motor_get("/health", request_id=rid)
    return _proxy_httpx_json(r, rid)


def _validate_image_payload(f_bytes: bytes, content_type: Optional[str], field: str) -> None:
    if len(f_bytes) > MAX_PAYLOAD_BYTES:
        raise HTTPException(413, f"Payload demasiado grande: {field} > {MAX_PAYLOAD_MB}MB")
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct and ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, f"Content-Type no soportado: {ct}. Usa image/jpeg, image/png o image/webp.")
    try:
        img = Image.open(io.BytesIO(f_bytes))
        img.verify()
    except Exception as e:
        raise HTTPException(400, f"Imagen inválida: {field} ({type(e).__name__})")
    try:
        img2 = Image.open(io.BytesIO(f_bytes))
        w, h = img2.size
        if w > MAX_IMAGE_DIM or h > MAX_IMAGE_DIM:
            raise HTTPException(400, f"Imagen demasiado grande: {w}x{h} (máx {MAX_IMAGE_DIM})")
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
):
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
    rid = getattr(req.state, "request_id", get_request_id(req))
    api_key = (req.headers.get("x-api-key") or "").strip()
    ip = client_ip(req)
    role = "taller" if mt in ("1", "true", "yes", "y") or (req.headers.get("X-Workshop-Token") or "").strip() else "cliente"
    t0 = time.time()
    r = await _motor_post("/api/analyze-key", files=files, data=data, request_id=rid, req=req)

    def _audit_analyze_exit(status: int, top1=None, confidence=None, policy_action=None):
        audit_analyze(rid, "/api/analyze-key", status, role=role, ip=ip, api_key=api_key or None, top1=top1, confidence=confidence, policy_action=policy_action)

    if r.status_code == 200:
        ct = (r.headers.get("content-type") or "").split(";")[0]
        if ct == "application/json":
            try:
                payload = r.json()
                payload = normalize_contract(payload)
                _inject_meta(payload, rid)
                proc_ms = int((time.time() - t0) * 1000)
                _log_analyze(rid, proc_ms, payload)
                override = (req.headers.get("X-Quality-Override") or "").strip() == "1"
                is_workshop = bool((req.headers.get("X-Workshop-Token") or "").strip()) or mt in ("1", "true", "yes", "y")
                if SCN_FEATURE_POLICY_ENGINE_ACTIVE:
                    block_resp, modified = await execute_policy_actions(payload, f_bytes, override, is_workshop)
                    if block_resp is not None:
                        _inject_meta(block_resp, rid)
                        _audit_analyze_exit(422, policy_action=block_resp.get("policy_action"))
                        return JSONResponse(content=block_resp, status_code=422)
                    if modified is not None:
                        payload = modified
                elif SCN_FEATURE_QUALITY_GATE_ACTIVE:
                    block_resp, modified = check_quality_gate(payload, override)
                    if block_resp is not None:
                        _inject_meta(block_resp, rid)
                        _audit_analyze_exit(422, policy_action=block_resp.get("policy_action"))
                        return JSONResponse(content=block_resp, status_code=422)
                    if modified is not None:
                        payload = modified
                res0 = (payload.get("results") or [{}])[0] if isinstance(payload.get("results"), list) else {}
                top1 = res0.get("model") or res0.get("id_model_ref")
                conf = res0.get("confidence")
                pa = (payload.get("debug") or {}).get("policy_action")
                _audit_analyze_exit(200, top1=top1, confidence=conf, policy_action=pa)
                return JSONResponse(content=payload, status_code=200)
            except Exception:
                pass
    final = _proxy_httpx_json(r, rid)
    _audit_analyze_exit(r.status_code)
    return final


@APP.post("/api/ingest-key")
async def ingest_key(
    req: Request,
    front: UploadFile = File(None),
    back: UploadFile = File(None),
    image_front: UploadFile = File(None),
    image_back: UploadFile = File(None),
    _: bool = Depends(require_apikey),
):
    if not gcs_ok():
        raise HTTPException(status_code=501, detail="Ingest no disponible en modo local. Usa /api/analyze-key.")
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
    gcs_put_bytes(KEY_BUCKET, a_path, f_bytes, f.content_type or "image/jpeg")
    if b_path:
        gcs_put_bytes(KEY_BUCKET, b_path, b_bytes, (b.content_type if b else None) or "image/jpeg")
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
    gcs_put_json(KEY_BUCKET, job_path, job)
    return {"ok": True, "job_id": job_id, "status": "queued", "job_object": job_path}


@APP.get("/api/job/{job_id}")
async def job_status(req: Request, job_id: str, process: str = "1", _: bool = Depends(require_apikey)):
    if not gcs_ok():
        raise HTTPException(status_code=501, detail="Job status no disponible en modo local.")
    try:
        job_path = find_job_path(KEY_BUCKET, job_id, JOB_PREFIX)
    except FileNotFoundError:
        raise HTTPException(404, "job no encontrado")
    job = gcs_get_json(KEY_BUCKET, job_path)
    if job.get("status") in ("done", "error") or process not in ("1", "true", "yes", "y"):
        return {"ok": True, **job}
    if not MOTOR_URL:
        job["last_error"] = "MOTOR_URL no configurado"
        gcs_put_json(KEY_BUCKET, job_path, job)
        return {"ok": True, **job}
    try:
        job["status"] = "processing"
        job["attempts"] = int(job.get("attempts") or 0) + 1
        gcs_put_json(KEY_BUCKET, job_path, job)
        a_bytes = gcs_get_bytes(KEY_BUCKET, job["objects"]["A"])
        b_obj = job["objects"].get("B")
        b_bytes = gcs_get_bytes(KEY_BUCKET, b_obj) if b_obj else b""
        files = {"front": ("front.jpg", a_bytes, "image/jpeg")}
        if b_bytes:
            files["back"] = ("back.jpg", b_bytes, "image/jpeg")
        data = {"modo": "taller"}
        rid = getattr(req.state, "request_id", get_request_id(req))
        r = await _motor_post("/api/analyze-key", files=files, data=data, request_id=rid)
        if r.status_code >= 400:
            job["status"] = "error"
            job["last_error"] = f"motor {r.status_code}"
            gcs_put_json(KEY_BUCKET, job_path, job)
            return {"ok": True, **job}
        job["status"] = "done"
        job["result"] = r.json()
        job["finished_at"] = _now_iso()
        gcs_put_json(KEY_BUCKET, job_path, job)
        return {"ok": True, **job}
    except Exception as e:
        job["status"] = "error"
        job["last_error"] = f"{type(e).__name__}: {str(e)[:180]}"
        gcs_put_json(KEY_BUCKET, job_path, job)
        return {"ok": True, **job}


@APP.post("/api/feedback")
async def feedback(req: Request):
    rid = getattr(req.state, "request_id", get_request_id(req))
    api_key = (req.headers.get("x-api-key") or "").strip()
    ip = client_ip(req)
    try:
        payload = await req.json()
    except Exception:
        raise HTTPException(400, "JSON inválido")
    if not isinstance(payload, dict):
        payload = {}
    idem_key = get_feedback_idempotency_key_from_request(req, payload)
    seen, cached = check_idempotency_seen(idem_key)
    if seen and cached is not None:
        _log.info("feedback_idempotent", extra={"idempotency_key": idem_key[:16] + "..."})
        out = dict(cached) if isinstance(cached, dict) else {"ok": True}
        out["deduped"] = True
        audit_feedback(rid, "/api/feedback", 200, role="cliente", ip=ip, api_key=api_key or None, deduped=True)
        return JSONResponse(content=out)
    if not gcs_ok():
        resp = {"ok": True, "stored": "local"}
        store_idempotency(idem_key, resp)
        top1 = payload.get("selected_id") or (payload.get("choice") or {}).get("id_model_ref")
        audit_feedback(rid, "/api/feedback", 200, role="cliente", ip=ip, api_key=api_key or None, top1=top1, deduped=False)
        return resp
    dp = _date_prefix(datetime.now(timezone.utc))
    ts = int(time.time())
    input_id = payload.get("input_id") or payload.get("job_id") or uuid.uuid4().hex
    path = f"{FEEDBACK_PREFIX}/{dp}/{input_id}_{ts}.json"
    gcs_put_json(KEY_BUCKET, path, {"received_at": _now_iso(), **payload})
    resp = {"ok": True, "stored": path}
    store_idempotency(idem_key, resp)
    top1 = payload.get("selected_id") or (payload.get("choice") or {}).get("id_model_ref")
    audit_feedback(rid, "/api/feedback", 200, role="cliente", ip=ip, api_key=api_key or None, top1=top1, deduped=False)
    return resp
