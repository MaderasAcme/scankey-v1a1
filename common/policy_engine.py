"""
BLOQUE 3 — PolicyEngine determinista (v1).
Capa única de decisión que unifica Quality + Risk + OCR + ROI.
Devuelve action, reasons, user_message para el flujo.
"""
from typing import Dict, Any, List, Optional

POLICY_VERSION = "v1"

# Acciones posibles
ACTION_ALLOW = "ALLOW"
ACTION_WARN = "WARN"
ACTION_BLOCK = "BLOCK"
ACTION_REQUIRE_MANUAL_REVIEW = "REQUIRE_MANUAL_REVIEW"
ACTION_ALLOW_WITH_OVERRIDE = "ALLOW_WITH_OVERRIDE"
ACTION_RUN_OCR = "RUN_OCR"


def _get_float(val: Any, default: Optional[float]) -> Optional[float]:
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _get_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val or "").strip()


def build_policy_inputs(response: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Extrae señales de response para evaluar políticas.
    Lee de response y response.debug.
    Multi-label (Fase 2): preparado para usar top1.patentada, orientation,
    brand_head_text/brand_blade_text (contradicción OCR/top1), high_security, requires_card.
    """
    if not response:
        return {}

    debug = response.get("debug") or {}
    results = response.get("results") or response.get("candidates") or []
    if not isinstance(results, list):
        results = []
    top1 = results[0] if results else {}
    mh = response.get("manufacturer_hint") or {}
    mch = response.get("manual_correction_hint") or {}

    # confidence del top1
    top1_conf = _get_float(top1.get("confidence") or top1.get("conf") or top1.get("score"), None)

    # margin estrecho: risk_engine usa < 0.08 para margin_medium, < 0.03 para margin_tight
    margin = _get_float(debug.get("margin"), None)
    risk_reasons = debug.get("risk_reasons") or []
    if not isinstance(risk_reasons, list):
        risk_reasons = []

    quality_score = _get_float(debug.get("quality_score"), 1.0)
    roi_score = _get_float(debug.get("roi_score"), 1.0)
    quality_warning = bool(debug.get("quality_warning")) or (quality_score is not None and quality_score < 0.55) or (roi_score is not None and roi_score < 0.60)
    inputs = {
        "low_confidence": bool(response.get("low_confidence")),
        "high_confidence": bool(response.get("high_confidence")),
        "quality_score": quality_score,
        "roi_score": roi_score,
        "risk_score": _get_float(debug.get("risk_score"), None),
        "risk_level": _get_str(debug.get("risk_level")).upper() or "LOW",
        "risk_reasons": risk_reasons,
        "quality_warning": quality_warning,
        "explain_text": _get_str(top1.get("explain_text")),
        "manufacturer_hint": mh,
        "manual_correction_hint": mch,
        "ocr_hint": response.get("ocr_hint"),
        "ocr_detail": response.get("ocr_detail"),
        "margin": margin,
        "top1_confidence": top1_conf,
        "top1_brand": _get_str(top1.get("brand") or top1.get("label")),
        "top1_model": _get_str(top1.get("model") or top1.get("id_model_ref") or top1.get("ref")),
        "top1": top1,
        "results": results,
    }
    if context:
        inputs["_context"] = context
    return inputs


def _has_brand_model(inputs: Dict[str, Any]) -> bool:
    b = inputs.get("top1_brand") or ""
    m = inputs.get("top1_model") or ""
    return bool(b or m)


def _manual_wants_ocr_text(inputs: Dict[str, Any]) -> bool:
    fields = inputs.get("manual_correction_hint") or {}
    if isinstance(fields, dict):
        f = fields.get("fields") or []
    else:
        f = []
    if not isinstance(f, list):
        return False
    return "ocr_text" in f or "ocr" in str(f).lower()


def _has_sufficient_text_evidence(inputs: Dict[str, Any]) -> bool:
    """Evidencia textual: explain_text con contenido o brand/model presentes."""
    explain = inputs.get("explain_text") or ""
    return bool(_has_brand_model(inputs) or len(explain) > 20)


def _is_margin_narrow(inputs: Dict[str, Any]) -> bool:
    m = inputs.get("margin")
    if m is None:
        return False
    return m < 0.08


def _has_ab_conflict(inputs: Dict[str, Any]) -> bool:
    return "ab_conflict" in (inputs.get("risk_reasons") or [])


def _has_manufacturer_mismatch(inputs: Dict[str, Any]) -> bool:
    return "manufacturer_mismatch" in (inputs.get("risk_reasons") or [])


def evaluate_policy(response: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Evalúa reglas deterministas y devuelve acción, reasons y user_message.
    Prioridad: BLOCK > REQUIRE_MANUAL_REVIEW > ALLOW_WITH_OVERRIDE > RUN_OCR > WARN > ALLOW
    """
    inputs = build_policy_inputs(response, context)
    reasons: List[str] = []
    applied_rules: List[str] = []

    # Defaults seguros
    quality_score = inputs.get("quality_score")
    if quality_score is None:
        quality_score = 1.0
    roi_score = inputs.get("roi_score")
    if roi_score is None:
        roi_score = 1.0
    risk_score = inputs.get("risk_score") or 0
    risk_level = inputs.get("risk_level") or "LOW"
    low_confidence = inputs.get("low_confidence", False)
    high_confidence = inputs.get("high_confidence", False)
    quality_warning = inputs.get("quality_warning", False)

    # ----- REGLA 1 — BLOCK -----
    if quality_score < 0.35:
        reasons.append("quality_block")
        applied_rules.append("rule_block_quality")
        return _make_result(
            ACTION_BLOCK,
            reasons,
            "Calidad insuficiente. Repite la captura.",
            inputs,
            applied_rules,
        )
    if roi_score < 0.45:
        reasons.append("roi_block")
        applied_rules.append("rule_block_roi")
        return _make_result(
            ACTION_BLOCK,
            reasons,
            "Calidad insuficiente. Repite la captura.",
            inputs,
            applied_rules,
        )

    # ----- REGLA 2 — REQUIRE_MANUAL_REVIEW -----
    if low_confidence or risk_level == "HIGH" or risk_score >= 70:
        if low_confidence:
            reasons.append("low_confidence")
        if risk_level == "HIGH":
            reasons.append("risk_high")
        if risk_score >= 70 and risk_level != "HIGH":
            reasons.append("risk_score_high")
        applied_rules.append("rule_require_manual_review")
        return _make_result(
            ACTION_REQUIRE_MANUAL_REVIEW,
            reasons,
            "Resultado dudoso. Revisa manualmente.",
            inputs,
            applied_rules,
        )

    # ----- REGLA 3 — ALLOW_WITH_OVERRIDE -----
    if quality_warning or risk_level == "MEDIUM":
        if quality_warning:
            reasons.append("quality_warning")
        if risk_level == "MEDIUM":
            reasons.append("risk_medium")
        applied_rules.append("rule_allow_with_override")
        return _make_result(
            ACTION_ALLOW_WITH_OVERRIDE,
            reasons,
            "Hay señales de riesgo. Puedes continuar con precaución.",
            inputs,
            applied_rules,
        )

    # ----- REGLA 4 — RUN_OCR -----
    # (low_confidence ya causó REQUIRE_MANUAL_REVIEW arriba; aquí solo si no low_conf)
    missing_brand_model = not _has_brand_model(inputs)
    manual_wants_ocr = _manual_wants_ocr_text(inputs)
    low_conf_no_evidence = low_confidence and not _has_sufficient_text_evidence(inputs)

    if missing_brand_model or manual_wants_ocr or low_conf_no_evidence:
        if missing_brand_model:
            reasons.append("missing_brand_model")
        if manual_wants_ocr:
            reasons.append("manual_wants_ocr")
        if low_conf_no_evidence:
            reasons.append("low_confidence_no_evidence")
        applied_rules.append("rule_run_ocr")
        return _make_result(
            ACTION_RUN_OCR,
            reasons,
            "Se intentará obtener una pista adicional.",
            inputs,
            applied_rules,
        )

    # ----- REGLA 5 — WARN -----
    margin_narrow = _is_margin_narrow(inputs)
    ab_conflict = _has_ab_conflict(inputs)
    mfr_mismatch = _has_manufacturer_mismatch(inputs)

    if margin_narrow or ab_conflict or mfr_mismatch:
        if margin_narrow:
            reasons.append("margin_narrow")
        if ab_conflict:
            reasons.append("ab_conflict")
        if mfr_mismatch:
            reasons.append("manufacturer_mismatch")
        applied_rules.append("rule_warn")
        return _make_result(
            ACTION_WARN,
            reasons,
            "Resultado posible, pero conviene revisar.",
            inputs,
            applied_rules,
        )

    # ----- REGLA 6 — ALLOW -----
    if high_confidence and risk_level == "LOW" and quality_score >= 0.55 and roi_score >= 0.60:
        reasons.append("all_ok")
        applied_rules.append("rule_allow")
        return _make_result(
            ACTION_ALLOW,
            reasons,
            "Resultado aceptable.",
            inputs,
            applied_rules,
        )

    # Fallback: ALLOW (no hay bloqueo ni revisión explícita)
    applied_rules.append("rule_fallback_allow")
    return _make_result(
        ACTION_ALLOW,
        ["fallback"],
        "Resultado aceptable.",
        inputs,
        applied_rules,
    )


def _make_result(
    action: str,
    reasons: List[str],
    user_message: str,
    inputs: Dict[str, Any],
    applied_rules: List[str],
) -> Dict[str, Any]:
    """Construye el objeto de salida estándar."""
    # Sanitizar inputs para debug (sin objetos pesados)
    safe_inputs = {}
    for k, v in inputs.items():
        if k.startswith("_"):
            continue
        if k in ("top1", "results", "manufacturer_hint", "manual_correction_hint"):
            continue
        safe_inputs[k] = v

    return {
        "action": action,
        "reasons": list(dict.fromkeys(reasons)),
        "user_message": user_message,
        "debug": {
            "policy_version": POLICY_VERSION,
            "inputs": safe_inputs,
            "applied_rules": applied_rules,
        },
    }
