"""
ROI/crop_bbox: normalización fiable con fallback seguro.
- Valida y normaliza bbox a {x,y,w,h} en 0..1
- Fallback a full frame {0,0,1,1} si no hay ROI fiable
"""
from typing import Dict, Any, Optional, Tuple

FULL_FRAME = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}

# Penalización ligera cuando se usa fallback (opcional)
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
    """
    Normaliza bbox a {x,y,w,h} en rango [0,1].
    - Acepta crop_bbox, bbox; x,y,w,h o x1,y1,x2,y2
    - Clamp a [0,1], asegura w>0 y h>0
    - img_w, img_h: si se pasan, convierte de píxeles a normalizado

    Returns:
        (bbox_dict, roi_source)
        roi_source: "model" | "heuristic" | "fallback"
    """
    if not raw or not isinstance(raw, dict):
        return (FULL_FRAME.copy(), "fallback")

    x = _to_float(raw.get("x") if "x" in raw else raw.get("x1"))
    y = _to_float(raw.get("y") if "y" in raw else raw.get("y1"))
    w = _to_float(raw.get("w"))
    h = _to_float(raw.get("h"))

    # Si tenemos x2,y2 en vez de w,h
    if w <= 0 and raw.get("x2") is not None:
        w = _to_float(raw.get("x2")) - x
    if h <= 0 and raw.get("y2") is not None:
        h = _to_float(raw.get("y2")) - y

    # Si w o h son inválidos (<=0), fallback inmediato
    if w <= 0 or h <= 0:
        return (FULL_FRAME.copy(), "fallback")

    # Convertir de píxeles a 0..1 si tenemos dimensiones de imagen
    if img_w and img_h and img_w > 0 and img_h > 0:
        x = x / img_w
        y = y / img_h
        w = w / img_w if w > 0 else 0
        h = h / img_h if h > 0 else 0
        if w <= 0 or h <= 0:
            return (FULL_FRAME.copy(), "fallback")

    # Clamp x,y a [0,1]
    x = max(0.0, min(1.0, x))
    y = max(0.0, min(1.0, y))

    # w,h: asegurar > 0, y que x+w, y+h no excedan 1
    w = max(0.001, min(1.0 - x, w))
    h = max(0.001, min(1.0 - y, h))

    return (
        {"x": round(x, 6), "y": round(y, 6), "w": round(w, 6), "h": round(h, 6)},
        "model",
    )


def ensure_valid_crop_bbox(
    item: Dict[str, Any],
    default_explain: str = "",
) -> Tuple[Dict[str, float], str, bool]:
    """
    Garantiza crop_bbox válido para un result.
    Acepta crop_bbox o bbox del item.

    Returns:
        (bbox, roi_source, was_fallback)
    """
    raw = item.get("crop_bbox") or item.get("bbox")
    bbox, roi_source = normalize_bbox(raw)

    if roi_source == "fallback":
        return (bbox, roi_source, True)
    return (bbox, roi_source, False)


def apply_fallback_penalty(confidence: float, was_fallback: bool) -> float:
    """Penalización ligera si se usó fallback ROI."""
    if not was_fallback:
        return confidence
    return max(0.0, confidence - CONFIDENCE_PENALTY_FALLBACK)


def clamp_confidence(c: float) -> float:
    """P0.4: Asegura confidence en [0, 1]. Aplicar después de boosts/penalties."""
    try:
        return float(max(0.0, min(1.0, float(c))))
    except (TypeError, ValueError):
        return 0.0
