"""
Tests de reglas dataset governance: should_store_sample, current_samples_for_candidate.
- top >= 0.75 y current < 30 -> puede store (regla cumple)
- top < 0.75 -> no store
- current >= 30 -> no store
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.dataset_governance import (
    should_store_sample_by_rules,
    clamp_current_samples,
    THRESHOLD_STORE,
    MAX_SAMPLES_PER_REF,
)


def test_should_store_when_above_threshold_and_under_max():
    """top >= 0.75 y current < 30 -> regla permite store."""
    assert should_store_sample_by_rules(0.75, -1) is True
    assert should_store_sample_by_rules(0.80, 0) is True
    assert should_store_sample_by_rules(0.95, 8) is True
    assert should_store_sample_by_rules(0.75, 29) is True


def test_should_not_store_when_below_threshold():
    """top < 0.75 -> no store."""
    assert should_store_sample_by_rules(0.74, 0) is False
    assert should_store_sample_by_rules(0.60, 5) is False
    assert should_store_sample_by_rules(0.0, -1) is False


def test_should_not_store_when_at_or_above_max():
    """current >= 30 -> no store."""
    assert should_store_sample_by_rules(0.95, 30) is False
    assert should_store_sample_by_rules(0.80, 31) is False
    assert should_store_sample_by_rules(0.75, 30) is False


def test_clamp_current_samples():
    """current_samples_for_candidate normalizado; -1 si desconocido."""
    assert clamp_current_samples(None) == -1
    assert clamp_current_samples(0) == 0
    assert clamp_current_samples(8) == 8
    assert clamp_current_samples(30) == 30
    assert clamp_current_samples(-1) == -1
    assert clamp_current_samples(-5) == -1
    assert clamp_current_samples("10") == 10


def test_normalize_contract_respects_store_rules():
    """normalize_contract: should_store_sample según top y current."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from normalize import normalize_contract

    # top 0.80, current 5 -> should_store True (cuando motor no envía key, default)
    raw_ok = {
        "results": [{"brand": "Yale", "confidence": 0.80}],
        "current_samples_for_candidate": 5,
    }
    out = normalize_contract(raw_ok)
    assert out["should_store_sample"] is True
    assert out["current_samples_for_candidate"] == 5

    # top 0.70 -> should_store False
    raw_low = {
        "results": [{"brand": "X", "confidence": 0.70}],
        "current_samples_for_candidate": 0,
    }
    out_low = normalize_contract(raw_low)
    assert out_low["should_store_sample"] is False

    # top 0.90 pero current 30 -> should_store False
    raw_max = {
        "results": [{"brand": "Yale", "confidence": 0.90}],
        "current_samples_for_candidate": 30,
    }
    out_max = normalize_contract(raw_max)
    assert out_max["should_store_sample"] is False
