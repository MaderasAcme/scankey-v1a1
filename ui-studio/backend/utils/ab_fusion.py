"""
Fusión A/B (réplica para mock): combina respuestas simuladas A y B.
"""
from typing import Dict, Any, List, Tuple

BOOST_CONSENSO = 0.03
PENALTY_CONFLICTO = 0.10


def _canon(s: str) -> str:
    import re
    return re.sub(r"[^A-Z0-9]+", "", (s or "").upper())


def _get_label(c: Dict[str, Any]) -> str:
    return str(c.get("brand") or c.get("model") or c.get("label") or "")


def _get_conf(c: Dict[str, Any]) -> float:
    return float(c.get("confidence") or c.get("score") or 0)


def fuse_ab_responses(
    results_a: List[Dict[str, Any]],
    results_b: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Fusiona dos listas de results (cada una top-3). Retorna exactamente 3."""
    if not results_b:
        return list(results_a[:3])
    a0 = results_a[0] if results_a else {}
    b0 = results_b[0] if results_b else {}
    top_a = _get_label(a0)
    top_b = _get_label(b0)
    consensus = top_a and top_b and _canon(top_a) == _canon(top_b)

    by_key: Dict[str, Dict[str, Any]] = {}
    for r in results_a[:3]:
        k = _canon(_get_label(r))
        if k:
            by_key[k] = dict(r)
            by_key[k]["_sa"] = _get_conf(r)
            by_key[k]["_sb"] = 0.0
    for r in results_b[:3]:
        k = _canon(_get_label(r))
        if k:
            sb = _get_conf(r)
            if k in by_key:
                by_key[k]["_sb"] = sb
            else:
                by_key[k] = dict(r)
                by_key[k]["_sa"] = 0.0
                by_key[k]["_sb"] = sb

    fused = []
    for k, c in by_key.items():
        sa, sb = c.pop("_sa", 0), c.pop("_sb", 0)
        base = (sa + sb) / 2 if (sa or sb) else max(sa, sb)
        if consensus and k == _canon(top_a):
            conf = min(1.0, base + BOOST_CONSENSO)
            c["explain_text"] = (c.get("explain_text") or "") + " Consenso A/B: coincidencia frontal y trasera."
        elif not consensus and k in (_canon(top_a), _canon(top_b)):
            conf = max(0.0, base - PENALTY_CONFLICTO)
            if "Discrepancia" not in (c.get("explain_text") or ""):
                c["explain_text"] = (c.get("explain_text") or "") + f" Discrepancia A/B: frontal {top_a}, trasera {top_b}."
        else:
            conf = base
        c["confidence"] = conf
        fused.append(c)
    fused.sort(key=lambda x: x.get("confidence", 0), reverse=True)
    while len(fused) < 3:
        fused.append({"rank": len(fused)+1, "type": "No identificado", "confidence": 0.0, "explain_text": "Sin más candidatos.", "compatibility_tags": []})
    for i, r in enumerate(fused[:3], 1):
        r["rank"] = i
    return fused[:3]
