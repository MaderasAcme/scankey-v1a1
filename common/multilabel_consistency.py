"""
Multi-label Fase 3 + Fase 6 — Consistency layer con fusión por confianza.
Calcula consistency_score (0..100), reasons, conflicts, supports desde atributos multi-label.
Fase 6: usa *_meta.source y *_meta.confidence para no disparar conflictos duros con evidencia débil.
Single-class sin meta: comportamiento previo (evidencia implícita suficiente).
"""
from typing import Dict, Any, List, Optional, Tuple

try:
    from common.multilabel_evidence import (
        get_attr_meta,
        should_trigger_strong_conflict,
        should_trigger_weak_conflict,
        evidence_strength,
        support_weight,
    )
except ImportError:
    from multilabel_evidence import (
        get_attr_meta,
        should_trigger_strong_conflict,
        should_trigger_weak_conflict,
        evidence_strength,
        support_weight,
    )


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


def _orientation_evidence_meta(results: List[Dict[str, Any]], idx: int) -> Optional[Dict[str, Any]]:
    """Meta de orientation para result idx."""
    if idx >= len(results):
        return None
    return get_attr_meta(results[idx], "orientation")


def compute_consistency(
    response: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Calcula consistency_score 0..100, consistency_reasons, consistency_conflicts, consistency_supports.
    Fase 6: consistency_conflicts = solo conflictos fuertes; consistency_weak_conflicts = suaves.
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
    weak_conflicts: List[str] = []
    supports: List[str] = []
    evidence_notes: List[str] = []
    score = 70.0

    # Si no hay señal multi-label, devolver neutro
    if not _has_multi_label_signal(top1, results) and not top2:
        return {
            "consistency_score": round(score, 1),
            "consistency_reasons": [],
            "consistency_conflicts": [],
            "consistency_supports": [],
            "consistency_level": "neutral",
            "consistency_strong_conflicts": [],
            "consistency_weak_conflicts": [],
            "evidence_notes": [],
        }

    # REGLA 1 — ORIENTATION
    o1 = _orientation(results, 0)
    o2 = _orientation(results, 1)
    om1 = _orientation_evidence_meta(results, 0)
    om2 = _orientation_evidence_meta(results, 1)
    if o1 and o2 and o1 != o2:
        # Evidencia: la más débil de las dos orientaciones define la fuerza del conflicto
        ev1 = evidence_strength(om1)
        ev2 = evidence_strength(om2)
        weakest = "weak" if (ev1 == "weak" or ev2 == "weak") else ("medium" if (ev1 == "medium" or ev2 == "medium") else "strong")
        if weakest == "strong" or (om1 is None and om2 is None):
            conflicts.append("orientation_conflict")
            score -= 20
            reasons.append("Orientación A/B discrepante")
        elif weakest == "medium":
            weak_conflicts.append("orientation_conflict")
            score -= 8
            reasons.append("Orientación A/B posible discrepancia")
            evidence_notes.append("orientation_conflict: evidencia media")
        else:
            evidence_notes.append("orientation_conflict: evidencia débil, no conflicto duro")
    elif o1:
        w = support_weight(om1) if om1 else 1.0
        supports.append("orientation_match")
        score += 5 * w
        reasons.append("Orientación coherente")

    # REGLA 2 — PATENTADA / HIGH_SECURITY / REQUIRES_CARD
    patentada = top1.get("patentada") is True
    high_security = top1.get("high_security") is True
    requires_card = top1.get("requires_card") is True
    patentada_meta = get_attr_meta(top1, "patentada")
    hsec_meta = get_attr_meta(top1, "high_security")
    rc_meta = get_attr_meta(top1, "requires_card")
    if patentada:
        if should_trigger_strong_conflict(patentada_meta):
            conflicts.append("legal_restriction")
            score -= 15
            reasons.append("Llave patentada")
        elif should_trigger_weak_conflict(patentada_meta):
            weak_conflicts.append("legal_restriction")
            score -= 5
            evidence_notes.append("legal_restriction: evidencia media")
        else:
            evidence_notes.append("legal_restriction: evidencia débil, no exagerar")
    if high_security or requires_card:
        meta = hsec_meta if high_security else rc_meta
        if should_trigger_strong_conflict(meta):
            conflicts.append("security_restriction")
            score -= 8
            if high_security:
                reasons.append("Alta seguridad")
            if requires_card:
                reasons.append("Requiere tarjeta")
        elif should_trigger_weak_conflict(meta):
            weak_conflicts.append("security_restriction")
            score -= 3
            evidence_notes.append("security_restriction: evidencia media")
        else:
            evidence_notes.append("security_restriction: evidencia débil")

    # REGLA 3 — MARCA / TEXTO VISIBLE
    top1_brand = _str_norm(top1.get("brand") or top1.get("model") or top1.get("label"))
    hint_name = _str_norm(mh.get("name"))
    brand_sources: List[Tuple[str, str, Optional[Dict[str, Any]]]] = [
        ("brand_head_text", _str_norm(top1.get("brand_head_text")), get_attr_meta(top1, "brand_head_text")),
        ("brand_blade_text", _str_norm(top1.get("brand_blade_text")), get_attr_meta(top1, "brand_blade_text")),
        ("ocr_brand_guess", _str_norm(top1.get("ocr_brand_guess")), get_attr_meta(top1, "ocr_brand_guess")),
    ]
    if not brand_sources[2][1] and isinstance(ocr_hint, dict) and ocr_hint.get("brand"):
        brand_sources[2] = ("ocr_brand_guess", _str_norm(ocr_hint.get("brand")), None)

    def _brands_match(a: str, b: str) -> bool:
        if not a or not b:
            return False
        return a == b or a in b or b in a

    def _brands_conflict(a: str, b: str) -> bool:
        if not a or not b:
            return False
        if a == b or a in b or b in a:
            return False
        return len(a) > 2 and len(b) > 2

    brand_match_found = False
    brand_match_weight = 0.0
    brand_conflict_found = False
    brand_conflict_meta: Optional[Dict[str, Any]] = None
    for _field, val, meta in brand_sources:
        if not val:
            continue
        if _brands_match(val, top1_brand) or (hint_name and _brands_match(val, hint_name)):
            brand_match_found = True
            brand_match_weight = max(brand_match_weight, support_weight(meta))
        if _brands_conflict(val, top1_brand):
            brand_conflict_found = True
            if brand_conflict_meta is None:
                brand_conflict_meta = meta

    if brand_match_found:
        supports.append("brand_match")
        w = brand_match_weight if brand_match_weight > 0 else 1.0
        score += 8 * w
        reasons.append("Marca coherente con OCR/texto")
    if brand_conflict_found:
        if should_trigger_strong_conflict(brand_conflict_meta):
            conflicts.append("brand_conflict")
            score -= 18
            reasons.append("Marca contradice identificación")
        elif should_trigger_weak_conflict(brand_conflict_meta):
            weak_conflicts.append("brand_conflict")
            score -= 5
            evidence_notes.append("brand_conflict: evidencia media (ej. OCR)")
        else:
            evidence_notes.append("brand_conflict: evidencia débil OCR, no conflicto duro")

    # REGLA 4 — TAGS / TYPE
    tags = _tags_list(top1)
    top1_type = _str_norm(top1.get("type"))
    if top1_type and top1_type not in ("", "key", "no identificado"):
        supports.append("type_tag_match")
        score += 3
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
    vs_meta = get_attr_meta(top1, "visual_state")
    wl_meta = get_attr_meta(top1, "wear_level")
    degrad_meta = wl_meta if wear == "high" else vs_meta
    if degradation_signals:
        if should_trigger_strong_conflict(degrad_meta):
            conflicts.append("visual_degradation")
            score -= 5
            reasons.append("Desgaste/estado visual")
        elif should_trigger_weak_conflict(degrad_meta):
            weak_conflicts.append("visual_degradation")
            score -= 2

    # Clamp
    score = max(0.0, min(100.0, score))
    reasons = list(dict.fromkeys(reasons))[:6]
    conflicts = list(dict.fromkeys(conflicts))[:6]
    weak_conflicts = list(dict.fromkeys(weak_conflicts))[:6]
    supports = list(dict.fromkeys(supports))[:6]
    evidence_notes = evidence_notes[:8]

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
        "consistency_strong_conflicts": conflicts[:],
        "consistency_weak_conflicts": weak_conflicts,
        "evidence_notes": evidence_notes,
    }
