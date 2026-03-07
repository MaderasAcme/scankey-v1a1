"""
Multi-label Fase 5: tests de vocabularios canónicos, *_meta, provenance.
"""
import sys
from pathlib import Path

# gateway = parent of tests
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
# project root for common
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from common.multilabel_vocab import (
    normalize_orientation,
    normalize_brand_visible_zone,
    normalize_wear_level,
)
from common.multilabel_attrs import make_attr, normalize_attr
from normalize import normalize_contract


def test_orientation_normalization():
    """orientation: izq/izquierda/l -> left; der/derecha/r -> right."""
    assert normalize_orientation("left") == "left"
    assert normalize_orientation("izq") == "left"
    assert normalize_orientation("izquierda") == "left"
    assert normalize_orientation("l") == "left"
    assert normalize_orientation("right") == "right"
    assert normalize_orientation("der") == "right"
    assert normalize_orientation("derecha") == "right"
    assert normalize_orientation("r") == "right"
    assert normalize_orientation("front") == "front"
    assert normalize_orientation("back") == "back"
    assert normalize_orientation(None) is None
    assert normalize_orientation("") is None


def test_brand_visible_zone_normalization():
    """brand_visible_zone: head | blade | both | none."""
    assert normalize_brand_visible_zone("head") == "head"
    assert normalize_brand_visible_zone("blade") == "blade"
    assert normalize_brand_visible_zone("both") == "both"
    assert normalize_brand_visible_zone("none") == "none"
    assert normalize_brand_visible_zone("invalid") is None
    assert normalize_brand_visible_zone(None) is None


def test_wear_level_normalization():
    """wear_level: low | medium | high."""
    assert normalize_wear_level("low") == "low"
    assert normalize_wear_level("medium") == "medium"
    assert normalize_wear_level("high") == "high"
    assert normalize_wear_level("alto") == "high"
    assert normalize_wear_level("bajo") == "low"
    assert normalize_wear_level("mediano") == "medium"
    assert normalize_wear_level("invalid") is None


def test_make_attr():
    """make_attr crea { value, confidence?, source }."""
    m = make_attr("left", confidence=0.92, source="model")
    assert m == {"value": "left", "confidence": 0.92, "source": "model"}
    m2 = make_attr("high", source="model")
    assert m2 == {"value": "high", "source": "model"}
    m3 = make_attr(None)
    assert m3 == {}


def test_normalize_attr_creates_meta():
    """normalize_attr devuelve meta con value/confidence/source."""
    m = normalize_attr("orientation", "izq", confidence=0.9, source="model")
    assert m.get("value") == "left"
    assert m.get("confidence") == 0.9
    assert m.get("source") == "model"


def test_normalize_orientation_meta_in_contract():
    """orientation con valor produce orientation_meta en el contrato."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {
                "rank": 1,
                "model": "X",
                "confidence": 0.9,
                "orientation": "izq",
                "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1},
            },
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
    }
    out = normalize_contract(raw)
    r1 = out["results"][0]
    assert r1["orientation"] == "left"
    assert "orientation_meta" in r1
    assert r1["orientation_meta"]["value"] == "left"
    assert r1["orientation_meta"]["source"] == "model"


def test_fallback_sin_meta():
    """Sin atributos multi-label no hay *_meta (excepto si hay valor)."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {"rank": 1, "model": "X", "confidence": 0.9, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
    }
    out = normalize_contract(raw)
    r1 = out["results"][0]
    assert "orientation_meta" not in r1 or r1.get("orientation") is None
    assert r1["orientation"] is None


def test_compatibilidad_contrato_antiguo():
    """Contrato antiguo sin *_meta sigue siendo válido."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {"rank": 1, "model": "M", "confidence": 0.95, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
    }
    out = normalize_contract(raw)
    assert len(out["results"]) == 3
    assert out["results"][0]["brand"] is None
    assert out["results"][0]["model"] == "M"
    assert out["high_confidence"] is True


def test_single_class_no_meta_no_break():
    """Single-class: respuesta mínima no rompe y no exige *_meta."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {"rank": 1, "model": "X", "confidence": 0.9, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
    }
    out = normalize_contract(raw)
    assert out["debug"]["multi_label_enabled"] is False
    assert out["results"][0]["patentada"] is False
