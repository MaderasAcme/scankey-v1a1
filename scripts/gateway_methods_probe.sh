#!/usr/bin/env bash
set -Eeuo pipefail

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: falta '$1' en PATH"; exit 1; }; }
need gcloud
need curl
need grep

REGION="${REGION:-europe-southwest1}"
GW_SVC="${GW_SVC:-scankey-gateway}"
SECRET_NAME="${SECRET_NAME:-scankey-gateway-api-key}"

GW_URL="$(gcloud run services describe "$GW_SVC" --region "$REGION" --format='value(status.url)')"
test -n "${GW_URL:-}" || { echo "ERROR: no pude obtener GW_URL (service=$GW_SVC region=$REGION)"; exit 1; }

# Lee el secret (NO se imprime)
APIKEY="$(gcloud secrets versions access latest --secret "$SECRET_NAME")"

echo "GW_URL=$GW_URL"
echo "REGION=$REGION"
echo "SERVICE=$GW_SVC"
echo "SECRET=$SECRET_NAME"
echo

for PATH in "/motor/health" "/motor/health/"; do
  echo "===== PATH $PATH ====="
  for M in GET POST OPTIONS HEAD; do
    echo "== $M $PATH =="
    curl -sS -D - -o /dev/null -X "$M" \
      -H "x-api-key: $APIKEY" \
      "$GW_URL$PATH" \
      | grep -Ei 'HTTP/|allow:|location:|content-type:|x-request-id:|x-policy-version:|x-schema-version:' || true
  done
  echo
done
