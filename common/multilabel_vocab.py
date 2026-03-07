"""
Multi-label Fase 5 — Vocabularios canónicos.
Normalizadores y mapeos para atributos multi-label.
Compatibilidad: no romper valores legacy; si no hay match, devolver None.
"""
from typing import Optional, Any

# --- Vocabularios canónicos ---

ORIENTATION_CANON = {
    "left": "left",
    "izq": "left",
    "izquierda": "left",
    "l": "left",
    "right": "right",
    "der": "right",
    "derecha": "right",
    "r": "right",
    "front": "front",
    "back": "back",
}
ORIENTATION_VALID = frozenset(("left", "right", "front", "back"))

BRAND_VISIBLE_ZONE_VALID = frozenset(("head", "blade", "both", "none"))

WEAR_LEVEL_VALID = frozenset(("low", "medium", "high"))
WEAR_LEVEL_ALIAS = {
    "bajo": "low",
    "mediano": "medium",
    "medio": "medium",
    "alto": "high",
    "baja": "low",
    "media": "medium",
    "alta": "high",
}

VISUAL_STATE_VALID = frozenset(("good", "worn", "oxidized", "damaged"))
VISUAL_STATE_ALIAS = {
    "bueno": "good",
    "bien": "good",
    "ok": "good",
    "desgastado": "worn",
    "oxidado": "oxidized",
    "dañado": "damaged",
    "damaged": "damaged",
    "worn": "worn",
    "oxidized": "oxidized",
}

TYPE_ALIAS = {
    "serreta": "Serreta",
    "cilindro": "Cilindro",
    "bumping": "Bumping",
    "tubular": "Tubular",
    "dimple": "Dimple",
    "doble": "Doble",
    "car": "Automóvil",
    "auto": "Automóvil",
    "key": "key",
}


def normalize_orientation(val: Any) -> Optional[str]:
    """left | right | front | back. Aliases: izq/izquierda/l -> left, der/derecha/r -> right."""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    if not s:
        return None
    return ORIENTATION_CANON.get(s) or (s if s in ORIENTATION_VALID else None)


def normalize_brand_visible_zone(val: Any) -> Optional[str]:
    """head | blade | both | none"""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return s if s in BRAND_VISIBLE_ZONE_VALID else None


def normalize_wear_level(val: Any) -> Optional[str]:
    """low | medium | high"""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return WEAR_LEVEL_ALIAS.get(s) or (s if s in WEAR_LEVEL_VALID else None)


def normalize_visual_state(val: Any) -> Optional[str]:
    """good | worn | oxidized | damaged"""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return VISUAL_STATE_ALIAS.get(s) or (s if s in VISUAL_STATE_VALID else None)


def normalize_type(val: Any) -> Optional[str]:
    """Canoniza variantes de type sin romper compatibilidad."""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip()
    if not s:
        return None
    lower = s.lower()
    return TYPE_ALIAS.get(lower) or s


def normalize_head_color(val: Any) -> Optional[str]:
    """Lower simple y estable. No inventar."""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip().lower()
    return s if s else None


def normalize_side_count(val: Any) -> Optional[int]:
    """int o null"""
    if val is None:
        return None
    try:
        n = int(val)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def normalize_bool_or_null(val: Any) -> Optional[bool]:
    """patentada, high_security, requires_card, symmetry -> bool o null."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        s = val.strip().lower()
        if s in ("true", "1", "yes", "si", "sí"):
            return True
        if s in ("false", "0", "no"):
            return False
    return None


def normalize_string_simple(val: Any) -> Optional[str]:
    """Para brand_head_text, brand_blade_text, ocr_brand_guess, head_shape, blade_profile, tip_shape."""
    if val is None or not isinstance(val, str):
        return None
    s = str(val).strip()
    return s if s else None
