"""
ROI/crop_bbox: normalización fiable con fallback seguro.
Copia de gateway/roi_bbox.py para uso en ui-studio backend.
"""
from typing import Dict, Any, Optional, Tuple

FULL_FRAME = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
CONFIDENCE_PENALTY_FALLBACK = 0.02


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def normalize_bbox(
    raw: Optional[Dict[str, Any]],
    img_w: Optional[float] = None,
    img_h: Optional[float] = None,
) -> Tuple[Dict[str, float], str]:
    if not raw or not isinstance(raw, dict):
        return (FULL_FRAME.copy(), "fallback")
    x = _to_float(raw.get("x") if "x" in raw else raw.get("x1"))
    y = _to_float(raw.get("y") if "y" in raw else raw.get("y1"))
    w = _to_float(raw.get("w"))
    h = _to_float(raw.get("h"))
    if w <= 0 and raw.get("x2") is not None:
        w = _to_float(raw.get("x2")) - x
    if h <= 0 and raw.get("y2") is not None:
        h = _to_float(raw.get("y2")) - y
    if w <= 0 or h <= 0:
        return (FULL_FRAME.copy(), "fallback")
    if img_w and img_h and img_w > 0 and img_h > 0:
        x, y, w, h = x / img_w, y / img_h, w / img_w if w > 0 else 0, h / img_h if h > 0 else 0
        if w <= 0 or h <= 0:
            return (FULL_FRAME.copy(), "fallback")
    x = max(0.0, min(1.0, x))
    y = max(0.0, min(1.0, y))
    w = max(0.001, min(1.0 - x, w))
    h = max(0.001, min(1.0 - y, h))
    if w <= 0 or h <= 0:
        return (FULL_FRAME.copy(), "fallback")
    return (
        {"x": round(x, 6), "y": round(y, 6), "w": round(w, 6), "h": round(h, 6)},
        "model",
    )


def ensure_valid_crop_bbox(item: Dict[str, Any], default_explain: str = "") -> Tuple[Dict[str, float], str, bool]:
    raw = item.get("crop_bbox") or item.get("bbox")
    bbox, roi_source = normalize_bbox(raw)
    return (bbox, roi_source, roi_source == "fallback")


def apply_fallback_penalty(confidence: float, was_fallback: bool) -> float:
    return max(0.0, confidence - CONFIDENCE_PENALTY_FALLBACK) if was_fallback else confidence
