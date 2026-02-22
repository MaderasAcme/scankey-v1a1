#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${SCN_DATASET_ROOT:-$HOME/WORK/scankey/datasets/v2_res100_v1}"
LABELS_FILE="${SCN_LABELS_FILE:-$HOME/WORK/scankey_app/megafactory/labels/RES100_V1.labels.json}"

test -f "$LABELS_FILE" || { echo "ERROR: labels no existe: $LABELS_FILE"; exit 1; }
mkdir -p "$ROOT"

ROOT="$ROOT" LABELS_FILE="$LABELS_FILE" python3 - <<'PY'
import json, os
root=os.environ["ROOT"]
labels_file=os.environ["LABELS_FILE"]

labels=json.load(open(labels_file))
for lab in labels:
    os.makedirs(os.path.join(root, lab, "A"), exist_ok=True)
    os.makedirs(os.path.join(root, lab, "B"), exist_ok=True)

print("OK skeleton")
print("root =", root)
print("classes =", len(labels))
PY
