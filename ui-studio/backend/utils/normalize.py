"""ScanKey Contract Normalizer - mismo contrato que gateway/normalize.py"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from .roi_bbox import ensure_valid_crop_bbox, apply_fallback_penalty
from .size_class import apply_size_class_tiebreak, size_class_explain_suffix

THRESHOLD_HIGH = 0.95
THRESHOLD_LOW = 0.60
THRESHOLD_STORE = 0.75
STORAGE_PROBABILITY = 0.75
MAX_SAMPLES_PER_REF = 30
UNRELIABLE_CROP_SUFFIX = " Recorte no fiable."


def _get_confidence(item: Dict[str, Any]) -> float:
    v = item.get("confidence") or item.get("conf") or item.get("score")
    try:
        return float(max(0.0, min(1.0, float(v))))
    except (TypeError, ValueError):
        return 0.0


def _normalize_result(item: Dict[str, Any], rank: int, roi_sources: Optional[List[str]] = None) -> Dict[str, Any]:
    conf = _get_confidence(item)
    bbox, roi_source, was_fallback = ensure_valid_crop_bbox(item, "")
    conf = apply_fallback_penalty(conf, was_fallback)
    if roi_sources is not None:
        roi_sources.append(roi_source)
    explain = item.get("explain_text") or ("Sin más candidatos." if rank > 1 else "")
    if was_fallback and explain and not explain.endswith(UNRELIABLE_CROP_SUFFIX.strip()):
        explain = explain.rstrip() + UNRELIABLE_CROP_SUFFIX
    elif was_fallback and not explain:
        explain = "Recorte no fiable."
    ct = item.get("compatibility_tags")
    if not isinstance(ct, list):
        ct = [ct] if isinstance(ct, str) else []
    out = {
        "rank": rank,
        "brand": item.get("brand") or item.get("label"),
        "model": item.get("model") or item.get("id_model_ref") or item.get("label"),
        "type": item.get("type") or ("No identificado" if rank > 1 and not item else "key"),
        "confidence": conf,
        "explain_text": explain,
        "compatibility_tags": ct,
        "id_model_ref": item.get("id_model_ref") or item.get("ref"),
        "crop_bbox": bbox,
    }
    return out


def _normalize_contract_core(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Lógica compartida de normalización."""
    items = raw.get("results") or raw.get("candidates") or []
    if not isinstance(items, list):
        items = []
    # manufacturer_hint ranking: si found && confidence>=0.85, boost <=+5% a compatibles
    mh = raw.get("manufacturer_hint")
    if isinstance(mh, dict) and mh.get("found") and float(mh.get("confidence") or 0) >= 0.85:
        hint_name = mh.get("name")

        def _sort_key(x: Dict[str, Any]) -> float:
            c = _get_confidence(x)
            brand = (x.get("brand") or x.get("model") or x.get("label")) or ""
            if hint_name and brand and str(brand).strip().lower() == str(hint_name).strip().lower():
                return c + min(0.05, 1.0 - c)
            return c

        items = sorted(items, key=_sort_key, reverse=True)
    else:
        items = sorted(items, key=lambda x: _get_confidence(x), reverse=True)

    def _get_bbox(it: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return it.get("crop_bbox") or it.get("bbox")

    items, size_class_applied, ref_size_class = apply_size_class_tiebreak(
        items, _get_confidence, _get_bbox
    )

    roi_sources: List[str] = []
    results: List[Dict[str, Any]] = []
    for i, it in enumerate(items[:3], start=1):
        results.append(_normalize_result(dict(it or {}), i, roi_sources))

    if size_class_applied and ref_size_class and results:
        suffix = size_class_explain_suffix(ref_size_class, True)
        if suffix and not (results[0].get("explain_text") or "").rstrip().endswith(suffix.strip()):
            results[0]["explain_text"] = (results[0].get("explain_text") or "").rstrip() + suffix

    while len(results) < 3:
        results.append(_normalize_result({}, len(results) + 1, roi_sources))
    top_conf = results[0]["confidence"]
    if not isinstance(mh, dict):
        mh = {}
    mh = {"found": bool(mh.get("found")), "name": mh.get("name"), "confidence": float(mh.get("confidence", 0) or 0)}
    current = raw.get("current_samples_for_candidate")
    current = int(current) if isinstance(current, (int, float)) else -1
    should_store = raw.get("should_store_sample", top_conf >= THRESHOLD_STORE and (current < 0 or current < MAX_SAMPLES_PER_REF))
    debug = dict(raw.get("debug") or {})
    debug["roi_source"] = roi_sources[0] if roi_sources else "fallback"
    return {
        "manufacturer_hint": mh,
        "results": results,
        "low_confidence": top_conf < THRESHOLD_LOW,
        "high_confidence": top_conf >= THRESHOLD_HIGH,
        "should_store_sample": bool(should_store),
        "storage_probability": float(raw.get("storage_probability", STORAGE_PROBABILITY)),
        "current_samples_for_candidate": current,
        "manual_correction_hint": raw.get("manual_correction_hint") or {"fields": ["marca", "modelo", "tipo"]},
        "debug": debug,
    }


def normalize_engine_output(raw: Dict[str, Any], input_id: str, proc_time: int) -> Dict[str, Any]:
    """
    Normaliza la salida del motor al contrato estricto ScanKey.
    Acepta variantes (candidates/results, conf/confidence, bbox/crop_bbox).
    """
    core = _normalize_contract_core(raw)
    ts = raw.get("timestamp") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "input_id": input_id,
        "timestamp": ts,
        **core,
        "debug": {**core["debug"], "processing_time_ms": proc_time, "model_version": "scankey-v2-prod", "roi_source": core["debug"].get("roi_source", "fallback")},
    }
