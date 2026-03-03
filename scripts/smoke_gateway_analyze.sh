#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
GW_URL="$(gcloud run services describe scankey-gateway --region "$REGION" --format='value(status.url)')"
APIKEY="$(gcloud secrets versions access latest --secret scankey-gateway-api-key)"

FRONT="${FRONT:-/tmp/front_1280.jpg}"
BACK="${BACK:-$HOME/WORK/scankey/app/scankey-v1a1/backend/test.png}"

test -f "$FRONT" || { echo "ERROR: FRONT no existe: $FRONT"; exit 1; }
test -f "$BACK" || { echo "ERROR: BACK no existe: $BACK"; exit 1; }

curl -sS --max-time 120 \
  -D /tmp/gw_h.txt \
  -o /tmp/gw_b.json \
  -w 'HTTP=%{http_code}\n' \
  -X POST -H "x-api-key: $APIKEY" \
  -F "front=@$FRONT" \
  -F "back=@$BACK" \
  "$GW_URL/api/analyze-key"

echo "== HEADERS =="; sed -n '1,25p' /tmp/gw_h.txt
echo; echo "== BODY =="; head -n 60 /tmp/gw_b.json
