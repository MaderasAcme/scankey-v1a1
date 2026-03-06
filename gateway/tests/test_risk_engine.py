"""
P0.3 Tests Risk Engine PASIVO.
- margin_tight -> risk sube
- low_confidence -> HIGH
- quality_low + roi_low -> sube
- ab_conflict -> sube
- high_confidence + consensus -> baja
- clamp 0..100
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.risk_engine import (
    compute_margin,
    compute_risk,
)


def test_margin_top1_top2():
    """margin = top1 - top2."""
    results = [
        {"confidence": 0.65, "brand": "Yale"},
        {"confidence": 0.62, "brand": "Tesa"},
        {"confidence": 0.0, "brand": None},
    ]
    assert 0.02 < compute_margin(results) < 0.04


def test_margin_solo_top1():
    """Sin top2 -> margin=1.0."""
    results = [{"confidence": 0.92, "brand": "Yale"}]
    assert compute_margin(results) == 1.0


def test_margin_tight_risk_sube():
    """margin < 0.03 -> risk sube (margin_tight)."""
    results = [
        {"confidence": 0.52, "brand": "A", "explain_text": ""},
        {"confidence": 0.50, "brand": "B", "explain_text": ""},
    ]
    debug = {}
    resp = {
        "results": results,
        "low_confidence": False,
        "high_confidence": False,
        "manufacturer_hint": {"found": False},
    }
    out = compute_risk(debug, resp)
    assert "margin_tight" in out["risk_reasons"]
    assert out["margin"] < 0.03


def test_low_confidence_high_risk():
    """low_confidence -> HIGH risk."""
    results = [
        {"confidence": 0.45, "brand": "X", "explain_text": ""},
        {"confidence": 0.30, "brand": "Y", "explain_text": ""},
    ]
    debug = {}
    resp = {
        "results": results,
        "low_confidence": True,
        "high_confidence": False,
        "manufacturer_hint": {"found": False},
    }
    out = compute_risk(debug, resp)
    assert out["risk_level"] == "HIGH"
    assert "low_confidence" in out["risk_reasons"]


def test_quality_low_roi_low_sube():
    """quality_score < 0.55 y roi_score < 0.60 -> risk sube."""
    results = [
        {"confidence": 0.70, "brand": "X", "explain_text": ""},
        {"confidence": 0.40, "brand": "Y", "explain_text": ""},
    ]
    debug = {"quality_score": 0.40, "roi_score": 0.50}
    resp = {
        "results": results,
        "low_confidence": False,
        "high_confidence": False,
        "manufacturer_hint": {"found": False},
    }
    out = compute_risk(debug, resp)
    assert "quality_low" in out["risk_reasons"]
    assert "roi_low" in out["risk_reasons"]


def test_ab_conflict_sube():
    """ab_conflict -> risk sube."""
    results = [
        {
            "confidence": 0.65,
            "brand": "Yale",
            "explain_text": "Discrepancia A/B: frontal Yale, trasera Tesa.",
        },
        {"confidence": 0.62, "brand": "Tesa", "explain_text": ""},
    ]
    debug = {}
    resp = {
        "results": results,
        "low_confidence": False,
        "high_confidence": False,
        "manufacturer_hint": {"found": False},
    }
    out = compute_risk(debug, resp)
    assert "ab_conflict" in out["risk_reasons"]


def test_high_confidence_consensus_baja():
    """high_confidence + ab_consensus -> risk baja."""
    results = [
        {
            "confidence": 0.98,
            "brand": "Yale",
            "explain_text": "Consenso A/B: coincidencia frontal y trasera.",
        },
        {"confidence": 0.50, "brand": "Tesa", "explain_text": ""},
    ]
    debug = {"quality_score": 0.9, "roi_score": 0.8}
    resp = {
        "results": results,
        "low_confidence": False,
        "high_confidence": True,
        "manufacturer_hint": {"found": True, "name": "Yale", "confidence": 0.9},
    }
    out = compute_risk(debug, resp)
    assert out["risk_level"] == "LOW"
    assert out["risk_score"] < 40


def test_clamp_0_100():
    """risk_score siempre en [0, 100]."""
    for low_conf, high_conf in [(True, False), (False, True)]:
        results = [
            {"confidence": 0.5, "brand": "X", "explain_text": ""},
            {"confidence": 0.48, "brand": "Y", "explain_text": ""},
        ]
        debug = {"quality_score": 0.2, "roi_score": 0.3}
        resp = {
            "results": results,
            "low_confidence": low_conf,
            "high_confidence": high_conf,
            "manufacturer_hint": {"found": False},
        }
        out = compute_risk(debug, resp)
        assert 0 <= out["risk_score"] <= 100
