"""
OCR on-demand: llama a OCR_URL si el gate lo permite.
Usa urllib (stdlib) para no añadir dependencias.
"""
import os
import urllib.request
import urllib.error
import json
from typing import Optional, Dict, Any

OCR_URL = os.getenv("OCR_URL", "").rstrip("/")
TIMEOUT = int(os.getenv("OCR_TIMEOUT", "5"))


def _call_ocr(image_bytes: bytes) -> Optional[Dict[str, Any]]:
    """POST image to OCR_URL. Soporta multipart (front) o raw body según API."""
    if not OCR_URL or not image_bytes:
        return None
    try:
        boundary = "----ScanKeyOCR"
        sep = boundary.encode()
        body = b"--" + sep + b"\r\n"
        body += b'Content-Disposition: form-data; name="front"; filename="front.jpg"\r\n'
        body += b"Content-Type: image/jpeg\r\n\r\n"
        body += image_bytes + b"\r\n--" + sep + b"--\r\n"
        req = urllib.request.Request(
            f"{OCR_URL}/api/ocr",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            resp_body = r.read().decode("utf-8", errors="replace")
            data = json.loads(resp_body) if resp_body else None
            if not data:
                return None
            wv = data.get("workshop_view") or {}
            txt = wv.get("ocr_raw") or data.get("text", "")
            return {"ok": data.get("ok", True), "text": txt}
    except Exception:
        return None


def fetch_ocr_if_needed(
    image_bytes: bytes,
    low_confidence: bool,
    top_result: Optional[Dict[str, Any]],
    manual_correction_hint: Optional[Dict[str, Any]],
) -> Optional[str]:
    """
    Ejecuta OCR solo si el gate lo permite.
    Returns: normalized ocr text or None
    """
    from common.ocr_gate import should_run_ocr, normalize_ocr_text
    if not should_run_ocr(low_confidence, top_result, manual_correction_hint):
        return None
    if not OCR_URL:
        return None
    out = _call_ocr(image_bytes)
    if not out or not out.get("ok"):
        return None
    raw = out.get("text") or ""
    return normalize_ocr_text(raw) if raw else None
