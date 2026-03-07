"""
Multi-label Fase 3 — Consistency layer.
Calcula consistency_score (0..100), reasons, conflicts, supports desde atributos multi-label.
Solo usa campos que existen. Fallback single-class: score neutro, arrays vacíos.
"""
from typing import Dict, Any, List, Optional


def _str_norm(s: Any) -> str:
    """Normaliza a string lowercase para comparación."""
    if s is None:
        return ""
    return str(s or "").strip().lower()


def _tags_list(item: Dict[str, Any]) -> List[str]:
    """Extrae tags (oficial) o compatibility_tags (legacy)."""
    tags = item.get("tags")
    ct = item.get("compatibility_tags")
    if isinstance(tags, list):
        return [str(t).strip() for t in tags if t]
    if isinstance(ct, list):
        return [str(t).strip() for t in ct if t]
    return []


def _orientation(results: List[Dict[str, Any]], idx: int) -> Optional[str]:
    """Orientation del result idx."""
    if idx >= len(results):
        return None
    o = results[idx].get("orientation") or results[idx].get("orientacion")
    return _str_norm(o) or None


def _has_multi_label_signal(top1: Dict[str, Any], results: List[Dict[str, Any]]) -> bool:
    """True si hay señal multi-label: top1 o top2 con atributos relevantes."""
    def _check(it: Dict[str, Any]) -> bool:
        return bool(
            it.get("orientation") is not None
            or it.get("patentada") is True
            or it.get("high_security") is True
            or it.get("requires_card") is True
            or it.get("brand_head_text")
            or it.get("brand_blade_text")
            or it.get("ocr_brand_guess")
            or _tags_list(it)
            or _str_norm(it.get("visual_state"))
            or _str_norm(it.get("wear_level"))
        )
    if _check(top1):
        return True
    if len(results) > 1 and _check(results[1]):
        return True
    return False


def compute_consistency(
    response: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Calcula consistency_score 0..100, consistency_reasons, consistency_conflicts, consistency_supports.
    Inputs: results, manufacturer_hint, ocr_hint/ocr_detail.
    Solo usa campos presentes. Sin multi-label → score 70 (neutro), arrays vacíos.
    """
    results = response.get("results") or response.get("candidates") or []
    if not isinstance(results, list):
        results = []
    top1 = results[0] if results else {}
    top2 = results[1] if len(results) > 1 else {}
    mh = response.get("manufacturer_hint") or {}
    ocr_hint = response.get("ocr_hint") or response.get("ocr_detail") or {}

    reasons: List[str] = []
    conflicts: List[str] = []
    supports: List[str] = []
    score = 70.0  # neutro por defecto (single-class)

    # Si no hay señal multi-label, devolver neutro
    if not _has_multi_label_signal(top1, results) and not top2:
        return {
            "consistency_score": round(score, 1),
            "consistency_reasons": [],
            "consistency_conflicts": [],
            "consistency_supports": [],
            "consistency_level": "neutral",
        }

    # REGLA 1 — ORIENTATION
    o1 = _orientation(results, 0)
    o2 = _orientation(results, 1)
    if o1 and o2 and o1 != o2:
        conflicts.append("orientation_conflict")
        score -= 20
        reasons.append("Orientación A/B discrepante")
    elif o1:
        supports.append("orientation_match")
        score += 5
        reasons.append("Orientación coherente")

    # REGLA 2 — PATENTADA / HIGH_SECURITY / REQUIRES_CARD
    patentada = top1.get("patentada") is True
    high_security = top1.get("high_security") is True
    requires_card = top1.get("requires_card") is True
    if patentada:
        conflicts.append("legal_restriction")
        score -= 15
        reasons.append("Llave patentada")
    if high_security or requires_card:
        conflicts.append("security_restriction")
        score -= 8
        if high_security:
            reasons.append("Alta seguridad")
        if requires_card:
            reasons.append("Requiere tarjeta")

    # REGLA 3 — MARCA / TEXTO VISIBLE
    top1_brand = _str_norm(top1.get("brand") or top1.get("model") or top1.get("label"))
    hint_name = _str_norm(mh.get("name"))
    brand_head = _str_norm(top1.get("brand_head_text"))
    brand_blade = _str_norm(top1.get("brand_blade_text"))
    ocr_guess = _str_norm(top1.get("ocr_brand_guess"))
    if not ocr_guess and isinstance(ocr_hint, dict) and ocr_hint.get("brand"):
        ocr_guess = _str_norm(ocr_hint.get("brand"))

    def _brands_match(a: str, b: str) -> bool:
        if not a or not b:
            return False
        return a == b or a in b or b in a

    def _brands_conflict(a: str, b: str) -> bool:
        if not a or not b:
            return False
        # Conflicto: marcas conocidas distintas (no substring)
        if a == b or a in b or b in a:
            return False
        # Si ambas son sustanciales (>2 chars) y distintas
        return len(a) > 2 and len(b) > 2

    brand_match_found = False
    brand_conflict_found = False
    for src in (brand_head, brand_blade, ocr_guess):
        if not src:
            continue
        if _brands_match(src, top1_brand) or (hint_name and _brands_match(src, hint_name)):
            brand_match_found = True
        if _brands_conflict(src, top1_brand):
            brand_conflict_found = True
    if brand_match_found:
        supports.append("brand_match")
        score += 8
        reasons.append("Marca coherente con OCR/texto")
    if brand_conflict_found:
        conflicts.append("brand_conflict")
        score -= 18
        reasons.append("Marca contradice identificación")

    # REGLA 4 — TAGS / TYPE
    tags = _tags_list(top1)
    top1_type = _str_norm(top1.get("type"))
    # type_tag_match: type refuerza (existe y no contradice)
    if top1_type and top1_type not in ("", "key", "no identificado"):
        supports.append("type_tag_match")
        score += 3
    # type_tag_conflict: type del top1 vs type de otro result
    t2 = _str_norm(top2.get("type")) if top2 else ""
    if top1_type and t2 and top1_type != t2:
        conflicts.append("type_tag_conflict")
        score -= 10

    # REGLA 5 — VISUAL / DESGASTE
    visual = _str_norm(top1.get("visual_state"))
    wear = _str_norm(top1.get("wear_level"))
    degradation_signals = (
        wear == "high"
        or "desgast" in visual
        or "oxid" in visual
        or "daño" in visual
        or "damage" in visual
        or "worn" in visual
    )
    if degradation_signals:
        conflicts.append("visual_degradation")
        score -= 5
        reasons.append("Desgaste/estado visual")

    # Clamp
    score = max(0.0, min(100.0, score))
    reasons = list(dict.fromkeys(reasons))[:6]
    conflicts = list(dict.fromkeys(conflicts))[:6]
    supports = list(dict.fromkeys(supports))[:6]

    if score >= 75:
        level = "high"
    elif score >= 50:
        level = "medium"
    else:
        level = "low"

    return {
        "consistency_score": round(score, 1),
        "consistency_reasons": reasons,
        "consistency_conflicts": conflicts,
        "consistency_supports": supports,
        "consistency_level": level,
    }
