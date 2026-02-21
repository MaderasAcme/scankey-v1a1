#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
SVC="${SVC:-scankey-motor}"
SA="${SA:-scankey-runner@scankey-dc007.iam.gserviceaccount.com}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MOTOR_URL="$(gcloud run services describe "$SVC" --region "$REGION" --format='value(status.url)')"
TOKEN="$(gcloud auth print-identity-token \
  --impersonate-service-account="$SA" \
  --audiences="$MOTOR_URL")"  # docs 2

echo "MOTOR_URL=$MOTOR_URL"
echo "token_len=${#TOKEN}"
echo

echo "== /health =="
curl -fsS -H "Authorization: Bearer $TOKEN" "$MOTOR_URL/health"; echo
echo

FRONT="${FRONT:-/tmp/front_1280.jpg}"
BACK="${BACK:-$ROOT/backend/test.png}"
test -f "$FRONT" || { echo "Missing FRONT: $FRONT"; exit 1; }
test -f "$BACK"  || { echo "Missing BACK: $BACK"; exit 1; }

echo "== /api/analyze-key (expect should_store_sample=false with STORAGE_PROBABILITY=0) =="
curl -fsS --max-time 120 \
  -H "Authorization: Bearer $TOKEN" \
  -F "front=@$FRONT" \
  -F "back=@$BACK" \
  "$MOTOR_URL/api/analyze-key" \
| python3 - <<'PY'
import sys, json
d=json.load(sys.stdin)
print("storage_probability:", d.get("storage_probability"))
print("should_store_sample:", d.get("should_store_sample"))
store=d.get("store") or {}
print("store.stored:", store.get("stored"), "reason:", store.get("reason"))
PY
