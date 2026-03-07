"""
BLOQUE 3.1 — Ejecución operativa del PolicyEngine.
- BLOCK → 422 con body estandarizado
- RUN_OCR → conectar OCR on-demand o marcar fallback controlado
- ALLOW_WITH_OVERRIDE → unificar con override del quality gate
"""
import os
import logging
from typing import Dict, Any, Optional, Tuple

import httpx

_log = logging.getLogger(__name__)

from common.policy_engine import ACTION_BLOCK, ACTION_RUN_OCR, ACTION_ALLOW_WITH_OVERRIDE

OCR_URL = os.getenv("OCR_URL", "").rstrip("/")
OCR_TIMEOUT = int(os.getenv("OCR_TIMEOUT", "5"))


def build_policy_block_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Construye body 422 para policy_action === BLOCK."""
    debug = payload.get("debug") or {}
    safe_debug = {
        "policy_action": "BLOCK",
        "policy_version": debug.get("policy_version", "v1"),
        "quality_score": debug.get("quality_score"),
        "roi_score": debug.get("roi_score"),
    }
    return {
        "ok": False,
        "error": "POLICY_BLOCK",
        "message": debug.get("policy_user_message") or "Política de bloqueo.",
        "reasons": debug.get("policy_reasons") or [],
        "debug": safe_debug,
    }


async def _call_ocr_from_gateway(image_bytes: bytes, is_workshop: bool = False) -> Optional[Dict[str, Any]]:
    """POST imagen a OCR_URL. Devuelve {text, ok} o None si falla."""
    if not OCR_URL or not image_bytes:
        return None
    try:
        files = {"front": ("front.jpg", image_bytes, "image/jpeg")}
        async with httpx.AsyncClient(timeout=OCR_TIMEOUT) as client:
            r = await client.post(f"{OCR_URL}/api/ocr", files=files)
        if r.status_code != 200:
            return None
        data = r.json()
        if not data.get("ok"):
            return None
        # Varios formatos: text directo, workshop_view.ocr_raw, client_view
        txt = data.get("text", "")
        if not txt and isinstance(data.get("workshop_view"), dict):
            txt = data["workshop_view"].get("ocr_raw", "")
        if not txt and isinstance(data.get("client_view"), dict):
            txt = data["client_view"].get("ocr_raw", data["client_view"].get("text", ""))
        return {"ok": True, "text": txt or "", "raw": data}
    except Exception as e:
        _log.warning("OCR policy fallback: %s", e)
        return None


def _apply_ocr_to_payload(payload: Dict[str, Any], ocr_text: Optional[str], is_workshop: bool) -> Dict[str, Any]:
    """Aplica resultado OCR al payload usando ocr_gate."""
    try:
        from common.ocr_gate import apply_ocr_to_response
        return apply_ocr_to_response(payload, ocr_text or "", is_workshop, ocr_ran=True)
    except Exception:
        return payload


async def try_run_ocr_and_merge(
    payload: Dict[str, Any],
    image_bytes: bytes,
    is_workshop: bool = False,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Si policy=RUN_OCR y el motor no aportó OCR, intenta ejecutarlo desde el gateway.
    Returns: (modified_payload, fallback_reason).
    fallback_reason: None si OK, "url_unavailable"|"ocr_error" si no pudo ejecutar.
    """
    debug = payload.get("debug") or {}
    if debug.get("policy_action") != ACTION_RUN_OCR:
        return payload, None

    # Si ya hay OCR en la respuesta (motor lo ejecutó), no hacer nada
    if payload.get("ocr_detail") or payload.get("ocr_hint"):
        return payload, None

    if not OCR_URL:
        out = dict(payload)
        out.setdefault("debug", {})
        out["debug"] = dict(out["debug"])
        out["debug"]["ocr_policy_attempted"] = True
        out["debug"]["ocr_policy_fallback"] = "url_unavailable"
        out["debug"]["ocr_policy_user_message"] = debug.get("policy_user_message", "")
        return out, "url_unavailable"

    result = await _call_ocr_from_gateway(image_bytes, is_workshop)
    if result is None:
        out = dict(payload)
        out.setdefault("debug", {})
        out["debug"] = dict(out["debug"])
        out["debug"]["ocr_policy_attempted"] = True
        out["debug"]["ocr_policy_fallback"] = "ocr_error"
        out["debug"]["ocr_policy_user_message"] = debug.get("policy_user_message", "")
        return out, "ocr_error"

    ocr_text = (result.get("text") or "").strip()
    merged = _apply_ocr_to_payload(payload, ocr_text if ocr_text else None, is_workshop)
    merged.setdefault("debug", {})
    merged["debug"] = dict(merged["debug"])
    merged["debug"]["ocr_policy_attempted"] = True
    merged["debug"]["ocr_policy_gateway_ran"] = True
    return merged, None


def apply_override_if_needed(payload: Dict[str, Any], override: bool) -> Dict[str, Any]:
    """
    Cuando policy=ALLOW_WITH_OVERRIDE y override header, marca override_used.
    Unifica con quality gate override.
    """
    debug = payload.get("debug") or {}
    if debug.get("policy_action") != ACTION_ALLOW_WITH_OVERRIDE:
        return payload
    if not override:
        return payload
    out = dict(payload)
    out.setdefault("debug", {})
    out["debug"] = dict(out["debug"])
    out["debug"]["override_used"] = True
    return out


async def execute_policy_actions(
    payload: Dict[str, Any],
    image_bytes: bytes,
    override: bool,
    is_workshop: bool = False,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Ejecuta acciones del policy engine sobre el payload.
    Returns: (block_response, modified_payload)
    - block_response: dict para 422 si BLOCK, None si no
    - modified_payload: payload modificado (OCR aplicado, override, etc) o None si block
    """
    debug = payload.get("debug") or {}
    action = debug.get("policy_action")

    if action == ACTION_BLOCK:
        return build_policy_block_response(payload), None

    current = dict(payload)

    # RUN_OCR: intentar OCR si no está en payload
    if action == ACTION_RUN_OCR:
        current, _ = await try_run_ocr_and_merge(current, image_bytes, is_workshop)

    # ALLOW_WITH_OVERRIDE: aplicar override si header
    current = apply_override_if_needed(current, override)

    return None, current
