"""
Fusión A/B: combina señales de front (A) y back (B).
- Si top1(A) == top1(B): boost controlado a confidence
- Si difieren: penaliza y presenta ambos en top3
- explain_text refleja consenso o conflicto A/B
- Siempre 3 resultados
"""
from typing import Dict, Any, List, Optional, Tuple
import os

BOOST_CONSENSO = float(os.getenv("SCN_AB_FUSION_BOOST", "0.03"))
PENALTY_CONFLICTO = float(os.getenv("SCN_AB_FUSION_PENALTY", "0.10"))


def _clamp_confidence(c: float) -> float:
    """P0.4: Asegura confidence en [0, 1]."""
    try:
        return float(max(0.0, min(1.0, float(c))))
    except (TypeError, ValueError):
        return 0.0


def _canon(s: Optional[str]) -> str:
    import re
    return re.sub(r"[^A-Z0-9]+", "", (s or "").upper())


def _get_score(c: Dict[str, Any]) -> float:
    return float(c.get("score") or c.get("confidence") or 0)


def _get_label(c: Dict[str, Any]) -> Optional[str]:
    return c.get("label") or c.get("model") or c.get("brand")


def fuse_ab_candidates(
    cands_a: List[Dict[str, Any]],
    cands_b: List[Dict[str, Any]],
    catalog_enrich_a: Optional[List[Dict[str, Any]]] = None,
    catalog_enrich_b: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], str, Dict[str, Any]]:
    """
    Combina top-K de A y B.
    Returns: (fused_candidates, explain_suffix, manufacturer_hint_merged)
    """
    enrich_a = catalog_enrich_a or cands_a
    enrich_b = catalog_enrich_b or cands_b

    # Sin B: retornar A tal cual
    if not enrich_b or not cands_b:
        out = list(enrich_a[:3])
        while len(out) < 3:
            out.append({"label": None, "model": "No identificado", "score": 0.0, "confidence": 0.0, "explain_text": "Sin más candidatos."})
        return out, "", {}

    top1_a = _get_label(enrich_a[0]) if enrich_a else None
    top1_b = _get_label(enrich_b[0]) if enrich_b else None
    mh_merged: Dict[str, Any] = {}

    # Merge por modelo (label canon)
    by_label: Dict[str, Dict[str, Any]] = {}
    for c in enrich_a[:3]:
        lab = _get_label(c)
        if lab:
            key = _canon(lab)
            by_label[key] = dict(c)
            by_label[key]["_score_a"] = _get_score(c)
            by_label[key]["_score_b"] = 0.0
    for c in enrich_b[:3]:
        lab = _get_label(c)
        if lab:
            key = _canon(lab)
            sb = _get_score(c)
            if key in by_label:
                by_label[key]["_score_b"] = sb
                for k in ("explain_text", "brand", "model", "type", "id_model_ref"):
                    if c.get(k) and not by_label[key].get(k):
                        by_label[key][k] = c[k]
            else:
                by_label[key] = dict(c)
                by_label[key]["_score_a"] = 0.0
                by_label[key]["_score_b"] = sb

    consensus = top1_a and top1_b and _canon(top1_a) == _canon(top1_b)
    explain_suffix = ""

    fused: List[Dict[str, Any]] = []
    for key, c in list(by_label.items()):
        sa = c.pop("_score_a", 0)
        sb = c.pop("_score_b", 0)
        base = (sa + sb) / 2 if (sa > 0 or sb > 0) else max(sa, sb)
        if consensus and key == _canon(top1_a or ""):
            conf = _clamp_confidence(base + BOOST_CONSENSO)
            explain_suffix = " Consenso A/B: coincidencia frontal y trasera."
        elif not consensus and (key == _canon(top1_a or "") or key == _canon(top1_b or "")):
            conf = _clamp_confidence(base - PENALTY_CONFLICTO)
            if not explain_suffix:
                explain_suffix = f" Discrepancia A/B: frontal {top1_a or '?'}, trasera {top1_b or '?'}."
        else:
            conf = _clamp_confidence(base)
        c["score"] = conf
        c["confidence"] = conf
        fused.append(c)

    fused.sort(key=lambda x: _get_score(x), reverse=True)

    # Conflicto: asegurar top1_a y top1_b en top3
    if not consensus and top1_a and top1_b:
        ca, cb = _canon(top1_a), _canon(top1_b)
        in_top = {_canon(_get_label(x)) for x in fused[:3]}
        for want in (cb, ca):
            if want not in in_top:
                for c in fused:
                    if _canon(_get_label(c)) == want and c not in fused[:3]:
                        fused.append(c)
                        fused.sort(key=lambda x: _get_score(x), reverse=True)
                        fused = fused[:3]
                        break

    while len(fused) < 3:
        fused.append({"label": None, "model": "No identificado", "score": 0.0, "confidence": 0.0, "explain_text": "Sin más candidatos."})

    if fused and explain_suffix:
        ex = (fused[0].get("explain_text") or "").strip()
        if explain_suffix.strip() not in ex:
            fused[0]["explain_text"] = (ex + explain_suffix).strip()

    return fused[:3], explain_suffix, mh_merged
