"""
Tests de manufacturer_hint ranking.
- Si manufacturer_hint.found && confidence>=0.85: boost <=+5% a compatibles, puede cambiar orden.
- Si no: ranking normal por confidence.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from normalize import normalize_contract


def _cand(brand: str, conf: float) -> dict:
    return {"brand": brand, "confidence": conf, "model": brand + "-X"}


def test_boost_cambia_orden_yale_sube():
    """Yale 0.82 vs Tesa 0.84 con hint Yale 0.90 → Yale sube por boost."""
    raw = {
        "results": [
            _cand("Tesa", 0.84),
            _cand("Yale", 0.82),
        ],
        "manufacturer_hint": {"found": True, "name": "Yale", "confidence": 0.90},
    }
    out = normalize_contract(raw)
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Yale", f"Yale debe ser #1 con hint, obtuvo {brands}"
    assert brands[1] == "Tesa"


def test_sin_boost_hint_found_false():
    """Sin boost si found=False → orden por confidence."""
    raw = {
        "results": [
            _cand("Tesa", 0.84),
            _cand("Yale", 0.82),
        ],
        "manufacturer_hint": {"found": False, "name": "Yale", "confidence": 0.90},
    }
    out = normalize_contract(raw)
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Tesa"
    assert brands[1] == "Yale"


def test_sin_boost_confidence_bajo():
    """Sin boost si hint.confidence < 0.85."""
    raw = {
        "results": [
            _cand("Tesa", 0.84),
            _cand("Yale", 0.82),
        ],
        "manufacturer_hint": {"found": True, "name": "Yale", "confidence": 0.80},
    }
    out = normalize_contract(raw)
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Tesa"
    assert brands[1] == "Yale"


def test_sin_boost_sin_hint():
    """Sin boost si no hay manufacturer_hint."""
    raw = {
        "results": [
            _cand("Tesa", 0.84),
            _cand("Yale", 0.82),
        ],
    }
    out = normalize_contract(raw)
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Tesa"
    assert brands[1] == "Yale"


def test_orden_no_cambia_diferencias_grandes():
    """Yale 0.95 vs Tesa 0.70 con hint Yale → Yale ya estaba primero."""
    raw = {
        "results": [
            _cand("Yale", 0.95),
            _cand("Tesa", 0.70),
        ],
        "manufacturer_hint": {"found": True, "name": "Yale", "confidence": 0.90},
    }
    out = normalize_contract(raw)
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Yale"
    assert brands[1] == "Tesa"


def test_boost_no_excede_5_pct():
    """Boost máximo +5%: 0.82 + 0.05 = 0.87, no supera a 0.90."""
    raw = {
        "results": [
            _cand("Otro", 0.90),
            _cand("Yale", 0.82),
        ],
        "manufacturer_hint": {"found": True, "name": "Yale", "confidence": 0.95},
    }
    out = normalize_contract(raw)
    # Yale+boost = 0.87 < 0.90 → Otro sigue primero
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Otro"
    assert brands[1] == "Yale"


def test_boost_cambia_orden_diferencia_minima():
    """Yale 0.83 vs Tesa 0.84: 0.83+0.05=0.88 > 0.84 → Yale sube."""
    raw = {
        "results": [
            _cand("Tesa", 0.84),
            _cand("Yale", 0.83),
        ],
        "manufacturer_hint": {"found": True, "name": "Yale", "confidence": 0.90},
    }
    out = normalize_contract(raw)
    brands = [r["brand"] for r in out["results"]]
    assert brands[0] == "Yale"
    assert brands[1] == "Tesa"
