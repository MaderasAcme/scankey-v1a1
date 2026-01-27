import os
import time
import json
import threading
from io import BytesIO

import numpy as np
import onnxruntime as ort
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from model_bootstrap import ensure_model

BOOT_TS = time.time()

STATE = {
    "model_ready": False,
    "model_loading": False,
    "model_path": os.getenv("MODEL_PATH", "/tmp/modelo_llaves.onnx"),
    "input_name": None,
    "input_shape": None,
    "labels_count": 0,
    "error": None,
}

_LOCK = threading.Lock()
_SESSION = None
_LABELS = None

app = FastAPI()


def _labels_path() -> str:
    # Preferimos labels descargadas en runtime (Cloud Run) si existe LABELS_PATH
    p = (os.getenv("LABELS_PATH", "") or "").strip()
    if p:
        return p
    return os.path.join(os.path.dirname(__file__), "labels.json")


def _load_labels():
    p = _labels_path()
    if not os.path.exists(p):
        return []
    try:
        obj = json.load(open(p, "r", encoding="utf-8"))
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            # soporta {"labels":[...]} o {"classes":[...]}
            for k in ("labels", "classes"):
                if k in obj and isinstance(obj[k], list):
                    return obj[k]
        return []
    except Exception:
        return []


def _infer_shape_to_hw(shape):
    # shape típico: ['batch', 3, 224, 224] o [1,3,224,224]
    try:
        if isinstance(shape, (list, tuple)) and len(shape) >= 4:
            c = shape[1]
            h = shape[2]
            w = shape[3]
            H = int(h) if isinstance(h, int) else 224
            W = int(w) if isinstance(w, int) else 224
            return H, W
    except Exception:
        pass
    return 224, 224


def _preprocess(img: Image.Image, input_shape):
    H, W = _infer_shape_to_hw(input_shape)
    img = img.convert("RGB").resize((W, H))
    x = np.asarray(img).astype(np.float32) / 255.0  # (H,W,3)
    x = np.transpose(x, (2, 0, 1))                  # (3,H,W)
    x = np.expand_dims(x, 0)                        # (1,3,H,W)
    return x


def _ensure_session():
    global _SESSION, _LABELS
    with _LOCK:
        if _SESSION is not None:
            return _SESSION

        STATE["model_loading"] = True
        try:
            mp = ensure_model()
            STATE["model_path"] = mp

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            sess = ort.InferenceSession(mp, sess_options=opts, providers=["CPUExecutionProvider"])

            inp = sess.get_inputs()[0]
            STATE["input_name"] = inp.name
            STATE["input_shape"] = inp.shape

            labels = _load_labels()
            _LABELS = labels
            STATE["labels_count"] = len(labels)

            _SESSION = sess
            STATE["model_ready"] = True
            STATE["error"] = None
            return _SESSION
        except Exception as e:
            STATE["error"] = str(e)
            STATE["model_ready"] = False
            raise
        finally:
            STATE["model_loading"] = False


def _load_bg():
    try:
        _ensure_session()
    except Exception:
        # el error ya queda en STATE["error"]
        pass


@app.on_event("startup")
def startup():
    threading.Thread(target=_load_bg, daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "uptime_s": round(time.time() - BOOT_TS, 2),
        "model_ready": STATE["model_ready"],
        "model_loading": STATE["model_loading"],
        "model_path": STATE["model_path"],
        "input_name": STATE["input_name"],
        "input_shape": STATE["input_shape"],
        "labels_count": STATE["labels_count"],
        "error": STATE["error"],
    }


@app.get("/ready")
def ready():
    # 200 solo si el modelo está listo; si no, 503 (para readiness real)
    if not STATE["model_ready"]:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "model_ready": False,
                "model_loading": STATE["model_loading"],
                "error": STATE["error"],
            },
        )
    return {"ok": True, "model_ready": True}


@app.get("/debug/files")
def debug_files():
    import os

    mp = STATE["model_path"]
    dp = (mp or "") + ".data"
    lp = _labels_path()

    def stat(path: str):
        try:
            if not path:
                return {"exists": False, "size": None}
            exists = os.path.exists(path)
            return {"exists": exists, "size": (os.path.getsize(path) if exists else None)}
        except Exception as e:
            return {"exists": os.path.exists(path), "error": str(e)}

    return {
        "paths": {"model_path": mp, "data_path": dp, "labels_path": lp},
        "model": stat(mp),
        "data": stat(dp),
        "labels": stat(lp),
    }


def _read_image(file: UploadFile) -> Image.Image:
    data = file.file.read()
    if not data:
        raise HTTPException(400, "archivo vacío")
    try:
        return Image.open(BytesIO(data))
    except Exception:
        raise HTTPException(400, "imagen inválida")


def _softmax(v):
    v = np.asarray(v, dtype=np.float32)
    if v.size == 1:
        return np.array([1.0], dtype=np.float32)
    v = v - np.max(v)
    e = np.exp(v)
    s = np.sum(e)
    return e / s if s > 0 else np.ones_like(v) / float(v.size)


def _predict(img: Image.Image):
    sess = _ensure_session()
    inp = sess.get_inputs()[0]
    x = _preprocess(img, inp.shape)

    y = sess.run(None, {inp.name: x})[0]
    y = np.asarray(y)
    if y.ndim == 1:
        y = y[None, :]
    scores = y[0]

    probs = _softmax(scores)
    n = probs.size

    labels = _LABELS or []
    topk = min(3, n)
    idxs = np.argsort(-probs)[:topk]

    cands = []
    for idx in idxs:
        idx = int(idx)
        label = labels[idx] if idx < len(labels) else f"CLASS_{idx}"
        cands.append({"label": label, "score": float(probs[idx]), "idx": idx})
    return cands


@app.post("/api/analyze-key")
def analyze_key(front: UploadFile = File(...), back: UploadFile = File(None)):
    img = _read_image(front)
    cands = _predict(img)
    return {"ok": True, "candidates": cands}
