#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SEED="refs/catalog_seed_common.csv"
CAT="refs/catalog_refs.json"
LABELS="motor/labels.json"

test -f "$SEED" || { echo "ERROR: falta $SEED"; exit 1; }
test -f "$CAT"  || { echo "ERROR: falta $CAT (genera con build_catalog_refs.py)"; exit 1; }

python3 - <<'PY'
import json, sys, csv, re
from pathlib import Path

def norm_ref(x:str)->str:
    s=(x or "").strip().upper().replace(" ","")
    s=re.sub(r"[^A-Z0-9]+","",s)
    return s

seed = Path("refs/catalog_seed_common.csv")
refs=[]
with seed.open("r",encoding="utf-8") as f:
    r=csv.DictReader(f)
    for row in r:
        refs.append(norm_ref(row.get("ref","")))

dups=set([x for x in refs if x and refs.count(x)>1])
if dups:
    print("ERROR: duplicados en seed:", sorted(dups))
    sys.exit(2)

cat = json.loads(Path("refs/catalog_refs.json").read_text(encoding="utf-8"))
if not isinstance(cat, dict) or "refs" not in cat:
    print("ERROR: catalog_refs.json inválido (no tiene 'refs')")
    sys.exit(3)

crefs = cat.get("refs") or {}
missing=[r for r in refs if r and r not in crefs]
extra=[k for k in crefs.keys() if k not in refs]

print(f"OK: seed_count={len(refs)} catalog_count={len(crefs)}")
if missing:
    print("ERROR: faltan refs del seed en catalog:", missing)
    sys.exit(4)
if extra:
    print("WARN: refs en catalog que no están en seed (si mergeaste, puede ser normal):", sorted(extra)[:50])

print("OK: catalog estructura mínima válida")
PY

if test -f "$LABELS"; then
  echo
  echo "== compare contra motor/labels.json =="
  python3 - <<'PY'
import json
from pathlib import Path

labels = json.loads(Path("motor/labels.json").read_text(encoding="utf-8"))
cat = json.loads(Path("refs/catalog_refs.json").read_text(encoding="utf-8"))
crefs = set((cat.get("refs") or {}).keys())
labs = set([str(x).strip().upper() for x in (labels if isinstance(labels,list) else (labels.get("labels") or []))])

print("labels_count:", len(labs))
print("catalog_refs_count:", len(crefs))

# Qué hay en labels que NO está en catalog (esto te duele en UI)
miss = sorted(list(labs - crefs))
# Qué hay en catalog que NO está en labels (esto es normal si seed > modelo actual)
extra = sorted(list(crefs - labs))

print("labels_missing_in_catalog:", miss[:50], ("...+"+str(len(miss)-50) if len(miss)>50 else ""))
print("catalog_not_in_labels:", extra[:50], ("...+"+str(len(extra)-50) if len(extra)>50 else ""))
PY
else
  echo
  echo "WARN: no existe motor/labels.json (skip compare)"
fi

echo
echo "OK: catalog sanity passed"
