"""
OCR gated + dual output:
- Gating: solo ejecutar OCR si low_confidence O brand/model faltan O manual_correction_hint lo pide
- Normalización: upper, trim, whitelist básica
- Dual output: cliente (señales seguras), taller (OCR detallado)
"""
import re
from typing import Dict, Any, Optional, List

# Whitelist: alfanumérico + guión (códigos tipo TE8I, JMA-24D)
OCR_WHITELIST = re.compile(r"[^A-Z0-9\-/]")
MAX_OCR_LEN = 32


def should_run_ocr(
    low_confidence: bool,
    top_result: Optional[Dict[str, Any]],
    manual_correction_hint: Optional[Dict[str, Any]],
) -> bool:
    """
    Solo ejecutar OCR si:
    - low_confidence==True, O
    - brand/model faltan en top1, O
    - manual_correction_hint.fields incluye "ocr_text"
    """
    if low_confidence:
        return True
    if top_result:
        brand = top_result.get("brand") or top_result.get("model") or top_result.get("label")
        if not brand or not str(brand).strip():
            return True
    if manual_correction_hint:
        fields = manual_correction_hint.get("fields") or []
        if isinstance(fields, list) and "ocr_text" in fields:
            return True
    return False


def normalize_ocr_text(raw: Optional[str]) -> str:
    """Upper, trim, whitelist A-Z0-9-/ ."""
    if not raw or not isinstance(raw, str):
        return ""
    s = raw.upper().strip()
    s = OCR_WHITELIST.sub("", s)
    return s[:MAX_OCR_LEN]


def to_client_hint(ocr_text: str) -> Optional[str]:
    """
    Cliente: no devolver texto OCR completo.
    Solo señales seguras: "posible TE8*" sin string exacto si aplica.
    """
    norm = normalize_ocr_text(ocr_text)
    if not norm or len(norm) < 2:
        return None
    # Patrón tipo TE8I -> "posible TE8*"
    m = re.match(r"^([A-Z]{1,4}\d?)", norm)
    if m:
        prefix = m.group(1)
        return f"posible {prefix}*"
    return "posible código detectado"


def to_workshop_result(ocr_text: str, avg_conf: float = 0.0) -> Dict[str, Any]:
    """Taller/autorizado: OCR detallado."""
    norm = normalize_ocr_text(ocr_text)
    return {
        "ocr_text": norm if norm else None,
        "ocr_raw": ocr_text[:MAX_OCR_LEN] if ocr_text else None,
        "ocr_confidence": avg_conf,
    }


def apply_ocr_to_response(
    response: Dict[str, Any],
    ocr_text: Optional[str],
    is_workshop: bool,
    ocr_ran: bool,
) -> Dict[str, Any]:
    """
    Actualiza response con dual output OCR.
    - explain_text: añade mención si OCR aportó
    - manual_correction_hint.fields: añade ocr_text si OCR corrió y low_confidence
    """
    out = dict(response)
    results = list(out.get("results") or out.get("candidates") or [])
    mch = dict(out.get("manual_correction_hint") or {})
    fields = list(mch.get("fields") or ["marca", "modelo", "tipo"])

    if ocr_ran and ocr_text:
        norm = normalize_ocr_text(ocr_text)
        low_conf = out.get("low_confidence", False)

        if is_workshop:
            out["ocr_detail"] = to_workshop_result(ocr_text)
        else:
            hint = to_client_hint(ocr_text)
            if hint:
                out["ocr_hint"] = hint

        if low_conf and "ocr_text" not in fields:
            fields.append("ocr_text")
        if norm and results:
            ex = (results[0].get("explain_text") or "").strip()
            if "OCR" not in ex and "ocr" not in ex.lower():
                results[0] = dict(results[0])
                results[0]["explain_text"] = (ex + " OCR aportó pista.").strip()
    elif ocr_ran and not ocr_text:
        if results:
            results[0] = dict(results[0])
            ex = (results[0].get("explain_text") or "").strip()
            if "OCR" not in ex:
                results[0]["explain_text"] = (ex + " OCR sin texto legible.").strip()

    mch["fields"] = fields
    out["manual_correction_hint"] = mch
    if "results" in out:
        out["results"] = results
    if "candidates" in out:
        out["candidates"] = results
    return out
