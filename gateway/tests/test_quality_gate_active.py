"""
P1.1 Tests QualityGate ACTIVE (soft-block).
- active ON + quality_score bajo -> 422 QUALITY_GATE
- override header -> no bloquea
- warning -> no bloquea, marca debug warning
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from quality_gate_active import check_quality_gate


def _base_payload(quality_score=0.5, roi_score=0.5):
    return {
        "input_id": "test",
        "results": [{"rank": 1, "confidence": 0.9}],
        "debug": {"quality_score": quality_score, "roi_score": roi_score},
    }


def test_block_quality_low():
    """quality_score < 0.35 -> 422 QUALITY_GATE."""
    payload = _base_payload(quality_score=0.30, roi_score=0.8)
    block, modified = check_quality_gate(payload, override=False)
    assert block is not None
    assert modified is None
    assert block["error"] == "QUALITY_GATE"
    assert block["message"] == "Calidad insuficiente"
    assert "quality_low" in block["reasons"]
    assert block["debug"]["quality_score"] == 0.30
    assert block["debug"]["roi_score"] == 0.8


def test_block_roi_low():
    """roi_score < 0.45 -> 422 QUALITY_GATE."""
    payload = _base_payload(quality_score=0.8, roi_score=0.40)
    block, modified = check_quality_gate(payload, override=False)
    assert block is not None
    assert modified is None
    assert "roi_low" in block["reasons"]


def test_block_both_low():
    """quality_score y roi_score bajos -> ambos en reasons."""
    payload = _base_payload(quality_score=0.20, roi_score=0.30)
    block, _ = check_quality_gate(payload, override=False)
    assert "quality_low" in block["reasons"]
    assert "roi_low" in block["reasons"]


def test_override_no_block():
    """X-Quality-Override=1 -> no bloquea, override_used=true."""
    payload = _base_payload(quality_score=0.20, roi_score=0.30)
    block, modified = check_quality_gate(payload, override=True)
    assert block is None
    assert modified is not None
    assert modified["debug"]["override_used"] is True


def test_warning_no_block():
    """quality_score < 0.55 (pero >= 0.35) -> warning, no bloquea."""
    payload = _base_payload(quality_score=0.50, roi_score=0.7)
    block, modified = check_quality_gate(payload, override=False)
    assert block is None
    assert modified is not None
    assert modified["debug"]["quality_warning"] is True
    assert "quality_low" in modified["debug"]["quality_reasons"]


def test_warning_roi():
    """roi_score < 0.60 (pero >= 0.45) -> warning, no bloquea."""
    payload = _base_payload(quality_score=0.8, roi_score=0.50)
    block, modified = check_quality_gate(payload, override=False)
    assert block is None
    assert modified is not None
    assert modified["debug"]["quality_warning"] is True
    assert "roi_low" in modified["debug"]["quality_reasons"]


def test_pass_no_warning():
    """quality_score y roi_score ok -> sin block ni warning."""
    payload = _base_payload(quality_score=0.7, roi_score=0.7)
    block, modified = check_quality_gate(payload, override=False)
    assert block is None
    assert modified is not None
    assert modified["debug"].get("quality_warning") is not True
    assert "override_used" not in modified["debug"]


def test_missing_scores_default_pass():
    """Sin quality_score/roi_score -> default 1.0, pasa."""
    payload = {"input_id": "x", "results": [], "debug": {}}
    block, modified = check_quality_gate(payload, override=False)
    assert block is None
    assert modified is not None
