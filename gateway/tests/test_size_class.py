"""
Tests size-class / similarity guardrails.
- Si crop_bbox full-frame (fallback), NO se aplica size-class.
- explain_text indica cuando se aplicó desempate por tamaño.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from normalize import normalize_contract


def _cand(brand: str, conf: float, bbox: dict) -> dict:
    return {
        "brand": brand,
        "confidence": conf,
        "model": brand + "-X",
        "crop_bbox": bbox,
        "explain_text": f"Candidato {brand}.",
    }


FULL_FRAME = {"x": 0, "y": 0, "w": 1, "h": 1}
# Bbox con ratio ~1.67 -> media (entre 1.35 y 2.0)
ROI_MEDIA = {"x": 0.1, "y": 0.15, "w": 0.3, "h": 0.5}
# Bbox con ratio ~2.5 -> larga
ROI_LARGA = {"x": 0.05, "y": 0.1, "w": 0.2, "h": 0.5}


def test_full_frame_no_size_class():
    """Si todos los crop_bbox son full-frame (fallback), size-class NO se aplica."""
    raw = {
        "results": [
            _cand("A", 0.82, FULL_FRAME),
            _cand("B", 0.81, FULL_FRAME),
            _cand("C", 0.80, FULL_FRAME),
        ],
    }
    out = normalize_contract(raw)
    # Orden por confidence: A, B, C
    assert out["results"][0]["brand"] == "A"
    explain = out["results"][0].get("explain_text") or ""
    assert "Desempate por tamaño" not in explain


def test_full_frame_no_size_class_single_reliable():
    """Si el primer item tiene full-frame, no hay ref ROI fiable -> no size-class."""
    raw = {
        "results": [
            _cand("A", 0.82, FULL_FRAME),  # primero, pero fallback
            _cand("B", 0.81, ROI_MEDIA),
            _cand("C", 0.80, ROI_MEDIA),
        ],
    }
    out = normalize_contract(raw)
    # Ref = primer con ROI fiable = B. Pero A va primero por confidence. No hay empate
    # (0.82 vs 0.81 diff=0.01 < 0.03, así que SÍ hay empate). Ref_class = media (de B).
    # A tiene full-frame -> size_class None -> no match. B y C tienen media.
    # sort: (conf, match). A=(0.82,0), B=(0.81,1), C=(0.80,1). Orden: A, B, C.
    # ¿Cambió? No, A sigue primero. applied = False.
    explain = out["results"][0].get("explain_text") or ""
    # El ref es B (primer con ROI fiable). A, B, C - confs 0.82, 0.81, 0.80. max=0.82.
    # close: 0.82-0.82=0, 0.82-0.81=0.01, 0.82-0.80=0.02. Todos <= 0.03. close_count=3.
    # Sort: A(0.82,0), B(0.81,1), C(0.80,1). Sorted: A, B, C. Same order. applied=False.
    assert "Desempate por tamaño" not in explain


def test_size_class_debug_only_no_reorder():
    """P0.2: size_class es debug-only; orden NO cambia; debug.size_class y debug.size_class_applied."""
    raw = {
        "results": [
            _cand("A", 0.82, ROI_MEDIA),
            _cand("B", 0.82, ROI_LARGA),
            _cand("C", 0.82, ROI_MEDIA),
        ],
    }
    out = normalize_contract(raw)
    # Orden se mantiene por confidence (A primero por ser el primero en la lista con mismo conf)
    assert out["results"][0]["brand"] == "A"
    assert out["results"][1]["brand"] == "B"
    assert out["results"][2]["brand"] == "C"
    debug = out.get("debug") or {}
    assert "size_class" in debug
    assert debug.get("size_class") == "media"  # ref del primer ROI fiable (A)
    assert debug.get("size_class_applied") is False
