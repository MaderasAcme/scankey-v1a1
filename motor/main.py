import hashlib
import re
import os
# catalog es opcional: el motor NO debe caerse si falta
try:
    import catalog as _catalog  # /app/catalog.py
except Exception:
    try:
        from motor import catalog as _catalog  # /app/motor/catalog.py
    except Exception:
        _catalog = None
if _catalog and hasattr(_catalog, "load"):
    _catalog.load()
import time
import json
import uuid
import random
import threading
import numpy as np
from typing import Optional, Dict, Any, List, Tuple
import datetime

from google.cloud import storage
import onnxruntime as ort
from PIL import Image as PILImage
import io
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from model_bootstrap import ensure_model

BOOT_TS = time.time()

STATE: Dict[str, Any] = {
    "model_ready": False,
    "model_loading": False,
    "model_path": os.getenv("MODEL_PATH", "/tmp/modelo_llaves.onnx"),
    "input_name": None,
    "input_shape": None,
    "labels_count": 0,
    "error": None,
}

_LOCK = threading.Lock()
_SESSION: Optional[ort.InferenceSession] = None
_LABELS: Optional[List[str]] = None

app = FastAPI()




# --- Legacy compat: ensure out["results"] exists as 3 items derived from candidates ---
from starlette.responses import Response

@app.middleware("http")
async def legacy_results_middleware(request, call_next):
    resp = await call_next(request)

    if request.url.path != "/api/analyze-key" or resp.status_code != 200:
        return resp

    ctype = (resp.headers.get("content-type") or "")
    if "application/json" not in ctype:
        return resp

    # Read body safely (resp may be streaming)
    body = b""
    if getattr(resp, "body", None):
        body = resp.body
    else:
        async for chunk in resp.body_iterator:
            body += chunk

    if not body:
        return resp

    import json
    try:
        obj = json.loads(body.decode("utf-8"))
    except Exception:
        return Response(content=body, status_code=resp.status_code, media_type="application/json")

    res = obj.get("results") or []
    if isinstance(res, list) and len(res) == 3:
        return Response(content=body, status_code=resp.status_code, media_type="application/json")

    cands = obj.get("candidates") or []
    results=[]
    if isinstance(cands, list):
        for c in cands[:3]:
            model = c.get("label") or c.get("model") or c.get("ref") or None
            conf  = c.get("score") if c.get("score") is not None else c.get("confidence")
            try: conf = float(conf)
            except Exception: conf = None
            results.append({"model": model, "confidence": conf})

    while len(results) < 3:
        results.append({"model": None, "confidence": None})

    obj["results"] = results
    new_body = json.dumps(obj, ensure_ascii=False).encode("utf-8")

    return Response(content=new_body, status_code=resp.status_code, media_type="application/json")

@app.on_event("startup")
def _scankey_bootstrap_event():
    from model_bootstrap import ensure_model
    print("BOOTSTRAP event_start", flush=True)
    try:
        ok = ensure_model()
        print(f"BOOTSTRAP event_done ok={ok}", flush=True)
    except Exception as e:
        print(f"BOOTSTRAP event_failed err={type(e).__name__}:{e}", flush=True)
        raise

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
def _canon(x: Optional[str]) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (x or "").upper())


def _safe_name(name: Optional[str], max_len: int = 80) -> str:
    name = (name or "front.jpg").strip()
    out = []
    for c in name:
        if c.isalnum() or c in "._-":
            out.append(c)
        else:
            out.append("_")
    return ("".join(out)[:max_len]) or "front.jpg"


def _guess_content_type(filename: Optional[str]) -> str:
    fn = (filename or "").lower()
    if fn.endswith(".png"):
        return "image/png"
    if fn.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"


def _safe_ext_from_obj(obj: Optional[str]) -> str:
    base = (obj or "").lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if base.endswith(ext):
            return ext
    return ".jpg"


def _parse_gs_uri(uri: str) -> Tuple[Optional[str], Optional[str]]:
    if not uri or not uri.startswith("gs://"):
        return None, None
    rest = uri[5:]
    if "/" not in rest:
        return None, None
    b, obj = rest.split("/", 1)
    return b, obj


def _list_count_images(bucket_name: str, prefix: str, limit: int = 9999) -> int:
    client = storage.Client()
    cnt = 0
    for blob in client.list_blobs(bucket_name, prefix=prefix):
        name = (blob.name or "").lower()
        if name.endswith((".jpg", ".jpeg", ".png", ".webp")):
            cnt += 1
            if cnt >= limit:
                break
    return cnt


def _maybe_store_sample_to_gcs(raw_bytes: bytes, filename_hint: str, modo: str, side: str = "A") -> Dict[str, Any]:
    """
    Guarda muestra "raw" bajo samples/<A|B>/... (best-effort).
    Nunca debe romper inferencia.
    """
    bucket_name = (os.getenv("GCS_BUCKET", "") or "").strip()
    if not bucket_name:
        return {"stored": False, "reason": "GCS_BUCKET vacío"}

    only_if_taller = (os.getenv("STORE_ONLY_IF_MODO_TALLER", "0") or "0").strip() == "1"
    if only_if_taller and (modo or "").strip().lower() != "taller":
        return {"stored": False, "reason": "STORE_ONLY_IF_MODO_TALLER=1 y modo!=taller"}

    prefix = (os.getenv("GCS_SAMPLES_PREFIX", "samples") or "samples").strip().strip("/")
    safe = _safe_name(filename_hint or "image.jpg")
    ts = int(time.time())
    side2 = "B" if (side or "").strip().upper().startswith("B") else "A"
    obj = f"{prefix}/{side2}/{ts}_{safe}"
    gcs_uri = f"gs://{bucket_name}/{obj}"

    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(obj)
        blob.upload_from_string(raw_bytes, content_type=_guess_content_type(safe))
        return {"stored": True, "gcs_uri": gcs_uri, "side": side2}
    except Exception as e:
        return {"stored": False, "reason": f"store_error: {type(e).__name__}: {e}", "gcs_uri": gcs_uri, "side": side2}



def _store_copy_to_keys_date(raw_bytes: bytes, filename_hint: str, input_id: str, side: str, sample_gcs_uri: Optional[str] = None, analysis: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Dual-store: además de samples/{A,B}/..., guarda una copia en keys/YYYY/MM/DD/...
    Se puede desactivar con STORE_DUAL_KEYS=0
    """
    if (os.getenv("STORE_DUAL_KEYS", "1") or "1").strip() != "1":
        return {"stored_keys": False, "keys_reason": "STORE_DUAL_KEYS=0"}

    bucket_name = (os.getenv("GCS_BUCKET", "") or "").strip()
    if not bucket_name:
        return {"stored_keys": False, "keys_reason": "GCS_BUCKET vacío"}

    safe = (filename_hint or "").split("/")[-1].split("\\")[-1].strip() or "image.jpg"
    low = safe.lower()
    ext = ".png" if low.endswith(".png") else ".jpg"
    ct  = "image/png" if ext == ".png" else "image/jpeg"

    dt = datetime.datetime.utcnow()
    date_path = dt.strftime("%Y/%m/%d")
    kind = "front" if (side or "").upper() == "A" else "back"

    img_obj  = f"keys/{date_path}/{input_id}_{kind}{ext}"
    meta_obj = f"keys/{date_path}/{input_id}_{kind}.json"

    try:
        from google.cloud import storage
        client = storage.Client()
        bucket = client.bucket(bucket_name)

        bucket.blob(img_obj).upload_from_string(raw_bytes, content_type=ct)

        meta = {
            "input_id": input_id,
            "side": side,
            "kind": kind,
            "filename_hint": safe,
            "stored_at": dt.replace(microsecond=0).isoformat() + "Z",
            "sample_gcs_uri": sample_gcs_uri,
            "analysis": analysis,
        }
        bucket.blob(meta_obj).upload_from_string(
            json.dumps(meta, ensure_ascii=False),
            content_type="application/json"
        )

        return {
            "stored_keys": True,
            "gcs_uri_keys": f"gs://{bucket_name}/{img_obj}",
            "meta_keys": {"stored": True, "gcs_uri": f"gs://{bucket_name}/{meta_obj}"},
        }
    except Exception as e:
        return {"stored_keys": False, "keys_reason": str(e)}


def _store_json_sidecar(bucket_name: str, obj: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(obj)
        txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        blob.upload_from_string(txt.encode("utf-8"), content_type="application/json")
        return {"stored": True, "gcs_uri": f"gs://{bucket_name}/{obj}"}
    except Exception as e:
        return {"stored": False, "reason": f"{type(e).__name__}: {e}"}


def _store_meta_sidecar(meta: Dict[str, Any], image_gcs_uri: str) -> Dict[str, Any]:
    bucket_name, obj = _parse_gs_uri(image_gcs_uri)
    if not bucket_name or not obj:
        return {"stored": False, "reason": "image_gcs_uri inválida"}

    meta_obj = re.sub(r"\.(jpg|jpeg|png|webp)$", ".json", obj, flags=re.I)
    if meta_obj == obj:
        meta_obj = obj + ".json"
    return _store_json_sidecar(bucket_name, meta_obj, meta)


def _store_feedback_sidecar(meta: Dict[str, Any], image_gcs_uri: str) -> Dict[str, Any]:
    bucket_name, obj = _parse_gs_uri(image_gcs_uri)
    if not bucket_name or not obj:
        return {"stored": False, "reason": "gcs_uri inválida"}

    fb_obj = re.sub(r"\.(jpg|jpeg|png|webp)$", ".feedback.json", obj, flags=re.I)
    if fb_obj == obj:
        fb_obj = obj + ".feedback.json"
    return _store_json_sidecar(bucket_name, fb_obj, meta)


def _copy_to_by_ref(src_gcs_uri: str, ref_final_canon: str, side: str, input_id: str) -> Dict[str, Any]:
    enable = (os.getenv("ENABLE_CURATED_BY_REF", "1") or "1").strip() == "1"
    if not enable:
        return {"stored": False, "reason": "ENABLE_CURATED_BY_REF=0"}

    bucket_src, obj_src = _parse_gs_uri(src_gcs_uri)
    if not bucket_src or not obj_src:
        return {"stored": False, "reason": "src_gcs_uri inválida"}

    bucket_dst = (os.getenv("GCS_BY_REF_BUCKET", "") or "").strip() or bucket_src
    prefix = (os.getenv("GCS_BY_REF_PREFIX", "by_ref") or "by_ref").strip().strip("/")
    side2 = "B" if (side or "").strip().upper().startswith("B") else "A"
    ref2 = _canon(ref_final_canon)
    if not ref2:
        return {"stored": False, "reason": "ref_final_canon inválida"}

    max_n = int((os.getenv("MAX_SAMPLES_PER_REF_SIDE", "30") or "30").strip() or "30")
    dst_prefix = f"{prefix}/{ref2}/{side2}/"

    try:
        cur = _list_count_images(bucket_dst, dst_prefix, limit=max_n + 1)
        if cur >= max_n:
            return {"stored": False, "reason": f"MAX_SAMPLES_PER_REF_SIDE alcanzado ({cur}/{max_n})", "count": cur, "max": max_n}
    except Exception:
        cur = None

    base = os.path.basename(obj_src) or "image"
    safe = _safe_name(base)
    ts = int(time.time())
    iid2 = re.sub(r"[^a-zA-Z0-9]+", "", (input_id or ""))[:12]
    ext = _safe_ext_from_obj(obj_src)
    if not safe.lower().endswith(ext):
        safe = re.sub(r"\.[a-z0-9]{1,5}$", "", safe, flags=re.I) + ext

    dst_obj = f"{dst_prefix}{ts}_{iid2}_{safe}".replace("//", "/")
    dst_gcs_uri = f"gs://{bucket_dst}/{dst_obj}"

    try:
        client = storage.Client()
        bsrc = client.bucket(bucket_src)
        bdst = client.bucket(bucket_dst)

        src_blob = bsrc.blob(obj_src)
        bdst.copy_blob(src_blob, bdst, new_name=dst_obj)

        return {"stored": True, "gcs_uri": dst_gcs_uri, "count_before": cur, "max": max_n, "side": side2, "ref": ref2}
    except Exception as e:
        return {"stored": False, "reason": f"copy_error: {type(e).__name__}: {e}", "gcs_uri": dst_gcs_uri, "side": side2, "ref": ref2}


def _labels_path() -> str:
    p = (os.getenv("LABELS_PATH", "") or "").strip()
    if p:
        return p
    return os.path.join(os.path.dirname(__file__), "labels.json")


def _load_labels() -> List[str]:
    p = _labels_path()
    if not os.path.exists(p):
        return []
    try:
        obj = json.load(open(p, "r", encoding="utf-8"))
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            for k in ("labels", "classes"):
                if k in obj and isinstance(obj[k], list):
                    return obj[k]
        return []
    except Exception:
        return []


def _infer_shape_to_hw(shape) -> Tuple[int, int]:
    try:
        if isinstance(shape, (list, tuple)) and len(shape) >= 4:
            h = shape[2]
            w = shape[3]
            H = int(h) if isinstance(h, int) else 224
            W = int(w) if isinstance(w, int) else 224
            return H, W
    except Exception:
        pass
    return 224, 224


def _preprocess(img: PILImage.Image, input_shape):
    H, W = _infer_shape_to_hw(input_shape)
    img = img.convert("RGB").resize((W, H))
    x = np.asarray(img).astype(np.float32) / 255.0
    x = np.transpose(x, (2, 0, 1))
    x = np.expand_dims(x, 0)
    return x


def _softmax(logits):
    x = np.array(logits, dtype=np.float32)
    x = x - np.max(x)
    ex = np.exp(x)
    return ex / (np.sum(ex) + 1e-9)


def _ensure_session():
    global _SESSION, _LABELS
    with _LOCK:
        if _SESSION is not None and _LABELS is not None:
            return
        if STATE["model_loading"]:
            return
        STATE["model_loading"] = True

    def loader():
        global _SESSION, _LABELS
        try:
            ensure_model()
            mp = STATE["model_path"]
            sess = ort.InferenceSession(mp, providers=["CPUExecutionProvider"])
            input_name = sess.get_inputs()[0].name
            input_shape = sess.get_inputs()[0].shape
            labels = _load_labels()
            with _LOCK:
                _SESSION = sess
                _LABELS = labels
                STATE["model_ready"] = True
                STATE["model_loading"] = False
                STATE["input_name"] = input_name
                STATE["input_shape"] = input_shape
                STATE["labels_count"] = len(labels)
                STATE["error"] = None
        except Exception as e:
            with _LOCK:
                STATE["model_ready"] = False
                STATE["model_loading"] = False
                STATE["error"] = f"{type(e).__name__}: {e}"

    th = threading.Thread(target=loader, daemon=True)
    th.start()


@app.on_event("startup")
def startup():
    from model_bootstrap import ensure_model
    try:
        ensure_model()
        print('BOOTSTRAP startup_after_ensure', flush=True)
    except Exception as e:
        print(f'BOOTSTRAP startup_failed err={type(e).__name__}:{e}', flush=True)
        raise
    _ensure_session()


@app.get("/health")
def health():
    return {
        "ok": True,
        "uptime_s": round(time.time() - BOOT_TS, 2),
        "model_ready": bool(STATE["model_ready"]),
        "model_loading": bool(STATE["model_loading"]),
        "labels_count": int(STATE["labels_count"] or 0),
        "model_path": STATE.get("model_path"),
        "error": STATE.get("error"),
    }


@app.get("/ready")
def ready():
    if not STATE["model_ready"]:
        return JSONResponse(status_code=503, content={"ok": False, "error": "ENGINE_NOT_READY"})
    return {"ok": True}


@app.get("/debug/routes")
def debug_routes():
    return [{"path": r.path, "name": r.name, "methods": sorted(list(getattr(r, "methods", []) or []))} for r in app.router.routes]


def _predict(img: PILImage.Image, ref_hint: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if not STATE["model_ready"] or _SESSION is None:
        raise HTTPException(status_code=503, detail="ENGINE_NOT_READY")

    x = _preprocess(img, STATE["input_shape"])
    out = _SESSION.run(None, {STATE["input_name"]: x})[0]
    out = np.squeeze(out)
    probs = _softmax(out)

    labels = _LABELS or []
    idxs = np.argsort(-probs)[:3]
    cands: List[Dict[str, Any]] = []
    hint = {"ref_hint": (ref_hint or None)}

    for idx in idxs:
        idx = int(idx)
        label = labels[idx] if idx < len(labels) else f"CLASS_{idx}"
        cands.append({"label": label, "score": float(np.asarray(probs).reshape(-1)[int(idx)]), "idx": int(idx)})

    return cands, hint


@app.post("/api/analyze-key")
def analyze_key(
    front: UploadFile = File(...),
    back: UploadFile = File(None),
    modo: Optional[str] = Form(None),
    ref_hint: Optional[str] = None,
    image_front: Optional[UploadFile] = File(None),
    image_back: Optional[UploadFile] = File(None),
    modo_taller: Optional[str] = Form(None),
):
    front_up = front or image_front
    back_up = back or image_back

    if front_up is None:
        raise HTTPException(status_code=400, detail="front requerido (usa front o image_front)")

    modo2 = (modo or "").strip().lower()
    if not modo2:
        mt = (modo_taller or "").strip().lower()
        modo2 = "taller" if mt in ("1", "true", "yes", "y") else "cliente"
    if modo2 not in ("taller", "cliente"):
        modo2 = "cliente"

    try:
        front_up.file.seek(0)
    except Exception:
        pass
    data = front_up.file.read()

    raw_back = b""
    if back_up is not None:
        try:
            back_up.file.seek(0)
        except Exception:
            pass
        raw_back = back_up.file.read() or b""

    if not data:
        raise HTTPException(400, "archivo vacío")

    try:
        img = PILImage.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise HTTPException(
            400,
            f"imagen inválida ({type(e).__name__}: {e}) len={len(data) if data else 0} "
            f"first16={(data[:16].hex() if data else None)} ct={getattr(front_up, 'content_type', None)} fn={getattr(front_up, 'filename', None)}",
        )

    t0 = time.time()
    cands, hint = _predict(img, ref_hint)
    dt_ms = int((time.time() - t0) * 1000)

    top_label = (cands[0]["label"] if cands else None)
    top_score = float(cands[0]["score"]) if cands else 0.0

    high_confidence = top_score >= 0.95
    low_confidence = top_score < 0.60

    storage_probability = float(__import__("os").getenv("STORAGE_PROBABILITY","0.75"))
    should_store_sample = False
    current_samples_for_candidate = -1

    if top_label:
        try:
            bucket_dst = (os.getenv("GCS_BY_REF_BUCKET", "") or "").strip() or (os.getenv("GCS_BUCKET", "") or "").strip()
            by_ref_prefix = (os.getenv("GCS_BY_REF_PREFIX", "by_ref") or "by_ref").strip().strip("/")
            max_n = int((os.getenv("MAX_SAMPLES_PER_REF_SIDE", "30") or "30").strip() or "30")
            if bucket_dst:
                ref_c = _canon(top_label)
                a_prefix = f"{by_ref_prefix}/{ref_c}/A/"
                current_samples_for_candidate = _list_count_images(bucket_dst, a_prefix, limit=max_n + 1)
        except Exception:
            current_samples_for_candidate = -1

    if top_label and top_score >= 0.75:
        max_n = int((os.getenv("MAX_SAMPLES_PER_REF_SIDE", "30") or "30").strip() or "30")
        if current_samples_for_candidate == -1 or current_samples_for_candidate < max_n:
            should_store_sample = (random.random() < storage_probability)

    store = {"stored": False, "reason": "policy", "side": "A"}
    store_back = {"stored": False, "reason": "no_back", "side": "B"}

    input_id = uuid.uuid4().hex
    ts_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if should_store_sample:
        store = _maybe_store_sample_to_gcs(data, getattr(front_up, "filename", "") or "front.jpg", modo2, side="A")
        if store.get("stored"):
            store.update(_store_copy_to_keys_date(
                raw_bytes=data,
                filename_hint=(getattr(front_up, "filename", "") or "front.jpg"),
                input_id=input_id,
                side="A",
                sample_gcs_uri=store.get("gcs_uri"),
            ))
        if raw_back and len(raw_back) > 1000:
            store_back = _maybe_store_sample_to_gcs(raw_back, getattr(back_up, "filename", "") or "back.jpg", modo2, side="B")
            if store_back.get("stored"):
                store_back.update(_store_copy_to_keys_date(
                    raw_bytes=raw_back,
                    filename_hint=(getattr(back_up, "filename", "") or "back.jpg"),
                    input_id=input_id,
                    side="B",
                    sample_gcs_uri=store_back.get("gcs_uri"),
                ))

    base_meta = {
        "input_id": input_id,
        "ts_unix": int(time.time()),
        "ts_utc": ts_utc,
        "modo": modo2,
        "result": {
            "candidates": cands,
            "top_label": top_label,
            "top_score": top_score,
            "hint": hint,
            "high_confidence": high_confidence,
            "low_confidence": low_confidence,
        },
        "runtime": {
            "service": os.getenv("K_SERVICE", ""),
            "revision": os.getenv("K_REVISION", ""),
            "project": os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            "processing_time_ms": dt_ms,
        },
        "model": {
            "model_gcs_uri": os.getenv("MODEL_GCS_URI", ""),
            "labels_gcs_uri": os.getenv("LABELS_GCS_URI", ""),
            "model_version": os.getenv("MODEL_VERSION", ""),
        },
        "policy": {
            "should_store_sample": should_store_sample,
            "storage_probability": storage_probability,
            "current_samples_for_candidate": current_samples_for_candidate,
            "max_samples_per_ref_side": int((os.getenv("MAX_SAMPLES_PER_REF_SIDE", "30") or "30").strip() or "30"),
        },
    }

    if store.get("stored") and store.get("gcs_uri"):
        meta = dict(base_meta)
        meta["img"] = {
            "side": "A",
            "filename": (getattr(front_up, "filename", "") or "front.jpg"),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        store["meta"] = _store_meta_sidecar(meta, store["gcs_uri"])

    if store_back.get("stored") and store_back.get("gcs_uri"):
        meta = dict(base_meta)
        meta["img"] = {
            "side": "B",
            "filename": (getattr(back_up, "filename", "") or "back.jpg"),
            "bytes": len(raw_back),
            "sha256": hashlib.sha256(raw_back).hexdigest(),
        }
        store_back["meta"] = _store_meta_sidecar(meta, store_back["gcs_uri"])

    return {
        "ok": True,
        "input_id": input_id,
        "timestamp": ts_utc,
        "candidates": cands,
        "hint": hint,
        "high_confidence": high_confidence,
        "low_confidence": low_confidence,
        "should_store_sample": should_store_sample,
        "storage_probability": storage_probability,
        "current_samples_for_candidate": current_samples_for_candidate,
        "store": store,
        "store_back": store_back,
    }


@app.post("/api/feedback")
def feedback(
    payload: Optional[Dict[str, Any]] = Body(default=None),
    gcs_uri: str = "",
    gcs_uri_back: Optional[str] = None,
    side: Optional[str] = None,
    side_back: Optional[str] = None,
    input_id: Optional[str] = None,
    modo: Optional[str] = None,
    ref_final: str = "",
    ref_source: str = "confirmed",
    ref_best: Optional[str] = None,
    taller_id: Optional[str] = None,
    country: Optional[str] = None,
    city: Optional[str] = None,
    note: Optional[str] = None,
):
    if isinstance(payload, dict) and payload:
        gcs_uri = (payload.get("gcs_uri") or gcs_uri or "").strip()
        gcs_uri_back = (payload.get("gcs_uri_back") or gcs_uri_back or None)
        side = (payload.get("side") or side or None)
        side_back = (payload.get("side_back") or side_back or None)
        input_id = (payload.get("input_id") or input_id or None)
        modo = (payload.get("modo") or modo or None)

        ref_final = (payload.get("ref_final") or ref_final or "").strip()
        ref_source = (payload.get("ref_source") or ref_source or "confirmed").strip()
        ref_best = (payload.get("ref_best") or ref_best or None)
        taller_id = (payload.get("taller_id") or taller_id or None)
        country = (payload.get("country") or country or None)
        city = (payload.get("city") or city or None)
        note = (payload.get("note") or note or None)

    if not ref_final:
        raise HTTPException(400, "ref_final requerido")

    items: List[Dict[str, Any]] = []
    if isinstance(payload, dict) and isinstance(payload.get("items"), list) and payload.get("items"):
        for it in payload.get("items"):
            if not isinstance(it, dict):
                continue
            u = (it.get("gcs_uri") or "").strip()
            if not u:
                continue
            items.append({"gcs_uri": u, "side": (it.get("side") or None)})
    else:
        if gcs_uri:
            items.append({"gcs_uri": gcs_uri, "side": side})
        if gcs_uri_back:
            items.append({"gcs_uri": str(gcs_uri_back).strip(), "side": (side_back or "B")})

    if not items:
        raise HTTPException(400, "gcs_uri requerido (body.items o query gcs_uri)")

    modo2 = (modo or "").strip().lower()
    if modo2 not in ("taller", "cliente"):
        modo2 = "taller"

    curated_only_taller = (os.getenv("CURATED_STORE_ONLY_IF_MODO_TALLER", "1") or "1").strip() == "1"
    allow_curated = (not curated_only_taller) or (modo2 == "taller")

    now_unix = int(time.time())
    ts_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    input_id2 = (input_id or "").strip() or uuid.uuid4().hex

    ref_final_canon = _canon(ref_final)
    ref_best_canon = _canon(ref_best) if ref_best else None

    out_items: List[Dict[str, Any]] = []

    for it in items:
        uri = (it.get("gcs_uri") or "").strip()
        sd = (it.get("side") or "").strip().upper()

        if sd not in ("A", "B"):
            _, obj = _parse_gs_uri(uri)
            obj2 = (obj or "").lower()
            if "/b/" in obj2 or "back" in obj2:
                sd = "B"
            else:
                sd = "A"

        meta = {
            "input_id": input_id2,
            "ts_unix": now_unix,
            "ts_utc": ts_utc,
            "modo": modo2,
            "gcs_uri": uri,
            "side": sd,
            "ref_best": (ref_best or None),
            "ref_best_canon": ref_best_canon,
            "ref_final": ref_final,
            "ref_final_canon": ref_final_canon,
            "ref_source": (ref_source or "").strip().lower(),
            "ctx": {
                "taller_id": (taller_id or None),
                "country": (country or None),
                "city": (city or None),
            },
            "note": (note or None),
            "runtime": {
                "service": os.getenv("K_SERVICE", ""),
                "revision": os.getenv("K_REVISION", ""),
                "project": os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            },
            "model": {"model_version": os.getenv("MODEL_VERSION", "")},
        }

        fb = _store_feedback_sidecar(meta, uri)

        curated = {"stored": False, "reason": "skipped"}
        curated_meta = None
        if allow_curated:
            curated = _copy_to_by_ref(uri, ref_final_canon, sd, input_id=input_id2)
            if curated.get("stored") and curated.get("gcs_uri"):
                meta2 = dict(meta)
                meta2["kind"] = "curated_by_ref"
                meta2["source_gcs_uri"] = uri
                curated_meta = _store_meta_sidecar(meta2, curated["gcs_uri"])

        out_items.append(
            {
                "side": sd,
                "gcs_uri": uri,
                "feedback_sidecar": fb,
                "curated_copy": curated,
                "curated_meta": curated_meta,
            }
        )

    return {
        "ok": True,
        "input_id": input_id2,
        "ts_utc": ts_utc,
        "ref_final": ref_final,
        "ref_final_canon": ref_final_canon,
        "modo": modo2,
        "items": out_items,
    }


# Arranca carga del modelo en startup
@app.on_event("startup")
def _startup2():
    _ensure_session()


# --- Catalog endpoints ---
@app.get("/api/catalog/version")
def api_catalog_version():
    if not _catalog:
        return {"ok": False, "enabled": False, "error": "catalog_disabled"}
    return _catalog.version()

@app.get("/api/catalog/{ref}")
def api_catalog_ref(ref: str):
    if not _catalog:
        return {"ok": False, "enabled": False, "error": "catalog_disabled"}
    it = _catalog.get(ref)
    if not it:
        return {"ok": False, "error": "not_found", "ref": ref}
    return {"ok": True, "ref": ref, "item": it}

@app.get("/__build")
def __build():
    import os
    return {"ok": True, "deploy_stamp": os.getenv("DEPLOY_STAMP","")}

# --- ScanKey debug (solo para diagnóstico) ---
@app.get("/debug/model-files")
def debug_model_files():
    from pathlib import Path
    paths = [
        "/tmp/modelo_llaves.onnx",
        "/tmp/modelo_llaves.onnx.data",
        "/tmp/labels.json",
    ]
    out = []
    for p in paths:
        pp = Path(p)
        out.append({
            "path": p,
            "exists": pp.exists(),
            "size": (pp.stat().st_size if pp.exists() else None),
        })
    return {"files": out}

@app.get("/debug/env")
def debug_env():
    import os
    keys = [
        "MODEL_GCS", "MODEL_GCS_URI",
        "MODEL_GCS_DATA_URI", "MODEL_DATA_GCS_URI",
        "LABELS_GCS", "LABELS_GCS_URI",
        "DEPLOY_STAMP",
        "GUNICORN_TIMEOUT", "GUNICORN_GRACEFUL_TIMEOUT",
    ]
    return {k: os.getenv(k) for k in keys}


# --- Debug bootstrap (forzar descarga) ---
@app.post("/debug/bootstrap-now")
def debug_bootstrap_now():
    from model_bootstrap import ensure_model, MODEL_DST, DATA_DST, LABELS_DST
    from pathlib import Path
    err = None
    ok = False
    try:
        ok = ensure_model()
    except Exception as e:
        err = f"{type(e).__name__}:{e}"

    def stat(p):
        pp = Path(p)
        return {"path": p, "exists": pp.exists(), "size": (pp.stat().st_size if pp.exists() else None)}

    return {
        "ok": ok,
        "err": err,
        "files": [stat(MODEL_DST), stat(DATA_DST), stat(LABELS_DST)],
    }

