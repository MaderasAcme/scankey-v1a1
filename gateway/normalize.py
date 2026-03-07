"""
ScanKey Contract Normalizer (estricto).
Acepta variantes (candidates/results, conf/confidence, bbox/crop_bbox)
y produce SIEMPRE la forma final del contrato.
ROI/crop_bbox: fallback seguro a {0,0,1,1} cuando no hay detección fiable.
Multi-label Fase 5: vocabularios canónicos, *_meta con value/confidence/source.
"""
import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from roi_bbox import ensure_valid_crop_bbox, apply_fallback_penalty, clamp_confidence, FULL_FRAME
from common.size_class import extract_size_class_debug_only
from common import multilabel_vocab
from common.multilabel_attrs import normalize_attr

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

# Campos con soporte *_meta (Fase 5)
_META_FIELDS = (
    "orientation",
    "patentada",
    "head_color",
    "visual_state",
    "brand_head_text",
    "brand_blade_text",
    "brand_visible_zone",
    "ocr_brand_guess",
    "head_shape",
    "blade_profile",
    "tip_shape",
    "side_count",
    "symmetry",
    "wear_level",
    "high_security",
    "requires_card",
)


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


def _infer_source(field_name: str, item: Dict[str, Any], has_ocr_in_response: bool) -> str:
    """Infiere source: model | ocr | catalog | heuristic | manual | unknown."""
    explicit = item.get(f"{field_name}_source")
    if isinstance(explicit, str) and explicit.strip().lower() in ("model", "ocr", "catalog", "heuristic", "manual", "unknown"):
        return explicit.strip().lower()
    if field_name in ("ocr_brand_guess",) and has_ocr_in_response:
        return "ocr"
    if field_name in ("brand_head_text", "brand_blade_text") and has_ocr_in_response:
        return "ocr"
    return "model"


def _build_field_meta(
    field_name: str,
    raw_value: Any,
    item: Dict[str, Any],
    item_confidence: float,
    has_ocr: bool,
) -> Dict[str, Any]:
    """Construye { value, confidence?, source } para campo con *_meta."""
    src = _infer_source(field_name, item, has_ocr)
    per_field_conf = item.get(f"{field_name}_confidence")
    conf = float(per_field_conf) if per_field_conf is not None else item_confidence
    meta = normalize_attr(field_name, raw_value, confidence=conf, source=src)
    return meta


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


def _normalize_patentada(item: Dict[str, Any]) -> bool:
    """Oficial: patentada. Legacy: patent, is_patented. Default False si no viene."""
    v = item.get("patentada") if "patentada" in item else item.get("patent") or item.get("is_patented")
    if v is None:
        return False
    b = multilabel_vocab.normalize_bool_or_null(v)
    return b if b is not None else False


def _normalize_result(
    item: Dict[str, Any],
    rank: int,
    roi_sources: Optional[List[str]] = None,
    has_ocr_in_response: bool = False,
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
    has_ocr = bool(has_ocr_in_response)

    def _field_with_meta(field_name: str, raw_getter, default=None):
        """Obtiene valor normalizado y meta. Si hay valor, añade field_meta."""
        raw = raw_getter()
        meta = _build_field_meta(field_name, raw, item, conf, has_ocr)
        value = meta.get("value") if meta else default
        return value, meta

    # Orientation (raw: orientation | orientacion)
    orient_raw = item.get("orientation") or item.get("orientacion")
    orient_val, orient_meta = _field_with_meta("orientation", lambda: orient_raw)
    out_orientation = orient_val or multilabel_vocab.normalize_orientation(orient_raw)

    # Patentada (special: default False cuando no viene)
    patentada_raw = item.get("patentada") if "patentada" in item else item.get("patent") or item.get("is_patented")
    patentada_val = _normalize_patentada(item)
    patentada_meta = {}
    if patentada_raw is not None:
        _, m = _field_with_meta("patentada", lambda: patentada_raw)
        if m:
            patentada_meta = dict(m, value=patentada_val)
        else:
            patentada_meta = {"value": patentada_val, "source": _infer_source("patentada", item, has_ocr), "confidence": conf}

    # Head color, visual_state
    hc_val, hc_meta = _field_with_meta("head_color", lambda: item.get("head_color") or item.get("headColor"))
    vs_val, vs_meta = _field_with_meta("visual_state", lambda: item.get("visual_state") or item.get("state"))

    # Recomendados
    bht_val, bht_meta = _field_with_meta("brand_head_text", lambda: item.get("brand_head_text"))
    bbt_val, bbt_meta = _field_with_meta("brand_blade_text", lambda: item.get("brand_blade_text"))
    bvz_val, bvz_meta = _field_with_meta("brand_visible_zone", lambda: item.get("brand_visible_zone"))
    obg_val, obg_meta = _field_with_meta("ocr_brand_guess", lambda: item.get("ocr_brand_guess"))
    hs_val, hs_meta = _field_with_meta("head_shape", lambda: item.get("head_shape"))
    bp_val, bp_meta = _field_with_meta("blade_profile", lambda: item.get("blade_profile"))
    ts_val, ts_meta = _field_with_meta("tip_shape", lambda: item.get("tip_shape"))
    sc_val, sc_meta = _field_with_meta("side_count", lambda: item.get("side_count"))
    sym_val, sym_meta = _field_with_meta("symmetry", lambda: item.get("symmetry"))
    wl_val, wl_meta = _field_with_meta("wear_level", lambda: item.get("wear_level"))
    hsec_val, hsec_meta = _field_with_meta("high_security", lambda: item.get("high_security"))
    rc_val, rc_meta = _field_with_meta("requires_card", lambda: item.get("requires_card"))

    out: Dict[str, Any] = {
        "rank": rank,
        "brand": item.get("brand"),
        "model": item.get("model") or item.get("id_model_ref"),
        "type": multilabel_vocab.normalize_type(item.get("type")) or ("No identificado" if rank > 1 and not item else "key"),
        "confidence": conf,
        "explain_text": explain,
        "tags": tags,
        "compatibility_tags": tags,
        "id_model_ref": item.get("id_model_ref") or item.get("ref"),
        "crop_bbox": bbox,
        "orientation": out_orientation,
        "head_color": hc_val,
        "visual_state": vs_val,
        "patentada": patentada_val,
    }
    if orient_meta:
        out["orientation_meta"] = orient_meta
    if patentada_meta:
        out["patentada_meta"] = patentada_meta
    if hc_meta:
        out["head_color_meta"] = hc_meta
    if vs_meta:
        out["visual_state_meta"] = vs_meta

    out["brand_head_text"] = bht_val
    out["brand_blade_text"] = bbt_val
    out["brand_visible_zone"] = bvz_val
    out["ocr_brand_guess"] = obg_val
    out["head_shape"] = hs_val
    out["blade_profile"] = bp_val
    out["tip_shape"] = ts_val
    out["side_count"] = sc_val
    out["symmetry"] = sym_val
    out["wear_level"] = wl_val
    out["high_security"] = hsec_val
    out["requires_card"] = rc_val

    if bht_meta:
        out["brand_head_text_meta"] = bht_meta
    if bbt_meta:
        out["brand_blade_text_meta"] = bbt_meta
    if bvz_meta:
        out["brand_visible_zone_meta"] = bvz_meta
    if obg_meta:
        out["ocr_brand_guess_meta"] = obg_meta
    if hs_meta:
        out["head_shape_meta"] = hs_meta
    if bp_meta:
        out["blade_profile_meta"] = bp_meta
    if ts_meta:
        out["tip_shape_meta"] = ts_meta
    if sc_meta:
        out["side_count_meta"] = sc_meta
    if sym_meta:
        out["symmetry_meta"] = sym_meta
    if wl_meta:
        out["wear_level_meta"] = wl_meta
    if hsec_meta:
        out["high_security_meta"] = hsec_meta
    if rc_meta:
        out["requires_card_meta"] = rc_meta

    # Experimentales (sin *_meta por ahora)
    out["oxidation_present"] = multilabel_vocab.normalize_bool_or_null(item.get("oxidation_present"))
    out["surface_damage"] = multilabel_vocab.normalize_bool_or_null(item.get("surface_damage"))
    out["material_hint"] = (item.get("material_hint") or "").strip() or None
    out["restricted_copy"] = multilabel_vocab.normalize_bool_or_null(item.get("restricted_copy"))
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

    has_ocr = bool(d.get("ocr_detail") or d.get("ocr_hint"))
    roi_sources: List[str] = []
    results: List[Dict[str, Any]] = []
    for i, it in enumerate(items[:3], start=1):
        results.append(_normalize_result(dict(it or {}), i, roi_sources, has_ocr_in_response=has_ocr))

    while len(results) < 3:
        results.append(_normalize_result({}, len(results) + 1, roi_sources, has_ocr_in_response=has_ocr))

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

    # Multi-label Fase 4: pasar desde motor o inferir para compatibilidad
    if "multi_label_enabled" not in debug:
        debug["multi_label_enabled"] = False
    if "multi_label_fields_supported" not in debug:
        debug["multi_label_fields_supported"] = []
    if "multi_label_fields_present" not in debug:
        debug["multi_label_fields_present"] = []

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
        if "consistency_strong_conflicts" in cons:
            debug["consistency_strong_conflicts"] = cons["consistency_strong_conflicts"]
        if "consistency_weak_conflicts" in cons:
            debug["consistency_weak_conflicts"] = cons["consistency_weak_conflicts"]
        if "evidence_notes" in cons:
            debug["evidence_notes"] = cons["evidence_notes"]
    except Exception:
        debug["consistency_score"] = 70.0
        debug["consistency_reasons"] = []
        debug["consistency_conflicts"] = []
        debug["consistency_supports"] = []
        debug["consistency_level"] = "neutral"
        debug.setdefault("consistency_strong_conflicts", [])
        debug.setdefault("consistency_weak_conflicts", [])
        debug.setdefault("evidence_notes", [])

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
