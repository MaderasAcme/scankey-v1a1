#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
from datetime import datetime, timezone

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def norm_ref(x: str) -> str:
    if x is None:
        return ""
    s = str(x).strip().upper()
    s = s.replace(" ", "")
    # Normaliza TE-8I -> TE8I, MCM-4D -> MCM4D, etc.
    s = re.sub(r"[^A-Z0-9]+", "", s)
    return s

def split_tags(x: str):
    if not x:
        return []
    parts = [p.strip().upper() for p in str(x).split(",")]
    return [p for p in parts if p]

def load_seed_csv(path: str):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for i, row in enumerate(r, start=2):
            raw_ref = (row.get("ref") or "").strip()
            ref = norm_ref(raw_ref)
            if not ref:
                raise SystemExit(f"Seed inválido: ref vacía en línea {i}")
            rows.append({
                "ref": ref,
                "raw_ref": raw_ref,
                "family": (row.get("family") or "").strip().upper() or None,
                "type_guess": (row.get("type_guess") or "").strip().upper() or None,
                "brand_guess": (row.get("brand_guess") or "").strip().upper() or None,
                "model_guess": (row.get("model_guess") or "").strip().upper() or None,
                "priority": int((row.get("priority") or "0").strip() or 0),
                "tags": split_tags(row.get("tags") or ""),
                "notes": (row.get("notes") or "").strip() or None,
            })
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", required=True, help="CSV seed (refs/catalog_seed_common.csv)")
    ap.add_argument("--out", required=True, help="Salida JSON (refs/catalog_refs.json)")
    ap.add_argument("--merge", action="store_true", help="Si existe OUT, mergea y preserva campos existentes")
    args = ap.parse_args()

    seed_rows = load_seed_csv(args.seed)

    existing = {}
    if args.merge and os.path.exists(args.out):
        try:
            with open(args.out, "r", encoding="utf-8") as f:
                data = json.load(f)
            existing = (data.get("refs") or {}) if isinstance(data, dict) else {}
        except Exception:
            existing = {}

    refs = {}
    seen = set()
    for row in seed_rows:
        ref = row["ref"]
        if ref in seen:
            raise SystemExit(f"Seed duplicado tras normalización: {ref}")
        seen.add(ref)

        prev = existing.get(ref) if isinstance(existing, dict) else None
        prev = prev if isinstance(prev, dict) else {}

        # Construye entry mínima, pero preserva si ya hay datos enriquecidos
        entry = {
            "ref": ref,
            "family": row["family"] or prev.get("family"),
            "type": row["type_guess"] or prev.get("type") or "KEY",
            "brand": row["brand_guess"] or prev.get("brand") or None,
            "model": row["model_guess"] or prev.get("model") or ref,
            "priority": row["priority"] if row["priority"] else int(prev.get("priority") or 0),
            "tags": sorted(set((prev.get("tags") or []) + (row["tags"] or []))),
            "notes": row["notes"] or prev.get("notes"),
            # Campo libre para expansión futura (compat, variantes, patentada, etc.)
            "extra": prev.get("extra") if isinstance(prev.get("extra"), dict) else {},
        }

        refs[ref] = entry

    out = {
        "schema": "scankey.catalog_refs.v1",
        "generated_at": now_iso(),
        "seed": os.path.basename(args.seed),
        "refs_count": len(refs),
        "refs": refs,
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print(f"OK: wrote {args.out} (refs_count={len(refs)})")

if __name__ == "__main__":
    main()
