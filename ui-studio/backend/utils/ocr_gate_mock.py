"""
OCR gating mock: aplica dual output según low_confidence.
- high_confidence: OCR no corre
- low_confidence: OCR "corre" (mock ocr_hint)
"""
from typing import Dict, Any


def apply_ocr_gate_mock(response: Dict[str, Any], is_workshop: bool = False) -> Dict[str, Any]:
    """
    Mock OCR gating para backend de desarrollo.
    Solo añade ocr_hint/ocr_detail cuando low_confidence.
    """
    if response.get("high_confidence"):
        return response  # OCR no corre
    # low_confidence: OCR "corre"
    out = dict(response)
    mch = dict(out.get("manual_correction_hint") or {})
    fields = list(mch.get("fields") or ["marca", "modelo", "tipo"])
    if "ocr_text" not in fields:
        fields.append("ocr_text")
    mch["fields"] = fields
    out["manual_correction_hint"] = mch
    out["ocr_hint"] = "posible TE8*"  # señal segura para cliente
    if is_workshop:
        out["ocr_detail"] = {"ocr_text": "TE8I", "ocr_raw": "TE8I", "ocr_confidence": 0.85}
    results = list(out.get("results") or [])
    if results:
        r0 = dict(results[0])
        ex = (r0.get("explain_text") or "").strip()
        if "OCR" not in ex:
            r0["explain_text"] = (ex + " OCR aportó pista.").strip()
        results[0] = r0
        out["results"] = results
    return out
