"""
Multi-label Fase 6: tests de fusión por confianza (confidence-aware fusion).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.multilabel_evidence import (
    get_attr_meta,
    meta_confidence,
    meta_source,
    is_strong_evidence,
    is_weak_evidence,
    evidence_strength,
    should_trigger_strong_conflict,
)
from common.multilabel_consistency import compute_consistency
from normalize import normalize_contract


def test_evidence_helper_get_attr_meta():
    item = {"orientation_meta": {"value": "left", "confidence": 0.92, "source": "model"}}
    m = get_attr_meta(item, "orientation")
    assert m["value"] == "left"
    assert m["confidence"] == 0.92
    assert m["source"] == "model"


def test_evidence_strong_without_meta():
    assert is_strong_evidence("x", None) is True
    assert should_trigger_strong_conflict(None) is True


def test_evidence_weak_ocr_low_conf():
    meta = {"value": "yale", "confidence": 0.45, "source": "ocr"}
    assert is_strong_evidence("brand", meta) is False
    assert is_weak_evidence("brand", meta) is True
    assert should_trigger_strong_conflict(meta) is False


def test_evidence_strong_model_high_conf():
    meta = {"value": "left", "confidence": 0.92, "source": "model"}
    assert is_strong_evidence("orientation", meta) is True
    assert should_trigger_strong_conflict(meta) is True


def test_evidence_manual_strong():
    meta = {"value": True, "confidence": 1.0, "source": "manual"}
    assert is_strong_evidence("patentada", meta) is True


def test_brand_conflict_ocr_low_conf_no_strong_conflict():
    """brand_conflict con OCR confidence baja -> no conflicto fuerte."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "lince",
                "brand_head_text": "YALE",
                "brand_head_text_meta": {"value": "YALE", "confidence": 0.45, "source": "ocr"},
                "confidence": 0.9,
            },
        ],
    }
    out = compute_consistency(resp)
    assert "brand_conflict" not in out["consistency_conflicts"]
    assert any("brand_conflict" in n or "débil" in n for n in out.get("evidence_notes", []))


def test_brand_conflict_model_high_conf_strong_conflict():
    """brand_conflict con model/manual confidence alta -> conflicto fuerte."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "lince",
                "brand_head_text": "YALE",
                "brand_head_text_meta": {"value": "YALE", "confidence": 0.92, "source": "model"},
                "confidence": 0.9,
            },
        ],
    }
    out = compute_consistency(resp)
    assert "brand_conflict" in out["consistency_conflicts"]
    assert "brand_conflict" in out["consistency_strong_conflicts"]


def test_orientation_conflict_low_evidence_less_impact():
    """orientation conflict con evidence baja -> impacto menor."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "Yale",
                "orientation": "front",
                "orientation_meta": {"value": "front", "confidence": 0.40, "source": "heuristic"},
                "confidence": 0.9,
            },
            {
                "rank": 2,
                "brand": "Yale",
                "orientation": "back",
                "orientation_meta": {"value": "back", "confidence": 0.35, "source": "ocr"},
                "confidence": 0.7,
            },
        ],
    }
    out = compute_consistency(resp)
    assert "orientation_conflict" not in out["consistency_conflicts"]


def test_legal_security_strong_source_clear_impact():
    """legal/security con source fuerte -> impacto claro."""
    resp = {
        "results": [
            {
                "rank": 1,
                "brand": "X",
                "patentada": True,
                "patentada_meta": {"value": True, "confidence": 0.95, "source": "model"},
                "confidence": 0.9,
            },
        ],
    }
    out = compute_consistency(resp)
    assert "legal_restriction" in out["consistency_conflicts"]


def test_single_class_sin_meta_comportamiento_previo():
    """single-class sin meta -> comportamiento previo."""
    resp = {
        "results": [
            {"rank": 1, "brand": "Yale", "orientation": "front", "confidence": 0.9},
            {"rank": 2, "brand": "Yale", "orientation": "back", "confidence": 0.7},
        ],
    }
    out = compute_consistency(resp)
    assert "orientation_conflict" in out["consistency_conflicts"]
    assert out["consistency_score"] < 70


def test_single_class_minimal_neutral():
    """Single-class mínimo: score neutro, sin conflictos."""
    resp = {
        "results": [{"rank": 1, "brand": "Yale", "model": "24D", "confidence": 0.92}],
        "manufacturer_hint": {"found": False},
    }
    out = compute_consistency(resp)
    assert out["consistency_score"] == 70.0
    assert out["consistency_level"] == "neutral"
    assert out["consistency_conflicts"] == []


def test_normalize_phase6_debug_fields():
    """normalize_contract añade consistency_strong_conflicts, weak, evidence_notes."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {
                "rank": 1,
                "brand": "lince",
                "brand_head_text": "YALE",
                "brand_head_text_meta": {"value": "YALE", "confidence": 0.92, "source": "model"},
                "confidence": 0.9,
                "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1},
            },
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False},
    }
    out = normalize_contract(raw)
    dbg = out.get("debug") or {}
    assert "consistency_conflicts" in dbg
    assert "consistency_strong_conflicts" in dbg
    assert "consistency_weak_conflicts" in dbg


def test_risk_engine_weak_conflict_less_penalty():
    """Risk: weak conflict penaliza menos que strong."""
    from common.risk_engine import compute_risk

    resp = {"results": [{"brand": "X", "confidence": 0.90}], "low_confidence": False, "high_confidence": True}
    debug_strong = {"consistency_strong_conflicts": ["brand_conflict"], "consistency_weak_conflicts": []}
    debug_weak = {"consistency_strong_conflicts": [], "consistency_weak_conflicts": ["brand_conflict"]}
    out_strong = compute_risk(debug_strong, resp)
    out_weak = compute_risk(debug_weak, resp)
    assert out_strong["risk_score"] > out_weak["risk_score"]


def test_phases_3_4_5_not_broken():
    """No romper Fases 3/4/5: tests básicos siguen pasando."""
    resp = {
        "results": [
            {"rank": 1, "brand": "Yale", "orientation": "front", "confidence": 0.9},
        ],
    }
    out = compute_consistency(resp)
    assert "orientation_match" in out["consistency_supports"]
    assert out["consistency_score"] >= 70
    assert "consistency_level" in out
