"""
Multi-label Fase 4: tests de normalize_contract para multi_label_* en debug.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from normalize import normalize_contract


def test_normalize_preserves_multi_label_from_motor():
    """Si el motor envía multi_label_* en debug, se preservan."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {"rank": 1, "model": "X", "confidence": 0.9, "orientation": "front", "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
        "debug": {
            "model_version": "v2",
            "multi_label_enabled": True,
            "multi_label_fields_supported": ["orientation", "patentada", "tags"],
            "multi_label_fields_present": ["orientation"],
        },
    }
    out = normalize_contract(raw)
    dbg = out.get("debug") or {}
    assert dbg.get("multi_label_enabled") is True
    assert dbg.get("multi_label_fields_supported") == ["orientation", "patentada", "tags"]
    assert dbg.get("multi_label_fields_present") == ["orientation"]


def test_normalize_adds_defaults_when_multi_label_absent():
    """Respuesta antigua sin multi_label_* -> defaults para compatibilidad."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {"rank": 1, "model": "X", "confidence": 0.9, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
        "debug": {"model_version": "v2", "roi_source": "fallback"},
    }
    out = normalize_contract(raw)
    dbg = out.get("debug") or {}
    assert dbg.get("multi_label_enabled") is False
    assert dbg.get("multi_label_fields_supported") == []
    assert dbg.get("multi_label_fields_present") == []


def test_normalize_response_sin_atributos_present_vacio():
    """Resultado sin atributos multi-label -> present [] (ya cubierto por defaults)."""
    raw = {
        "input_id": "x",
        "timestamp": "2025-01-01T00:00:00Z",
        "results": [
            {"rank": 1, "model": "X", "confidence": 0.9, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 2, "model": None, "confidence": 0.1, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
            {"rank": 3, "model": None, "confidence": 0.05, "crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}},
        ],
        "manufacturer_hint": {"found": False, "name": None, "confidence": 0.0},
        "debug": {
            "model_version": "v2",
            "multi_label_enabled": False,
            "multi_label_fields_supported": ["orientation", "patentada"],
            "multi_label_fields_present": [],
        },
    }
    out = normalize_contract(raw)
    assert out["debug"]["multi_label_fields_present"] == []
