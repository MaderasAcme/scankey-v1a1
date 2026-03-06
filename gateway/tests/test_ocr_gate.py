"""
Tests OCR gating: high_confidence -> no OCR; low_confidence -> OCR corre
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.ocr_gate import (
    should_run_ocr,
    normalize_ocr_text,
    to_client_hint,
    to_workshop_result,
    apply_ocr_to_response,
)


def test_should_run_ocr_high_confidence_no():
    """Cuando high_confidence y brand/model presentes, OCR no corre."""
    top = {"brand": "Yale", "model": "24D", "confidence": 0.96}
    assert should_run_ocr(low_confidence=False, top_result=top, manual_correction_hint={"fields": ["marca", "modelo"]}) is False


def test_should_run_ocr_low_confidence_yes():
    """Cuando low_confidence, OCR corre."""
    top = {"brand": "Yale", "model": "24D"}
    assert should_run_ocr(low_confidence=True, top_result=top, manual_correction_hint=None) is True


def test_should_run_ocr_missing_brand_yes():
    """Cuando brand/model faltan, OCR corre."""
    top = {"brand": None, "model": None, "confidence": 0.5}
    assert should_run_ocr(low_confidence=False, top_result=top, manual_correction_hint=None) is True


def test_should_run_ocr_manual_correction_ocr_text_yes():
    """Cuando manual_correction_hint pide ocr_text, OCR corre."""
    top = {"brand": "Yale", "model": "24D"}
    assert should_run_ocr(low_confidence=False, top_result=top, manual_correction_hint={"fields": ["marca", "ocr_text"]}) is True


def test_normalize_ocr_text():
    """Upper, trim, whitelist."""
    assert normalize_ocr_text("  te8i  ") == "TE8I"
    assert normalize_ocr_text("te8i!!") == "TE8I"
    assert normalize_ocr_text("") == ""
    assert normalize_ocr_text(None) == ""


def test_to_client_hint():
    """Cliente: señal segura sin texto exacto."""
    assert "posible" in (to_client_hint("TE8I") or "")
    assert "TE8" in (to_client_hint("TE8I") or "")
    assert to_client_hint("") is None
    assert to_client_hint("x") is None


def test_to_workshop_result():
    """Taller: OCR detallado."""
    r = to_workshop_result("TE8I", 0.9)
    assert r["ocr_text"] == "TE8I"
    assert r["ocr_confidence"] == 0.9


def test_ocr_detail_only_with_workshop_token():
    """P0.1: sin token -> ocr_detail ausente; con token -> ocr_detail presente."""
    base = {"results": [{"brand": "X", "confidence": 0.5}], "low_confidence": True}
    # is_workshop=False -> ocr_hint posible, no ocr_detail
    out_client = apply_ocr_to_response(dict(base), "TE8I", is_workshop=False, ocr_ran=True)
    assert "ocr_detail" not in out_client
    assert "ocr_hint" in out_client
    # is_workshop=True -> ocr_detail presente
    out_workshop = apply_ocr_to_response(dict(base), "TE8I", is_workshop=True, ocr_ran=True)
    assert "ocr_detail" in out_workshop
    assert out_workshop["ocr_detail"]["ocr_text"] == "TE8I"
