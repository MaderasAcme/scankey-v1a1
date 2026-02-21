# Normalizador: convierte el payload legacy (gateway/motor v1) al schema oficial ScanKey.
# Objetivo: estabilidad de UI + evolución del motor sin romper clientes.

from datetime import datetime, timezone

FIELDS_MANUAL = ["marca","modelo","tipo","orientacion","ocr_text"]

def _iso_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")

def _safe_float(x, default=0.0):
    try:
        return float(x)
    except Exception:
        return float(default)

def _safe_list(x):
    return x if isinstance(x, list) else []

def normalize_engine_response(p):
    """
    Devuelve un dict que sigue el schema oficial definido por ScanKey.
    Se apoya en:
      - p["results"] legacy: [{type,brand,model,confidence,ref,reason?...}, ...]
      - p["candidates"]: [{label,score,idx}, ...]
    """
    if not isinstance(p, dict):
        return {
            "input_id": "",
            "timestamp": _iso_now(),
            "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
            "results": [],
            "low_confidence": True,
            "high_confidence": False,
            "should_store_sample": False,
            "storage_probability": 0.0,
            "current_samples_for_candidate": 0,
            "manual_correction_hint": {"fields": FIELDS_MANUAL},
            "debug": {"processing_time_ms": None, "model_version": None},
        }

    input_id = str(p.get("input_id") or "")
    ts = p.get("timestamp") or _iso_now()

    # manufacturer_hint: hoy no lo tienes en el payload -> dejamos placeholder robusto
    mh = p.get("manufacturer_hint")
    if isinstance(mh, dict):
        manufacturer_hint = {
            "found": bool(mh.get("found")),
            "name": mh.get("name"),
            "confidence": _safe_float(mh.get("confidence"), 0.0),
        }
    else:
        manufacturer_hint = {"found": False, "name": None, "confidence": 0.0}

    legacy_results = p.get("results")
    legacy_results = legacy_results if isinstance(legacy_results, list) else []

    candidates = p.get("candidates")
    candidates = candidates if isinstance(candidates, list) else []

    out = []
    for i in range(3):
        r = legacy_results[i] if i < len(legacy_results) and isinstance(legacy_results[i], dict) else {}
        cand = candidates[i] if i < len(candidates) and isinstance(candidates[i], dict) else {}

        conf = _safe_float(r.get("confidence", cand.get("score", 0.0)), 0.0)
        id_ref = r.get("id_model_ref") or r.get("ref") or cand.get("label")
        id_ref = id_ref if id_ref not in ("", None) else None

        typ = r.get("type") or "key"
        brand = r.get("brand")
        model = r.get("model") or id_ref
        orientation = r.get("orientation")
        head_color = r.get("head_color")
        visual_state = r.get("visual_state")
        patentada = bool(r.get("patentada", False))
        tags = _safe_list(r.get("compatibility_tags"))

        crop = r.get("crop_bbox")
        if not (isinstance(crop, dict) and all(k in crop for k in ("x","y","w","h"))):
            crop = None

        explain = r.get("explain_text") or r.get("reason")
        if not explain:
            if r.get("reason") == "no_candidate" or (conf <= 0 and id_ref is None):
                explain = "Sin candidato"
            elif conf > 0:
                explain = "Inferencia visual"
            else:
                explain = "Sin datos"

        out.append({
            "rank": i + 1,
            "id_model_ref": id_ref,
            "type": typ,
            "brand": brand,
            "model": model,
            "orientation": orientation,
            "head_color": head_color,
            "visual_state": visual_state,
            "patentada": patentada,
            "compatibility_tags": tags,
            "confidence": conf,
            "explain_text": str(explain),
            "crop_bbox": crop,
        })

    # flags (si vienen ya calculadas, las respetamos; si no, las recalculamos)
    top = _safe_float(out[0]["confidence"], 0.0) if out else 0.0
    high = bool(p.get("high_confidence")) if "high_confidence" in p else (top >= 0.95)
    low = bool(p.get("low_confidence")) if "low_confidence" in p else (top < 0.60)

    should_store = bool(p.get("should_store_sample", False))
    storage_prob = _safe_float(p.get("storage_probability", 0.0), 0.0)
    curr_samples = int(p.get("current_samples_for_candidate", 0) or 0)

    dbg = p.get("debug") if isinstance(p.get("debug"), dict) else {}
    debug = {
        "processing_time_ms": dbg.get("processing_time_ms"),
        "model_version": dbg.get("model_version"),
    }

    return {
        "input_id": input_id,
        "timestamp": ts,
        "manufacturer_hint": manufacturer_hint,
        "results": out,
        "low_confidence": low,
        "high_confidence": high,
        "should_store_sample": should_store,
        "storage_probability": storage_prob,
        "current_samples_for_candidate": curr_samples,
        "manual_correction_hint": {"fields": FIELDS_MANUAL},
        "debug": debug,
    }
