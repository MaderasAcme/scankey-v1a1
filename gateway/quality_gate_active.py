"""
P1.1 QualityGate ACTIVE (soft-block).
- block: quality_score < 0.35 OR roi_score < 0.45
- warning: quality_score < 0.55 OR roi_score < 0.60 (no bloquea)
- X-Quality-Override: 1 -> no bloquea, marca debug.override_used=true
"""
from typing import Dict, Any, Optional, Tuple, List

QUALITY_BLOCK_THRESHOLD = 0.35
ROI_BLOCK_THRESHOLD = 0.45
QUALITY_WARNING_THRESHOLD = 0.55
ROI_WARNING_THRESHOLD = 0.60


def _get_float(val: Any, default: float) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def check_quality_gate(
    payload: Dict[str, Any],
    override: bool,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Evalúa QualityGate sobre payload normalizado.
    Returns:
        (block_response, None) si debe bloquear (422)
        (None, modified_payload) si pasa (con warnings si aplica)
    """
    debug = payload.get("debug") or {}
    quality_score = _get_float(debug.get("quality_score"), 1.0)
    roi_score = _get_float(debug.get("roi_score"), 1.0)

    reasons: List[str] = []
    if quality_score < QUALITY_BLOCK_THRESHOLD:
        reasons.append("quality_low")
    if roi_score < ROI_BLOCK_THRESHOLD:
        reasons.append("roi_low")

    if override:
        payload = dict(payload)
        payload.setdefault("debug", {})
        payload["debug"] = dict(payload["debug"])
        payload["debug"]["override_used"] = True
        return (None, payload)

    if reasons:
        return (
            {
                "ok": False,
                "error": "QUALITY_GATE",
                "message": "Calidad insuficiente",
                "reasons": reasons,
                "debug": {
                    "quality_score": quality_score,
                    "roi_score": roi_score,
                },
            },
            None,
        )

    # Warning (no bloquea)
    warn_reasons: List[str] = []
    if quality_score < QUALITY_WARNING_THRESHOLD:
        warn_reasons.append("quality_low")
    if roi_score < ROI_WARNING_THRESHOLD:
        warn_reasons.append("roi_low")

    if warn_reasons:
        payload = dict(payload)
        payload.setdefault("debug", {})
        payload["debug"] = dict(payload["debug"])
        payload["debug"]["quality_warning"] = True
        existing = payload["debug"].get("quality_reasons") or []
        payload["debug"]["quality_reasons"] = list(set(existing + warn_reasons))

    return (None, payload)
