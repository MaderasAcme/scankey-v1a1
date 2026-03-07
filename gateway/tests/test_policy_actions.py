"""
BLOQUE 3.1: Tests PolicyEngine operativo.
- BLOCK -> 422 body
- RUN_OCR -> OCR o fallback controlado
- ALLOW_WITH_OVERRIDE -> reutiliza override
"""
import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.policy_engine import ACTION_BLOCK, ACTION_RUN_OCR, ACTION_ALLOW_WITH_OVERRIDE
from policy_actions import (
    build_policy_block_response,
    try_run_ocr_and_merge,
    apply_override_if_needed,
    execute_policy_actions,
)


def test_build_policy_block_response():
    """BLOCK devuelve body 422 con formato correcto."""
    payload = {
        "debug": {
            "policy_user_message": "Calidad insuficiente. Repite la captura.",
            "policy_reasons": ["quality_block"],
            "policy_version": "v1",
            "quality_score": 0.30,
            "roi_score": 0.8,
        }
    }
    out = build_policy_block_response(payload)
    assert out["ok"] is False
    assert out["error"] == "POLICY_BLOCK"
    assert out["message"] == "Calidad insuficiente. Repite la captura."
    assert out["reasons"] == ["quality_block"]
    assert out["debug"]["policy_action"] == "BLOCK"
    assert out["debug"]["policy_version"] == "v1"
    assert out["debug"]["quality_score"] == 0.30


def test_run_ocr_fallback_when_no_url():
    """RUN_OCR sin OCR_URL marca fallback url_unavailable."""
    payload = {
        "results": [{"brand": None, "model": None, "confidence": 0.7}],
        "debug": {
            "policy_action": ACTION_RUN_OCR,
            "policy_user_message": "Se intentará obtener una pista adicional.",
        },
    }

    async def _run():
        with patch("policy_actions.OCR_URL", ""):
            return await try_run_ocr_and_merge(payload, b"fake", is_workshop=False)

    out, fb = asyncio.run(_run())
    assert fb == "url_unavailable"
    assert out["debug"]["ocr_policy_attempted"] is True
    assert out["debug"]["ocr_policy_fallback"] == "url_unavailable"


def test_run_ocr_skips_when_ocr_already_in_payload():
    """RUN_OCR no hace nada si ya hay ocr_detail."""
    payload = {
        "ocr_detail": {"ocr_text": "TE8I"},
        "debug": {"policy_action": ACTION_RUN_OCR},
    }
    out, fb = asyncio.run(try_run_ocr_and_merge(payload, b"fake", is_workshop=False))
    assert fb is None
    assert out == payload
    assert "ocr_policy_attempted" not in out.get("debug", {})


def test_apply_override_allow_with_override():
    """ALLOW_WITH_OVERRIDE + override header -> override_used=true."""
    payload = {
        "debug": {"policy_action": ACTION_ALLOW_WITH_OVERRIDE},
    }
    out = apply_override_if_needed(payload, override=True)
    assert out["debug"]["override_used"] is True


def test_apply_override_no_override_header():
    """ALLOW_WITH_OVERRIDE sin override header -> sin cambio."""
    payload = {
        "debug": {"policy_action": ACTION_ALLOW_WITH_OVERRIDE},
    }
    out = apply_override_if_needed(payload, override=False)
    assert "override_used" not in out.get("debug", {})


def test_apply_override_other_action_ignored():
    """Solo ALLOW_WITH_OVERRIDE aplica override."""
    payload = {"debug": {"policy_action": "WARN"}}
    out = apply_override_if_needed(payload, override=True)
    assert "override_used" not in out.get("debug", {})


def test_execute_policy_actions_block():
    """BLOCK -> block_response no None, modified None."""
    payload = {
        "debug": {
            "policy_action": ACTION_BLOCK,
            "policy_user_message": "Bloqueado.",
            "policy_reasons": ["quality_block"],
        }
    }
    block, modified = asyncio.run(execute_policy_actions(payload, b"", override=False, is_workshop=False))
    assert block is not None
    assert modified is None
    assert block["error"] == "POLICY_BLOCK"
    assert block["ok"] is False


def test_execute_policy_actions_allow_passthrough():
    """ALLOW/WARN pasan sin modificación relevante."""
    payload = {
        "debug": {"policy_action": "ALLOW", "policy_user_message": "OK"},
    }
    block, modified = asyncio.run(execute_policy_actions(payload, b"", override=False, is_workshop=False))
    assert block is None
    assert modified is not None
    assert modified["debug"]["policy_action"] == "ALLOW"
