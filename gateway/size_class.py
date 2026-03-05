"""
size-class / similarity guardrails (misma lógica que common/size_class.py).
- ROI fiable = no full-frame {0,0,1,1}
- Buckets: corta, media, larga según ratio aspecto
- Desempate cuando confidences muy cercanas
"""
from typing import Dict, Any, List, Optional, Tuple, Callable

TIE_THRESHOLD = 0.03
RATIO_CORTA_MAX = 1.35
RATIO_LARGA_MIN = 2.0


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def is_full_frame(bbox: Optional[Dict[str, Any]]) -> bool:
    """True si bbox es full-frame (ROI no fiable para size-class)."""
    if not bbox or not isinstance(bbox, dict):
        return True
    x = _to_float(bbox.get("x"), -1)
    y = _to_float(bbox.get("y"), -1)
    w = _to_float(bbox.get("w"), 0)
    h = _to_float(bbox.get("h"), 0)
    return (
        abs(x) < 1e-5
        and abs(y) < 1e-5
        and abs(w - 1.0) < 1e-5
        and abs(h - 1.0) < 1e-5
    )


def extract_size_features(bbox: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Extrae ratio aspecto y size_class. roi_reliable=False si full-frame."""
    out = {"ratio_aspecto": 1.0, "size_class": None, "roi_reliable": False}
    if is_full_frame(bbox):
        return out
    w = _to_float(bbox.get("w"), 0)
    h = _to_float(bbox.get("h"), 0)
    if w <= 0 or h <= 0:
        return out
    ratio = max(w, h) / min(w, h)
    out["ratio_aspecto"] = round(ratio, 4)
    out["roi_reliable"] = True
    if ratio < RATIO_CORTA_MAX:
        out["size_class"] = "corta"
    elif ratio >= RATIO_LARGA_MIN:
        out["size_class"] = "larga"
    else:
        out["size_class"] = "media"
    return out


def get_size_class(bbox: Optional[Dict[str, Any]]) -> Optional[str]:
    return extract_size_features(bbox)["size_class"]


def apply_size_class_tiebreak(
    items: List[Dict[str, Any]],
    get_confidence_fn: Callable[[Dict[str, Any]], float],
    get_bbox_fn: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]],
) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
    """
    Desempata cuando confidences muy cercanas. Solo si hay ROI fiable.
    Returns: (items_ordenados, aplicado, ref_size_class)
    """
    if not items or len(items) < 2:
        return (items, False, None)
    ref_class: Optional[str] = None
    for it in items:
        feat = extract_size_features(get_bbox_fn(it))
        if feat["roi_reliable"] and feat["size_class"]:
            ref_class = feat["size_class"]
            break
    if ref_class is None:
        return (items, False, None)
    confs = [get_confidence_fn(it) for it in items[:3]]
    max_conf = max(confs)
    close_count = sum(1 for c in confs if max_conf - c <= TIE_THRESHOLD)
    if close_count < 2:
        return (items, False, None)

    def sort_key(it: Dict[str, Any]) -> Tuple[float, int]:
        c = get_confidence_fn(it)
        sc = get_size_class(get_bbox_fn(it))
        return (c, 1 if sc == ref_class else 0)

    sorted_items = sorted(items, key=sort_key, reverse=True)
    applied = sorted_items != items
    return (sorted_items, applied, ref_class if applied else None)


def size_class_explain_suffix(size_class: Optional[str], applied: bool) -> str:
    if not applied or not size_class:
        return ""
    return f" Desempate por tamaño ({size_class})."


def extract_size_class_debug_only(
    items: List[Dict[str, Any]],
    get_bbox_fn: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]],
) -> Tuple[Optional[str], bool]:
    """
    P0.2: debug-only. Extrae ref size_class del primer ROI fiable.
    NO reordena. Returns: (ref_size_class, roi_reliable_found).
    """
    if not items:
        return (None, False)
    for it in items[:3]:
        feat = extract_size_features(get_bbox_fn(it))
        if feat["roi_reliable"] and feat["size_class"]:
            return (feat["size_class"], True)
    return (None, False)
