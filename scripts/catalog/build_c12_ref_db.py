#!/usr/bin/env python3
"""
Convierte el bundle JMA C12 (refs/jma_c12_catalog_part_*.json) al formato
rich_ref_db esperado por common/catalog_match.py.

Formato salida: { canon_ref: { brand, family, type, model, expected_visible_text, possible_tags, ... } }
- canon_ref: forma normalizada (sin guiones, uppercase) para matching
- Keys se añaden a canon_set; valores enriquecen candidatos vía rich_data

Uso:
  python scripts/catalog/build_c12_ref_db.py
  # Genera common/resources/catalog/jma_c12_ref_db.json
"""
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
REFS_DIR = PROJECT_ROOT / "refs"
OUT_DIR = PROJECT_ROOT / "common" / "resources" / "catalog"
OUT_FILE = OUT_DIR / "jma_c12_ref_db.json"

C12_PART_GLOB = "jma_c12_catalog_part_*.json"

NON_ALNUM = re.compile(r"[^A-Z0-9]+")


def canon(s: str) -> str:
    """Normaliza como catalog_match.canon()."""
    s = (s or "").upper().strip().replace("/", "-")
    return NON_ALNUM.sub("", s)


def ref_to_rich_entry(r: dict) -> dict:
    """Extrae campos útiles para catalog_match del C12."""
    return {
        "brand": r.get("brand") or "JMA",
        "family": r.get("family"),
        "type": r.get("type"),
        "model": r.get("model") or r.get("id_model_ref"),
        "expected_visible_text": r.get("expected_visible_text"),
        "possible_tags": r.get("possible_tags"),
        "catalog_page": r.get("catalog_page"),
        "source": r.get("source"),
        "source_confidence": r.get("source_confidence"),
        "aliases": r.get("aliases") or [],
    }


def main():
    parts = sorted(REFS_DIR.glob(C12_PART_GLOB))
    if not parts:
        print("ERROR: No se encontraron archivos jma_c12_catalog_part_*.json en refs/")
        return 1

    ref_db = {}
    for p in parts:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"WARN: No se pudo cargar {p}: {e}")
            continue
        refs = data.get("refs") or []
        for r in refs:
            ref_str = r.get("id_model_ref") or r.get("model") or ""
            if not ref_str:
                continue
            c = canon(ref_str)
            if not c:
                continue
            entry = ref_to_rich_entry(r)
            # Evitar sobrescribir con datos menos completos (primer part gana si duplicado)
            if c not in ref_db or (entry.get("source_confidence") == "high" and ref_db[c].get("source_confidence") != "high"):
                ref_db[c] = entry

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(ref_db, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {OUT_FILE} ({len(ref_db)} referencias)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
