#!/usr/bin/env python3
"""
Valida la integración del C12 en catalog_match.

Ejecuta ejemplos tipo CIDL, JMA CIDL, AB-11, ABC-6, etc. y muestra:
- best_ref
- best_ref_canon
- catalog_hits
- rich_data (best_ref_rich_data)

Uso:
  python scripts/catalog/validate_c12_integration.py
"""
import sys
from pathlib import Path

# Asegurar que common está en el path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from common import catalog_match


EXAMPLES = [
    "AB-11",
    "AB11",
    "ABC-6",
    "ABC6",
    "333-1D",
    "3331D",
    "TE8I",
    "JMA AB-11",
    "llave AB-11 JMA",
    "CIDL",
    "JMA CIDL",
    "CI-DL",
]


def main():
    print("=== Validación integración C12 en catalog_match ===\n")
    for text in EXAMPLES:
        result = catalog_match.match_text(text, manufacturer_hint={"found": True, "name": "JMA", "confidence": 0.9})
        print(f"Input: {text!r}")
        print(f"  best_ref:       {result.get('best_ref')}")
        print(f"  best_ref_canon: {result.get('best_ref_canon')}")
        rich = result.get("best_ref_rich_data") or {}
        if rich:
            print(f"  rich_data:      brand={rich.get('brand')} family={rich.get('family')} type={rich.get('type')} model={rich.get('model')}")
        hits = result.get("catalog_hits") or []
        if hits:
            for h in hits[:3]:
                print(f"  hit: {h.get('raw')!r} -> canon={h.get('canon')} display={h.get('display')} kind={h.get('match_kind')}")
        else:
            print("  (sin hits)")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
