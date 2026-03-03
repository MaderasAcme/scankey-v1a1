#!/usr/bin/env bash
set -euo pipefail

REGION="europe-southwest1"
SERVICE="scankey-motor"
ROOT="$HOME/WORK/scankey/datasets/v2"
OUT="megafactory/reports/confusion_$(date +%F_%H%M).csv"
SAMPLES_PER_SIDE="${SAMPLES_PER_SIDE:-5}"

mkdir -p megafactory/reports

ENGINE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"

echo "[1] wait model_ready..."
for i in $(seq 1 30); do
  H="$(curl -fsS "$ENGINE_URL/health" || true)"
  echo "$i $H"
  echo "$H" | grep -q '"model_ready":true' && break
  sleep 2
done

echo "ref,side,file,pred_label,pred_score" > "$OUT"

pick_and_call () {
  local ref="$1"; local side="$2"; local dir="$3"
  mapfile -t files < <(find "$dir" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) \
    ! -name 'AUG_*' | shuf | head -n "$SAMPLES_PER_SIDE")

  for f in "${files[@]:-}"; do
    j="$(curl -fsS -m 120 -X POST "$ENGINE_URL/api/analyze-key?modo=client" \
        -F "front=@$f;type=image/jpeg;filename=front.jpg")" || j='{}'
    python3 - <<PY
import json,sys,os
ref=os.environ.get("REF","")
side=os.environ.get("SIDE","")
f=os.environ.get("FILE","")
try:
  d=json.loads(sys.argv[1])
except Exception:
  d={}
c=(d.get("candidates") or [])
top=c[0] if c else {}
lab=top.get("label")
sc=top.get("score")
print(f"{ref},{side},{os.path.basename(f)},{lab},{sc}")
PY "$j" >> "$OUT"
  done
}

export -f pick_and_call

for refdir in "$ROOT"/*; do
  ref="$(basename "$refdir")"
  [[ "$ref" == _* ]] && continue
  [[ ! -d "$refdir" ]] && continue
  for side in A B; do
    d="$refdir/$side"
    [[ -d "$d" ]] || continue
    export REF="$ref" SIDE="$side"
    # shellcheck disable=SC2016
    export FILE=""
    pick_and_call "$ref" "$side" "$d"
  done
done

echo "OK: $OUT"
