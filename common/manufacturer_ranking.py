"""
manufacturer_hint ranking:
- Si manufacturer_hint.found && confidence>=0.85: prioriza compatibles (boost <= +5%)
- Si no: ranking normal por confidence
"""
from typing import Dict, Any, List, Optional

BOOST_CAP = 0.05  # máx +5%
THRESHOLD = 0.85


def _get_conf(item: Dict[str, Any]) -> float:
    v = item.get("confidence") or item.get("conf") or item.get("score")
    try:
        return float(max(0.0, min(1.0, float(v))))
    except (TypeError, ValueError):
        return 0.0


def _matches_hint(item: Dict[str, Any], hint_name: Optional[str]) -> bool:
    if not hint_name:
        return False
    brand = item.get("brand") or item.get("model") or item.get("label")
    if not brand:
        return False
    return str(brand).strip().lower() == str(hint_name).strip().lower()


def apply_manufacturer_ranking(
    items: List[Dict[str, Any]],
    manufacturer_hint: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Ordena items aplicando boost a candidatos compatibles con manufacturer_hint.
    - Si hint.found && hint.confidence >= 0.85: boost <= +5% a los que coinciden en brand
    - Si no: orden por confidence desc
    """
    if not items:
        return items
    mh = manufacturer_hint or {}
    if not mh.get("found"):
        return sorted(items, key=lambda x: _get_conf(x), reverse=True)
    conf = float(mh.get("confidence") or 0)
    if conf < THRESHOLD:
        return sorted(items, key=lambda x: _get_conf(x), reverse=True)
    name = mh.get("name")

    def sort_key(item: Dict[str, Any]) -> float:
        c = _get_conf(item)
        if _matches_hint(item, name):
            boost = min(BOOST_CAP, 1.0 - c)
            return c + boost
        return c

    return sorted(items, key=sort_key, reverse=True)
