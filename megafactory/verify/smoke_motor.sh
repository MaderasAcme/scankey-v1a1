#!/usr/bin/env bash
set -euo pipefail

REGION="europe-southwest1"
ENGINE_URL="$(gcloud run services describe scankey-motor --region "$REGION" --format='value(status.url)')"
SRC="$HOME/WORK/scankey/app/scankey-v1a1/backend/sample.jpg"

echo "[1] wait model_ready..."
for i in $(seq 1 30); do
  H="$(curl -fsS "$ENGINE_URL/health" || true)"
  echo "$i $H"
  echo "$H" | grep -q '"model_ready":true' && break
  sleep 2
done

echo "[2] inference..."
R="$(curl -fsS -m 120 -X POST "$ENGINE_URL/api/analyze-key?modo=client" \
  -F "front=@$SRC;type=image/jpeg;filename=front.jpg")"
echo "$R"
echo "$R" | grep -q '"ok":true'
echo "OK smoke passed"
