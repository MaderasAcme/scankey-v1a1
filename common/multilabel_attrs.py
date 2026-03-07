"""
Multi-label Fase 5 — Provenance y metadatos por atributo.
Fuentes válidas, helpers para value/confidence/source.
"""
from typing import Optional, Dict, Any

# Fuentes válidas
SOURCES = frozenset(("model", "ocr", "catalog", "heuristic", "manual", "unknown"))

# Mapeo field_name -> normalizer de common.multilabel_vocab
_NORMALIZERS = {
    "orientation": "normalize_orientation",
    "brand_visible_zone": "normalize_brand_visible_zone",
    "wear_level": "normalize_wear_level",
    "visual_state": "normalize_visual_state",
    "type": "normalize_type",
    "head_color": "normalize_head_color",
    "side_count": "normalize_side_count",
    "patentada": "normalize_bool_or_null",
    "high_security": "normalize_bool_or_null",
    "requires_card": "normalize_bool_or_null",
    "symmetry": "normalize_bool_or_null",
    "brand_head_text": "normalize_string_simple",
    "brand_blade_text": "normalize_string_simple",
    "ocr_brand_guess": "normalize_string_simple",
    "head_shape": "normalize_string_simple",
    "blade_profile": "normalize_string_simple",
    "tip_shape": "normalize_string_simple",
}


def _valid_source(src: Optional[str]) -> str:
    """Devuelve source si es válido, else 'unknown'."""
    if src is None or not isinstance(src, str):
        return "unknown"
    s = str(src).strip().lower()
    return s if s in SOURCES else "unknown"


def _clamp_confidence(c: Any) -> Optional[float]:
    """Confidence 0..1 o None."""
    if c is None:
        return None
    try:
        v = float(c)
        return max(0.0, min(1.0, v)) if 0 <= v <= 1 else None
    except (TypeError, ValueError):
        return None


def make_attr(value: Any, confidence: Optional[float] = None, source: str = "unknown") -> Dict[str, Any]:
    """
    Crea estructura { value, confidence?, source }.
    Si value es None, devuelve dict vacío (no se incluye meta).
    """
    src = _valid_source(source)
    conf = _clamp_confidence(confidence)
    if value is None:
        return {}
    out: Dict[str, Any] = {"value": value, "source": src}
    if conf is not None:
        out["confidence"] = conf
    return out


def normalize_attr(
    field_name: str,
    raw_value: Any,
    confidence: Optional[float] = None,
    source: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Normaliza un atributo usando el vocabulario canónico y devuelve meta estable.
    Output: { "value": ..., "confidence": ..., "source": ... }
    Si el valor normalizado es None, devuelve {}.
    """
    try:
        from common import multilabel_vocab as vocab
    except ImportError:
        import multilabel_vocab as vocab  # fallback si ejecución desde common/

    norm_name = _NORMALIZERS.get(field_name)
    if norm_name is None:
        # Campo sin normalizador: usar raw tal cual
        if raw_value is None:
            return {}
        return make_attr(raw_value, confidence, source or "unknown")

    norm_fn = getattr(vocab, norm_name, None)
    if norm_fn is None:
        return make_attr(raw_value, confidence, source or "unknown")

    normalized = norm_fn(raw_value)
    if normalized is None:
        return {}
    return make_attr(normalized, confidence, source or "unknown")


def infer_source_from_context(field_name: str, item: Dict[str, Any]) -> str:
    """
    Infiere source cuando no viene explícito.
    - brand_head_text, brand_blade_text, ocr_brand_guess -> ocr si hay OCR, else model
    - orientation, head_color, etc. típicamente -> model
    - heuristic si viene de normalización auxiliar
    """
    if field_name in ("brand_head_text", "brand_blade_text", "ocr_brand_guess"):
        # Si el item tiene pista de OCR
        if item.get("ocr_brand_guess") and field_name == "ocr_brand_guess":
            return "ocr"
        # Puede venir de modelo o OCR; sin evidencia -> unknown
        return "unknown"
    # Por defecto: model (viene del clasificador) o unknown
    return "model"
