"""
Multi-label Fase 6 — Evidence fusion por source/confidence.
Helpers para evaluar fuerza de evidencia en consistency/risk/policy.
Sin *_meta -> fallback legacy: evidencia suficiente (comportamiento previo).
"""
from typing import Dict, Any, Optional

# Fuentes ordenadas por fiabilidad (de mayor a menor)
SOURCE_STRENGTH = {
    "manual": 5,    # muy fuerte
    "model": 4,     # fuerte
    "catalog": 3,   # media-fuerte
    "ocr": 2,       # media
    "heuristic": 1, # débil-media
    "unknown": 0,   # débil
}

# Umbrales de confidence
CONF_STRONG = 0.85
CONF_MEDIUM = 0.60
# < CONF_MEDIUM = débil


def get_attr_meta(item: Dict[str, Any], field_name: str) -> Optional[Dict[str, Any]]:
    """
    Obtiene el meta del campo: item.get('field_name_meta').
    Devuelve None si no existe o no es dict.
    """
    if not item or not field_name:
        return None
    meta = item.get(f"{field_name}_meta")
    if isinstance(meta, dict) and meta:
        return meta
    return None


def meta_confidence(item: Dict[str, Any], field_name: str, default: Optional[float] = None) -> Optional[float]:
    """Confidence del campo desde *_meta o item.confidence como fallback."""
    meta = get_attr_meta(item, field_name)
    if meta is not None and "confidence" in meta:
        try:
            c = float(meta["confidence"])
            return max(0.0, min(1.0, c)) if 0 <= c <= 1 else default
        except (TypeError, ValueError):
            pass
    # Fallback: confidence del item (top1)
    v = item.get("confidence") or item.get("conf") or item.get("score")
    if v is not None:
        try:
            c = float(v)
            return max(0.0, min(1.0, c))
        except (TypeError, ValueError):
            pass
    return default


def meta_source(item: Dict[str, Any], field_name: str, default: str = "unknown") -> str:
    """Source del campo desde *_meta."""
    meta = get_attr_meta(item, field_name)
    if meta is not None and "source" in meta:
        s = str(meta["source"] or "").strip().lower()
        if s in SOURCE_STRENGTH:
            return s
    return default


def is_strong_evidence(field_name: str, meta: Optional[Dict[str, Any]], item: Optional[Dict[str, Any]] = None) -> bool:
    """
    True si la evidencia es fuerte: source fiable Y confidence >= 0.85.
    Sin meta -> True (legacy fallback: mantener comportamiento previo).
    """
    if meta is None or not meta:
        return True  # Sin meta = legacy = tratamos como fuerte
    src = str((meta.get("source") or "unknown")).strip().lower()
    conf = meta.get("confidence")
    if conf is not None:
        try:
            c = float(conf)
            if c < CONF_STRONG:
                return False
        except (TypeError, ValueError):
            return False
    # Source fuerte: manual, model, catalog
    return src in ("manual", "model", "catalog")


def is_weak_evidence(field_name: str, meta: Optional[Dict[str, Any]], item: Optional[Dict[str, Any]] = None) -> bool:
    """
    True si la evidencia es débil: source débil O confidence < 0.60.
    Sin meta -> False (legacy = no débil).
    """
    if meta is None or not meta:
        return False  # Sin meta = legacy = no tratamos como débil
    src = str((meta.get("source") or "unknown")).strip().lower()
    conf = meta.get("confidence")
    if conf is not None:
        try:
            c = float(conf)
            if c < CONF_MEDIUM:
                return True  # confidence baja = débil
        except (TypeError, ValueError):
            return True
    return src in ("heuristic", "unknown") or (src == "ocr" and conf is not None and float(conf) < CONF_STRONG)


def evidence_strength(meta: Optional[Dict[str, Any]]) -> str:
    """
    Devuelve "strong" | "medium" | "weak".
    Sin meta -> "strong" (legacy).
    """
    if meta is None or not meta:
        return "strong"
    src = str((meta.get("source") or "unknown")).strip().lower()
    conf = meta.get("confidence")
    c = 0.7
    if conf is not None:
        try:
            c = float(conf)
        except (TypeError, ValueError):
            pass
    src_strength = SOURCE_STRENGTH.get(src, 0)
    if c >= CONF_STRONG and src_strength >= 3:
        return "strong"
    if c < CONF_MEDIUM or src_strength <= 1:
        return "weak"
    return "medium"


def should_trigger_strong_conflict(meta: Optional[Dict[str, Any]]) -> bool:
    """
    True si esta evidencia justifica un conflicto fuerte (penalización completa).
    Regla: no disparar conflictos duros con evidencia débil.
    """
    return is_strong_evidence("", meta) and not is_weak_evidence("", meta)


def should_trigger_weak_conflict(meta: Optional[Dict[str, Any]]) -> bool:
    """True si la evidencia es media (conflicto suave/informativo)."""
    if meta is None or not meta:
        return False
    s = evidence_strength(meta)
    return s == "medium"


def support_weight(meta: Optional[Dict[str, Any]]) -> float:
    """
    Peso para supports: 1.0 fuerte, 0.5 media, 0.2 débil.
    Sin meta -> 1.0 (legacy).
    """
    s = evidence_strength(meta)
    return {"strong": 1.0, "medium": 0.5, "weak": 0.2}.get(s, 1.0)
