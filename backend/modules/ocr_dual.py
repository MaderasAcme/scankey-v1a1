from __future__ import annotations
import os, re
from typing import Optional, Dict, Any

WORKSHOP_TOKEN = os.environ.get("WORKSHOP_TOKEN", "")  # ponlo en Cloud Run/Cloud Shell cuando toque

def is_workshop_authorized(token: Optional[str]) -> bool:
    if not WORKSHOP_TOKEN:
        return False
    return bool(token) and token == WORKSHOP_TOKEN

def ocr_placeholder(img_bytes: bytes) -> Dict[str, Any]:
    """
    Placeholder “cerrado”:
    - client: solo pistas generales (sin texto exacto)
    - workshop: texto exacto (aquí todavía vacío; luego enchufamos OCR real + ROI)
    """
    # Por ahora sin OCR real -> devolvemos vacío pero con estructura ya lista.
    return {
        "client_view": {
            "hint_general": None,
            "confidence_bucket": "none",   # none|low|mid|high
            "reason": "ocr_not_enabled_yet"
        },
        "workshop_view": {
            "ocr_raw": None,
            "tokens": [],
            "confidence": 0.0,
            "roi": None
        }
    }
