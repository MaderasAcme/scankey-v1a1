"""
Wrapper: re-exporta desde common.size_class (source of truth).
Mantener por compatibilidad de imports legacy.
"""
from common.size_class import (
    TIE_THRESHOLD,
    RATIO_CORTA_MAX,
    RATIO_LARGA_MIN,
    _to_float,
    is_full_frame,
    extract_size_features,
    get_size_class,
    apply_size_class_tiebreak,
    size_class_explain_suffix,
    extract_size_class_debug_only,
)

__all__ = [
    "TIE_THRESHOLD",
    "RATIO_CORTA_MAX",
    "RATIO_LARGA_MIN",
    "_to_float",
    "is_full_frame",
    "extract_size_features",
    "get_size_class",
    "apply_size_class_tiebreak",
    "size_class_explain_suffix",
    "extract_size_class_debug_only",
]
