"""
P0.3 Risk Engine PASIVO — margin top1-top2, risk_score 0..100, risk_reasons.
No cambia ranking ni bloquea flujo (solo informa).
"""
import os
from typing import Dict, Any, List, Optional

SCN_FEATURE_RISK_ENGINE_PASSIVE = (
    os.getenv("SCN_FEATURE_RISK_ENGINE_PASSIVE", "true").lower() == "true"
)


def _get_confidence(item: Dict[str, Any]) -> float:
    v = item.get("confidence") or item.get("conf") or item.get("score")
    try:
        return float(max(0.0, min(1.0, float(v))))
    except (TypeError, ValueError):
        return 0.0


def _get_brand_model(item: Dict[str, Any]) -> str:
    return (
        str(item.get("brand") or item.get("model") or item.get("label") or "").strip().lower()
    )


def compute_margin(results: List[Dict[str, Any]]) -> float:
    """
    margin = top1.confidence - top2.confidence.
    Si falta top2 -> margin=1.0 (máximo).
    """
    if not results or len(results) < 2:
        return 1.0
    c1 = _get_confidence(results[0])
    c2 = _get_confidence(results[1])
    return max(0.0, min(1.0, c1 - c2))


def _detect_ab_conflict(results: List[Dict[str, Any]]) -> bool:
    """True si explain_text del top1 contiene 'Discrepancia A/B'."""
    if not results:
        return False
    ex = (results[0].get("explain_text") or "").strip()
    return "Discrepancia A/B" in ex or "discrepancia a/b" in ex.lower()


def _detect_ab_consensus(results: List[Dict[str, Any]]) -> bool:
    """True si explain_text del top1 contiene 'Consenso A/B'."""
    if not results:
        return False
    ex = (results[0].get("explain_text") or "").strip()
    return "Consenso A/B" in ex or "consenso a/b" in ex.lower()


def _manufacturer_mismatch(
    mh: Dict[str, Any],
    top1: Optional[Dict[str, Any]],
) -> bool:
    """True si hint encontrado pero top1 no coincide con hint name."""
    if not mh or not mh.get("found"):
        return False
    hint_name = str(mh.get("name") or "").strip().lower()
    if not hint_name:
        return False
    top1_brand = _get_brand_model(top1 or {})
    if not top1_brand:
        return False
    return hint_name != top1_brand


def _manufacturer_match(
    mh: Dict[str, Any],
    top1: Optional[Dict[str, Any]],
) -> bool:
    """True si hint encontrado y top1 coincide."""
    if not mh or not mh.get("found"):
        return False
    hint_name = str(mh.get("name") or "").strip().lower()
    if not hint_name:
        return False
    top1_brand = _get_brand_model(top1 or {})
    return top1_brand == hint_name


def compute_risk(
    debug: Dict[str, Any],
    response: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Calcula risk_score 0..100, risk_level, risk_reasons, margin.
    Reglas deterministas (PASIVO).
    """
    results = response.get("results") or response.get("candidates") or []
    if not isinstance(results, list):
        results = []

    margin = compute_margin(results)
    low_confidence = bool(response.get("low_confidence"))
    high_confidence = bool(response.get("high_confidence"))
    mh = response.get("manufacturer_hint") or {}
    top1 = results[0] if results else None

    quality_score = None
    if debug and debug.get("quality_score") is not None:
        try:
            quality_score = float(debug["quality_score"])
        except (TypeError, ValueError):
            pass

    roi_score = None
    if debug and debug.get("roi_score") is not None:
        try:
            roi_score = float(debug["roi_score"])
        except (TypeError, ValueError):
            pass

    has_ocr = bool(response.get("ocr_detail") or response.get("ocr_hint"))
    ab_conflict = _detect_ab_conflict(results)
    ab_consensus = _detect_ab_consensus(results)
    mfr_mismatch = _manufacturer_mismatch(mh, top1)
    mfr_match = _manufacturer_match(mh, top1)

    risk_score = 50.0
    reasons: List[str] = []

    if margin < 0.03:
        risk_score += 25
        reasons.append("margin_tight")
    elif margin < 0.08:
        risk_score += 10
        reasons.append("margin_medium")

    if low_confidence:
        risk_score += 35
        reasons.append("low_confidence")
    elif high_confidence:
        risk_score -= 10

    if quality_score is not None and quality_score < 0.55:
        risk_score += 20
        reasons.append("quality_low")

    if roi_score is not None and roi_score < 0.60:
        risk_score += 10
        reasons.append("roi_low")

    if ab_conflict:
        risk_score += 25
        reasons.append("ab_conflict")
    elif ab_consensus:
        risk_score -= 10

    if mfr_mismatch:
        risk_score += 10
        reasons.append("manufacturer_mismatch")
    elif mfr_match:
        risk_score -= 5

    risk_score = max(0.0, min(100.0, risk_score))
    reasons = reasons[:6]

    if risk_score >= 70:
        risk_level = "HIGH"
    elif risk_score >= 35:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "margin": round(margin, 4),
        "risk_score": round(risk_score, 1),
        "risk_level": risk_level,
        "risk_reasons": reasons,
    }
