"""
ScanKey Contract Normalizer (estricto).
Acepta variantes (candidates/results, conf/confidence, bbox/crop_bbox)
y produce SIEMPRE la forma final del contrato.
ROI/crop_bbox: fallback seguro a {0,0,1,1} cuando no hay detección fiable.
"""
import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from roi_bbox import ensure_valid_crop_bbox, apply_fallback_penalty, clamp_confidence, FULL_FRAME
from common.size_class import extract_size_class_debug_only

SCN_FEATURE_RISK_ENGINE_PASSIVE = (
    os.getenv("SCN_FEATURE_RISK_ENGINE_PASSIVE", "true").lower() == "true"
)

# Umbrales del contrato
THRESHOLD_HIGH = 0.95
THRESHOLD_LOW = 0.60
THRESHOLD_STORE = 0.75
STORAGE_PROBABILITY = 0.75
MAX_SAMPLES_PER_REF = 30

UNRELIABLE_CROP_SUFFIX = " Recorte no fiable."


def _get_confidence(item: Dict[str, Any]) -> float:
    """Acepta conf o confidence."""
    v = item.get("confidence")
    if v is None:
        v = item.get("conf")
    if v is None:
        v = item.get("score")
    try:
        return float(max(0.0, min(1.0, float(v))))
    except (TypeError, ValueError):
        return 0.0


# Multi-label Fase 2: valores válidos oficiales
_BRAND_VISIBLE_ZONE = frozenset(("head", "blade", "both", "none"))
_WEAR_LEVEL = frozenset(("low", "medium", "high"))


def _normalize_tags(item: Dict[str, Any]) -> list:
    """tags oficial; compatibility_tags legacy. Siempre devuelve lista."""
    tags = item.get("tags")
    ct = item.get("compatibility_tags")
    if isinstance(tags, list) and len(tags) > 0:
        return tags
    if isinstance(ct, list):
        return ct
    if isinstance(ct, str):
        return [ct] if ct.strip() else []
    if isinstance(tags, str):
        return [tags] if tags.strip() else []
    return []


def _normalize_bool_or_null(val: Any) -> Optional[bool]:
    """Boolean o null. No inventar."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        s = val.strip().lower()
        if s in ("true", "1", "yes", "si"):
            return True
        if s in ("false", "0", "no"):
            return False
    return None


def _normalize_patentada(item: Dict[str, Any]) -> bool:
    """Oficial: patentada. Legacy: patent, is_patented. Default False si no viene."""
    v = item.get("patentada") if "patentada" in item else item.get("patent") or item.get("is_patented")
    if v is None:
        return False
    b = _normalize_bool_or_null(v)
    return b if b is not None else False


def _normalize_orientation(val: Any) -> Optional[str]:
    """Orientation consistente."""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return s if s else None


def _normalize_brand_visible_zone(val: Any) -> Optional[str]:
    """head | blade | both | none"""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return s if s in _BRAND_VISIBLE_ZONE else None


def _normalize_wear_level(val: Any) -> Optional[str]:
    """low | medium | high"""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return s if s in _WEAR_LEVEL else None


def _normalize_side_count(val: Any) -> Optional[int]:
    """Entero o null."""
    if val is None:
        return None
    try:
        n = int(val)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def _normalize_result(
    item: Dict[str, Any],
    rank: int,
    roi_sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Normaliza un item a la forma del contrato. Siempre incluye crop_bbox válido.
    Multi-label Fase 2: campos opcionales. Si no vienen, null/[] sin inventar.
    """
    conf = _get_confidence(item)
    bbox, roi_source, was_fallback = ensure_valid_crop_bbox(item, "")
    conf = apply_fallback_penalty(conf, was_fallback)
    conf = clamp_confidence(conf)
    if roi_sources is not None:
        roi_sources.append(roi_source)

    explain = item.get("explain_text") or ("Sin más candidatos." if rank > 1 else "")
    if was_fallback and explain and not explain.endswith(UNRELIABLE_CROP_SUFFIX.strip()):
        explain = explain.rstrip() + UNRELIABLE_CROP_SUFFIX
    elif was_fallback and not explain:
        explain = "Recorte no fiable."

    tags = _normalize_tags(item)

    out: Dict[str, Any] = {
        "rank": rank,
        "brand": item.get("brand"),
        "model": item.get("model") or item.get("id_model_ref"),
        "type": item.get("type") or ("No identificado" if rank > 1 and not item else "key"),
        "confidence": conf,
        "explain_text": explain,
        "tags": tags,
        "compatibility_tags": tags,  # legacy: mismo valor que tags
        "id_model_ref": item.get("id_model_ref") or item.get("ref"),
        "crop_bbox": bbox,
        # Obligatorios multi-label
        "orientation": _normalize_orientation(item.get("orientation") or item.get("orientacion")),
        "head_color": (item.get("head_color") or item.get("headColor") or "").strip() or None,
        "visual_state": (item.get("visual_state") or item.get("state") or "").strip() or None,
        "patentada": _normalize_patentada(item),
    }
    # Recomendados
    out["brand_head_text"] = (item.get("brand_head_text") or "").strip() or None
    out["brand_blade_text"] = (item.get("brand_blade_text") or "").strip() or None
    out["brand_visible_zone"] = _normalize_brand_visible_zone(item.get("brand_visible_zone"))
    out["ocr_brand_guess"] = (item.get("ocr_brand_guess") or "").strip() or None
    out["head_shape"] = (item.get("head_shape") or "").strip() or None
    out["blade_profile"] = (item.get("blade_profile") or "").strip() or None
    out["tip_shape"] = (item.get("tip_shape") or "").strip() or None
    out["side_count"] = _normalize_side_count(item.get("side_count"))
    out["symmetry"] = _normalize_bool_or_null(item.get("symmetry"))
    out["wear_level"] = _normalize_wear_level(item.get("wear_level"))
    out["high_security"] = _normalize_bool_or_null(item.get("high_security"))
    out["requires_card"] = _normalize_bool_or_null(item.get("requires_card"))
    # Experimentales
    out["oxidation_present"] = _normalize_bool_or_null(item.get("oxidation_present"))
    out["surface_damage"] = _normalize_bool_or_null(item.get("surface_damage"))
    out["material_hint"] = (item.get("material_hint") or "").strip() or None
    out["restricted_copy"] = _normalize_bool_or_null(item.get("restricted_copy"))
    out["text_visible_head"] = (item.get("text_visible_head") or "").strip() or None
    out["text_visible_blade"] = (item.get("text_visible_blade") or "").strip() or None
    out["structural_notes"] = (item.get("structural_notes") or "").strip() or None

    if item.get("label") is not None and out.get("brand") is None:
        out["brand"] = item.get("label")
    if item.get("label") is not None and out.get("model") is None:
        out["model"] = item.get("label")
    return out


def normalize_contract(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normaliza la respuesta del motor al contrato ScanKey estricto.
    - results SIEMPRE 3, rank 1..3, orden por confidence desc
    - high_confidence=true si top>=0.95, low_confidence=true si top<0.60
    - should_store_sample: top>=0.75, storage_probability=0.75, max 30 por modelo
    """
    d = dict(raw or {})

    # Obtener lista de candidatos (candidates o results)
    items = d.get("results") or d.get("candidates") or []
    if not isinstance(items, list):
        items = []

    # manufacturer_hint ranking: si found && confidence>=0.85, boost <=+5% a compatibles
    mh = d.get("manufacturer_hint")
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

    # P0.2: size-class debug-only — NO reordenar; solo añadir debug.size_class
    def _get_bbox(it: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return it.get("crop_bbox") or it.get("bbox")

    ref_size_class, roi_reliable = extract_size_class_debug_only(items, _get_bbox)
    size_class_applied = False  # Nunca reordenamos por size_class

    roi_sources: List[str] = []
    results: List[Dict[str, Any]] = []
    for i, it in enumerate(items[:3], start=1):
        results.append(_normalize_result(dict(it or {}), i, roi_sources))

    while len(results) < 3:
        results.append(_normalize_result({}, len(results) + 1, roi_sources))

    top_conf = results[0]["confidence"]

    # manufacturer_hint (mh ya extraído arriba para ranking)
    if not isinstance(mh, dict):
        mh = {"found": False, "name": None, "confidence": 0.0}
    else:
        mh = {
            "found": bool(mh.get("found")),
            "name": mh.get("name"),
            "confidence": float(mh.get("confidence", 0.0) or 0.0),
        }

    # Flags de confianza (recalcular según contrato)
    high_confidence = top_conf >= THRESHOLD_HIGH
    low_confidence = top_conf < THRESHOLD_LOW

    # should_store_sample y storage_probability (bloque 4.2: conteo real)
    try:
        from common.dataset_governance import clamp_current_samples
        current = clamp_current_samples(d.get("current_samples_for_candidate"))
    except Exception:
        current = d.get("current_samples_for_candidate")
        current = int(current) if current is not None and isinstance(current, (int, float)) else -1

    should_store = False
    if top_conf >= THRESHOLD_STORE and (current < 0 or current < MAX_SAMPLES_PER_REF):
        if "should_store_sample" in d:
            should_store = bool(d["should_store_sample"])
        else:
            should_store = True  # Por defecto si cumple umbral

    storage_prob = float(d.get("storage_probability", STORAGE_PROBABILITY))

    ts = d.get("timestamp")
    if not ts:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    debug = dict(d.get("debug") or {})
    # P0.2: quality_*, roi_score pasan tal cual desde motor (si existen)
    debug["roi_source"] = roi_sources[0] if roi_sources else "fallback"
    debug.setdefault("model_version", d.get("model_version") or "scankey-v2-prod")
    debug["size_class"] = ref_size_class
    debug["size_class_applied"] = size_class_applied

    # Multi-label Fase 3: consistency (antes de risk para que risk lo use)
    _out_pre = {
        "results": results,
        "low_confidence": low_confidence,
        "high_confidence": high_confidence,
        "manufacturer_hint": mh,
        "ocr_detail": d.get("ocr_detail"),
        "ocr_hint": d.get("ocr_hint"),
    }
    try:
        from common.multilabel_consistency import compute_consistency
        cons = compute_consistency(_out_pre)
        debug["consistency_score"] = cons["consistency_score"]
        debug["consistency_reasons"] = cons["consistency_reasons"]
        debug["consistency_conflicts"] = cons["consistency_conflicts"]
        debug["consistency_supports"] = cons["consistency_supports"]
        debug["consistency_level"] = cons["consistency_level"]
    except Exception:
        debug["consistency_score"] = 70.0
        debug["consistency_reasons"] = []
        debug["consistency_conflicts"] = []
        debug["consistency_supports"] = []
        debug["consistency_level"] = "neutral"

    # P0.3: risk engine pasivo — margin, risk_score, risk_level, risk_reasons
    if SCN_FEATURE_RISK_ENGINE_PASSIVE:
        try:
            from common.risk_engine import compute_risk
            risk_data = compute_risk(debug, _out_pre)
            debug["margin"] = risk_data["margin"]
            debug["risk_score"] = risk_data["risk_score"]
            debug["risk_level"] = risk_data["risk_level"]
            debug["risk_reasons"] = risk_data["risk_reasons"]
        except Exception:
            pass

    out = {
        "input_id": d.get("input_id") or "",
        "timestamp": ts,
        "manufacturer_hint": mh,
        "results": results,
        "low_confidence": low_confidence,
        "high_confidence": high_confidence,
        "should_store_sample": should_store,
        "storage_probability": storage_prob,
        "current_samples_for_candidate": current,
        "manual_correction_hint": d.get("manual_correction_hint") or {"fields": ["marca", "modelo", "tipo"]},
        "debug": debug,
    }
    if d.get("ocr_hint") is not None:
        out["ocr_hint"] = d["ocr_hint"]
    if d.get("ocr_detail") is not None:
        out["ocr_detail"] = d["ocr_detail"]

    # BLOQUE 3: PolicyEngine — añadir policy_* a debug
    try:
        from common.policy_engine import evaluate_policy, POLICY_VERSION
        policy_result = evaluate_policy(out)
        debug["policy_action"] = policy_result.get("action")
        debug["policy_reasons"] = policy_result.get("reasons", [])
        debug["policy_user_message"] = policy_result.get("user_message", "")
        debug["policy_version"] = policy_result.get("debug", {}).get("policy_version", POLICY_VERSION)
    except Exception:
        pass

    return out
