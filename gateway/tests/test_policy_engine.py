"""
BLOQUE 3: Tests PolicyEngine determinista.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.policy_engine import (
    evaluate_policy,
    build_policy_inputs,
    ACTION_BLOCK,
    ACTION_REQUIRE_MANUAL_REVIEW,
    ACTION_ALLOW_WITH_OVERRIDE,
    ACTION_RUN_OCR,
    ACTION_WARN,
    ACTION_ALLOW,
)


def test_block_quality():
    """BLOCK por quality_score < 0.35."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.7}],
        "low_confidence": False,
        "high_confidence": False,
        "debug": {"quality_score": 0.30, "roi_score": 0.8, "risk_level": "LOW"},
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_BLOCK
    assert "quality_block" in out["reasons"]
    assert "Calidad insuficiente" in out["user_message"]


def test_block_roi():
    """BLOCK por roi_score < 0.45."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.7}],
        "low_confidence": False,
        "high_confidence": False,
        "debug": {"quality_score": 0.8, "roi_score": 0.40, "risk_level": "LOW"},
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_BLOCK
    assert "roi_block" in out["reasons"]


def test_require_manual_review_low_confidence():
    """REQUIRE_MANUAL_REVIEW por low_confidence."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.55}],
        "low_confidence": True,
        "high_confidence": False,
        "debug": {"quality_score": 0.7, "roi_score": 0.7, "risk_level": "MEDIUM"},
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_REQUIRE_MANUAL_REVIEW
    assert "low_confidence" in out["reasons"]
    assert "Revisa manualmente" in out["user_message"]


def test_require_manual_review_risk_high():
    """REQUIRE_MANUAL_REVIEW por risk_level HIGH."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.70}],
        "low_confidence": False,
        "high_confidence": False,
        "debug": {
            "quality_score": 0.7,
            "roi_score": 0.7,
            "risk_level": "HIGH",
            "risk_score": 75,
        },
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_REQUIRE_MANUAL_REVIEW
    assert "risk_high" in out["reasons"]


def test_allow_with_override_quality_warning():
    """ALLOW_WITH_OVERRIDE por quality_warning."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.75}],
        "low_confidence": False,
        "high_confidence": False,
        "debug": {
            "quality_score": 0.5,
            "roi_score": 0.7,
            "quality_warning": True,
            "risk_level": "LOW",
        },
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_ALLOW_WITH_OVERRIDE
    assert "quality_warning" in out["reasons"]
    assert "precaución" in out["user_message"].lower()


def test_run_ocr_missing_brand_model():
    """RUN_OCR por falta de brand/model."""
    resp = {
        "results": [
            {"brand": None, "model": None, "confidence": 0.70, "explain_text": ""},
            {"brand": "Y", "model": "Z", "confidence": 0.5},
        ],
        "low_confidence": False,
        "high_confidence": False,
        "debug": {"quality_score": 0.7, "roi_score": 0.7, "risk_level": "LOW"},
        "manual_correction_hint": {"fields": ["marca", "modelo"]},
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_RUN_OCR
    assert "missing_brand_model" in out["reasons"]
    assert "pista adicional" in out["user_message"].lower()


def test_run_ocr_manual_wants_ocr():
    """RUN_OCR por manual_correction_hint pide ocr_text."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.72}],
        "low_confidence": False,
        "high_confidence": False,
        "debug": {"quality_score": 0.7, "roi_score": 0.7, "risk_level": "LOW"},
        "manual_correction_hint": {"fields": ["marca", "modelo", "ocr_text"]},
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_RUN_OCR
    assert "manual_wants_ocr" in out["reasons"]


def test_warn_ab_conflict():
    """WARN por ab_conflict."""
    resp = {
        "results": [
            {
                "brand": "Yale",
                "model": "24D",
                "confidence": 0.65,
                "explain_text": "Discrepancia A/B: frontal Yale, trasera Tesa.",
            },
            {"brand": "Tesa", "confidence": 0.62},
        ],
        "low_confidence": False,
        "high_confidence": False,
        "manufacturer_hint": {"found": False},
        "debug": {
            "quality_score": 0.8,
            "roi_score": 0.7,
            "risk_level": "LOW",
            "risk_score": 40,
            "risk_reasons": ["ab_conflict"],
            "margin": 0.03,
        },
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_WARN
    assert "ab_conflict" in out["reasons"]
    assert "conviene revisar" in out["user_message"].lower()


def test_allow_high_confidence():
    """ALLOW por high_confidence + quality/risk correctos."""
    resp = {
        "results": [{"brand": "Yale", "model": "24D", "confidence": 0.96}],
        "low_confidence": False,
        "high_confidence": True,
        "debug": {
            "quality_score": 0.75,
            "roi_score": 0.70,
            "risk_level": "LOW",
            "risk_score": 25,
        },
    }
    out = evaluate_policy(resp)
    assert out["action"] == ACTION_ALLOW
    assert "Resultado aceptable" in out["user_message"]


def test_build_policy_inputs():
    """build_policy_inputs extrae señales correctamente."""
    resp = {
        "low_confidence": True,
        "results": [{"brand": "X", "confidence": 0.5, "explain_text": "Test"}],
        "debug": {
            "quality_score": 0.6,
            "roi_score": 0.5,
            "risk_score": 55,
            "risk_level": "MEDIUM",
            "risk_reasons": ["roi_low"],
            "margin": 0.05,
        },
    }
    inputs = build_policy_inputs(resp)
    assert inputs["low_confidence"] is True
    assert inputs["quality_score"] == 0.6
    assert inputs["roi_score"] == 0.5
    assert inputs["risk_level"] == "MEDIUM"
    assert inputs["top1_brand"] == "X"
    assert "roi_low" in inputs["risk_reasons"]


def test_policy_debug_output():
    """Salida incluye debug.policy_version, inputs, applied_rules."""
    resp = {
        "results": [{"brand": "X", "model": "Y", "confidence": 0.98}],
        "low_confidence": False,
        "high_confidence": True,
        "debug": {"quality_score": 0.8, "roi_score": 0.7, "risk_level": "LOW"},
    }
    out = evaluate_policy(resp)
    assert "debug" in out
    assert out["debug"].get("policy_version") == "v1"
    assert "applied_rules" in out["debug"]
    assert "inputs" in out["debug"]


def test_normalize_integrates_policy():
    """normalize_contract añade policy_* a debug."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from normalize import normalize_contract

    raw = {
        "results": [
            {"brand": "Yale", "model": "24D", "confidence": 0.92},
            {"brand": "Lince", "confidence": 0.45},
            {"confidence": 0.0},
        ],
        "debug": {"quality_score": 0.8, "roi_score": 0.7},
    }
    out = normalize_contract(raw)
    debug = out.get("debug") or {}
    assert "policy_action" in debug
    assert "policy_reasons" in debug
    assert "policy_user_message" in debug
    assert "policy_version" in debug
    assert debug.get("policy_version") == "v1"
