"""
Dataset governance: reglas para should_store_sample y current_samples_for_candidate.
- should_store_sample: top_confidence >= THRESHOLD_STORE (0.75) y current < MAX (30)
- Fotos solo en servidor/taller; cliente nunca persiste imágenes.
"""
from typing import Optional

THRESHOLD_STORE = 0.75
MAX_SAMPLES_PER_REF = 30
STORAGE_PROBABILITY_DEFAULT = 0.75


def should_store_sample_by_rules(
    top_confidence: float,
    current_samples_for_candidate: int,
    *,
    threshold: float = THRESHOLD_STORE,
    max_per_ref: int = MAX_SAMPLES_PER_REF,
) -> bool:
    """
    Regla determinística: True solo si se cumplen umbral y límite.
    El motor aplica además storage_probability (aleatorio).
    """
    if top_confidence < threshold:
        return False
    if current_samples_for_candidate >= 0 and current_samples_for_candidate >= max_per_ref:
        return False
    return True


def clamp_current_samples(value: Optional[int]) -> int:
    """Normaliza current_samples_for_candidate; -1 si desconocido."""
    if value is None:
        return -1
    try:
        v = int(value)
        return v if v >= 0 else -1
    except (TypeError, ValueError):
        return -1
