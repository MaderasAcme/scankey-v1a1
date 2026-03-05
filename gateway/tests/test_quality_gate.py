"""
P0.2 Tests QualityGate PASIVO.
- Imagen oscura -> dark_pct alto -> reasons incluye poca_luz
- Imagen quemada -> bright_pct alto -> reason sobreexpuesta
- Imagen borrosa -> blur_score bajo -> reason borrosa
- Clamp quality_score 0..1
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from PIL import Image
import numpy as np

from common.quality_gate import (
    compute_blur_score,
    compute_exposure,
    compute_glare,
    compute_edge_density,
    aggregate_quality,
    compute_quality_for_side,
    compute_quality_ab,
    compute_roi_score_from_bbox,
)


def _solid_img(w: int, h: int, gray: int) -> Image.Image:
    arr = np.full((h, w), gray, dtype=np.uint8)
    return Image.fromarray(arr, mode="L").convert("RGB")


def test_dark_image_poca_luz():
    """Imagen oscura -> dark_pct alto -> reasons incluye poca_luz."""
    img = _solid_img(64, 64, 5)
    exp = compute_exposure(img)
    assert exp["dark_pct"] > 0.15
    signals = {"dark_pct": exp["dark_pct"], "bright_pct": 0, "glare_pct": 0, "blur": {"score": 0.5}, "edge_density": 0.5}
    _, reasons = aggregate_quality(signals)
    assert "poca_luz" in reasons


def test_bright_image_sobreexpuesta():
    """Imagen quemada -> bright_pct alto -> reason sobreexpuesta."""
    img = _solid_img(64, 64, 250)
    exp = compute_exposure(img)
    assert exp["bright_pct"] > 0.15
    signals = {"dark_pct": 0, "bright_pct": exp["bright_pct"], "glare_pct": exp["bright_pct"], "blur": {"score": 0.5}, "edge_density": 0.5}
    _, reasons = aggregate_quality(signals)
    assert "sobreexpuesta" in reasons


def test_blurred_image_borrosa():
    """Imagen borrosa (blur aplicado) -> blur_score bajo -> reason borrosa."""
    try:
        import cv2
    except ImportError:
        return
    img = _solid_img(64, 64, 128)
    blurred = cv2.GaussianBlur(np.asarray(img), (15, 15), 5)
    img_blur = Image.fromarray(blurred)
    blur_res = compute_blur_score(img_blur)
    assert blur_res["score"] < 0.30
    signals = {"dark_pct": 0, "bright_pct": 0, "glare_pct": 0, "blur": blur_res, "edge_density": 0.1}
    _, reasons = aggregate_quality(signals)
    assert "borrosa" in reasons


def test_quality_score_clamp():
    """quality_score siempre en [0, 1]."""
    for signals in [
        {"dark_pct": 0.9, "bright_pct": 0, "glare_pct": 0, "blur": {"score": 0}, "edge_density": 0},
        {"dark_pct": 0, "bright_pct": 0.9, "glare_pct": 0.9, "blur": {"score": 0}, "edge_density": 0},
        {"dark_pct": 0, "bright_pct": 0, "glare_pct": 0, "blur": {"score": 1}, "edge_density": 1},
    ]:
        score, _ = aggregate_quality(signals)
        assert 0 <= score <= 1


def test_compute_quality_for_side_returns_valid():
    """compute_quality_for_side retorna signals, score, reasons."""
    img = _solid_img(32, 32, 128)
    signals, score, reasons = compute_quality_for_side(img, "A")
    assert isinstance(signals, dict)
    assert "blur" in signals
    assert "exposure" in signals
    assert 0 <= score <= 1
    assert isinstance(reasons, list)


def test_compute_quality_ab_merged():
    """compute_quality_ab incluye A, B, merged con merged conservador."""
    img_a = _solid_img(32, 32, 128)
    img_b = _solid_img(32, 32, 200)
    out = compute_quality_ab(img_a, img_b)
    assert "A" in out and out["A"] is not None
    assert "B" in out and out["B"] is not None
    assert "merged" in out
    merged = out["merged"]
    assert "quality_score" in merged
    assert 0 <= merged["quality_score"] <= 1
    assert "reasons" in merged


def test_compute_quality_ab_solo_a():
    """Solo A -> merged usa score de A."""
    img_a = _solid_img(32, 32, 128)
    out = compute_quality_ab(img_a, None)
    assert out["A"] is not None
    assert out["B"] is None
    assert out["merged"]["quality_score"] == out["A"]["quality_score"]


def test_roi_score_from_bbox():
    """roi_score: bbox válido -> area; inválido -> 0.5."""
    assert compute_roi_score_from_bbox({"x": 0.2, "y": 0.2, "w": 0.5, "h": 0.5}) == 0.25
    assert compute_roi_score_from_bbox(None) == 0.5
    assert compute_roi_score_from_bbox({}) == 0.5
    assert compute_roi_score_from_bbox({"x": 0, "y": 0, "w": 1, "h": 1}) == 0.5
