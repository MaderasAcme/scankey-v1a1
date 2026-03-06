"""
Tests unitarios de normalización bbox.
Valores fuera de rango, negativos, w/h<=0, conversión píxeles, etc.
"""
import sys
from pathlib import Path

# Permitir import desde gateway/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from roi_bbox import (
    normalize_bbox,
    ensure_valid_crop_bbox,
    apply_fallback_penalty,
    clamp_confidence,
    FULL_FRAME,
)


def test_full_frame_fallback_none():
    bbox, src = normalize_bbox(None)
    assert bbox == FULL_FRAME
    assert src == "fallback"


def test_full_frame_fallback_empty():
    bbox, src = normalize_bbox({})
    assert bbox == FULL_FRAME
    assert src == "fallback"


def test_full_frame_fallback_not_dict():
    bbox, src = normalize_bbox("invalid")
    assert bbox == FULL_FRAME
    assert src == "fallback"


def test_valid_bbox_normalized():
    bbox, src = normalize_bbox({"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.6})
    assert bbox["x"] == 0.1
    assert bbox["y"] == 0.2
    assert bbox["w"] == 0.5
    assert bbox["h"] == 0.6
    assert src == "model"


def test_bbox_clamp_negative():
    bbox, _ = normalize_bbox({"x": -1, "y": -0.5, "w": 0.5, "h": 0.5})
    assert bbox["x"] == 0
    assert bbox["y"] == 0
    assert bbox["w"] > 0
    assert bbox["h"] > 0


def test_bbox_clamp_exceeds_one():
    bbox, _ = normalize_bbox({"x": 0.8, "y": 0.8, "w": 0.5, "h": 0.5})
    assert 0 <= bbox["x"] <= 1
    assert 0 <= bbox["y"] <= 1
    assert 0 < bbox["w"] <= 0.2  # w clamped to fit
    assert 0 < bbox["h"] <= 0.2


def test_bbox_w_zero_fallback():
    bbox, src = normalize_bbox({"x": 0, "y": 0, "w": 0, "h": 0.5})
    assert bbox == FULL_FRAME
    assert src == "fallback"


def test_bbox_h_zero_fallback():
    bbox, src = normalize_bbox({"x": 0, "y": 0, "w": 0.5, "h": 0})
    assert bbox == FULL_FRAME
    assert src == "fallback"


def test_bbox_negative_w_fallback():
    bbox, src = normalize_bbox({"x": 0, "y": 0, "w": -0.1, "h": 0.5})
    assert bbox == FULL_FRAME
    assert src == "fallback"


def test_bbox_x1y1_x2y2_format():
    bbox, src = normalize_bbox({"x1": 0.1, "y1": 0.2, "x2": 0.6, "y2": 0.8})
    assert 0.09 <= bbox["x"] <= 0.11
    assert 0.19 <= bbox["y"] <= 0.21
    assert 0.49 <= bbox["w"] <= 0.51
    assert 0.59 <= bbox["h"] <= 0.61
    assert src == "model"


def test_bbox_pixel_to_normalized():
    bbox, _ = normalize_bbox({"x": 100, "y": 200, "w": 200, "h": 400}, img_w=1000, img_h=1000)
    assert abs(bbox["x"] - 0.1) < 0.001
    assert abs(bbox["y"] - 0.2) < 0.001
    assert abs(bbox["w"] - 0.2) < 0.001
    assert abs(bbox["h"] - 0.4) < 0.001


def test_ensure_valid_crop_bbox_no_bbox():
    bbox, src, fallback = ensure_valid_crop_bbox({})
    assert bbox == FULL_FRAME
    assert fallback is True
    assert src == "fallback"


def test_ensure_valid_crop_bbox_with_valid():
    bbox, src, fallback = ensure_valid_crop_bbox({"crop_bbox": {"x": 0, "y": 0, "w": 1, "h": 1}})
    assert bbox["w"] == 1
    assert bbox["h"] == 1
    assert fallback is False


def test_ensure_valid_crop_bbox_bbox_alias():
    bbox, _, fallback = ensure_valid_crop_bbox({"bbox": {"x": 0.2, "y": 0.2, "w": 0.5, "h": 0.5}})
    assert bbox["x"] == 0.2
    assert fallback is False


def test_apply_fallback_penalty_no_fallback():
    assert apply_fallback_penalty(0.8, False) == 0.8


def test_apply_fallback_penalty_with_fallback():
    v = apply_fallback_penalty(0.8, True)
    assert v < 0.8
    assert v >= 0
    assert abs(v - 0.78) < 0.01  # 0.02 penalty


def test_apply_fallback_penalty_border():
    v = apply_fallback_penalty(0.02, True)
    assert v == 0


def test_out_of_range_values_clamped():
    bbox, _ = normalize_bbox({"x": 10, "y": -10, "w": 2, "h": 0.3})
    assert 0 <= bbox["x"] <= 1
    assert 0 <= bbox["y"] <= 1
    assert 0 < bbox["w"] <= 1
    assert 0 < bbox["h"] <= 1


def test_clamp_confidence_p0():
    """P0.4: clamp_confidence nunca <0 ni >1."""
    assert clamp_confidence(0.5) == 0.5
    assert clamp_confidence(-0.1) == 0.0
    assert clamp_confidence(1.5) == 1.0
    assert clamp_confidence(0.0) == 0.0
    assert clamp_confidence(1.0) == 1.0
    assert clamp_confidence(None) == 0.0
    assert clamp_confidence("invalid") == 0.0


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
