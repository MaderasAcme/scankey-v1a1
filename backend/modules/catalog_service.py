try:
    from common import catalog_match
except Exception:
from common import catalog_match
def catalog_hint_from_text(text: str):
    """
    Devuelve hint de referencia basado en catálogo.
    Salida estable y fácil de consumir por motor/ranking.
    """
    out = catalog_match.match_text(text or "")
    return {
        "best_ref": out.get("best_ref"),
        "best_ref_canon": out.get("best_ref_canon"),
        "unique_hits": [x.get("display") for x in (out.get("catalog_hits_unique") or [])],
        "hits_count": out.get("catalog_hits_count", 0),
    }
