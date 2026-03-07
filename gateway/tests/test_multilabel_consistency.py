"""
Multi-label Fase 3: tests de consistency layer.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.multilabel_consistency import compute_consistency


def test_fallback_single_class_no_multilabel():
    """Sin atributos multi-label -> score neutro, arrays vacíos."""
    resp = {
        "results": [
            {"rank": 1, "brand": "Yale", "model": "24D", "type": "Serreta", "confidence": 0.92},
        ],
        "manufacturer_hint": {"found": False},
    }
    out = compute_consistency(resp)
    assert out["consistency_score"] == 70.0
    assert out["consistency_level"] == "neutral"
    assert out["consistency_conflicts"] == []
    assert out["consistency_supports"] == []


def test_orientation_match():
    """orientation coherente -> orientation_match support."""
    resp = {
        "results": [
            {"rank": 1, "brand": "Yale", "orientation": "front", "confidence": 0.9},
        ],
        "manufacturer_hint": {"found": False},
    }
    out = compute_consistency(resp)
    assert "orientation_match" in out["consistency_supports"]
    assert out["consistency_score"] >= 70


def test_orientation_conflict():
    """top1 y top2 con orientation distinta -> orientation_conflict."""
    resp = {
        "results": [
            {"rank": 1, "brand": "Yale", "orientation": "front", "confidence": 0.9},
            {"rank": 2, "brand": "Yale", "orientation": "back", "confidence": 0.7},
        ],
        "manufacturer_hint": {"found": False},
    }
    out = compute_consistency(resp)
    assert "orientation_conflict" in out["consistency_conflicts"]
    assert out["consistency_score"] < 70


def test_patentada_legal_restriction():
    """patentada=true -> legal_restriction."""
    resp = {
        "results": [
            {"rank": 1, "brand": "X", "patentada": True, "confidence": 0.9},
        ],
        "manufacturer_hint": {"found": False},
    }
    out = compute_consistency(resp)
    assert "legal_restriction" in out["consistency_conflicts"]
    assert out["consistency_score"] < 70


def test_high_security_requires_card():
    """high_security o requires_card -> security_restriction."""
    resp = {
        "results": [
            {"rank": 1, "brand": "X", "high_security": True, "confidence": 0.9},
        ],
    }
    out = compute_consistency(resp)
    assert "security_restriction" in out["consistency_conflicts"]


def test_brand_match():
    """brand_head_text coincide con top1.brand -> brand_match."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "yale",
                "brand_head_text": "YALE",
                "confidence": 0.9,
            },
        ],
    }
    out = compute_consistency(resp)
    assert "brand_match" in out["consistency_supports"]


def test_brand_conflict():
    """brand_head_text contradice top1.brand -> brand_conflict."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "lince",
                "brand_head_text": "YALE",
                "confidence": 0.9,
            },
        ],
    }
    out = compute_consistency(resp)
    assert "brand_conflict" in out["consistency_conflicts"]


def test_type_tag_match():
    """type presente y válido con otra señal multi-label -> type_tag_match."""
    resp = {
        "results": [
            {"rank": 1, "brand": "X", "type": "Serreta", "orientation": "front", "confidence": 0.9},
        ],
    }
    out = compute_consistency(resp)
    assert "type_tag_match" in out["consistency_supports"]


def test_visual_degradation():
    """wear_level=high -> visual_degradation."""
    resp = {
        "results": [
            {"rank": 1, "brand": "X", "wear_level": "high", "confidence": 0.9},
        ],
    }
    out = compute_consistency(resp)
    assert "visual_degradation" in out["consistency_conflicts"]


def test_consistency_score_clamped():
    """Score entre 0 y 100."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "a",
                "brand_head_text": "Z",
                "patentada": True,
                "orientation": "x",
                "confidence": 0.9,
            },
            {
                "rank": 2,
                "orientation": "y",
                "confidence": 0.8,
            },
        ],
    }
    out = compute_consistency(resp)
    assert 0 <= out["consistency_score"] <= 100
    assert out["consistency_level"] in ("high", "medium", "low")
