#!/usr/bin/env bash
set -Eeuo pipefail

# PATH defensivo (por si el entorno viene “capado”)
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

GCLOUD="$(command -v gcloud || true)"
CURL_BIN="$(command -v curl || true)"
GREP_BIN="$(command -v grep || true)"

if [[ -z "$GCLOUD" ]]; then echo "ERROR: falta gcloud"; exit 1; fi
if [[ -z "$CURL_BIN" ]]; then echo "ERROR: falta curl"; exit 1; fi
if [[ -z "$GREP_BIN" ]]; then echo "ERROR: falta grep"; exit 1; fi

REGION="${REGION:-europe-southwest1}"
GW_SVC="${GW_SVC:-scankey-gateway}"
SECRET_NAME="${SECRET_NAME:-scankey-gateway-api-key}"

GW_URL="$("$GCLOUD" run services describe "$GW_SVC" --region "$REGION" --format='value(status.url)')"
[[ -n "${GW_URL:-}" ]] || { echo "ERROR: no pude obtener GW_URL (service=$GW_SVC region=$REGION)"; exit 1; }

APIKEY="$("$GCLOUD" secrets versions access latest --secret "$SECRET_NAME")"

echo "GW_URL=$GW_URL"
echo "REGION=$REGION"
echo "SERVICE=$GW_SVC"
echo "SECRET=$SECRET_NAME"
echo "CURL=$CURL_BIN"
echo "GREP=$GREP_BIN"
echo

for PATH0 in "/motor/health" "/motor/health/"; do
  echo "===== PATH $PATH0 ====="
  for M in GET POST OPTIONS HEAD; do
    echo "== $M $PATH0 =="
    "$CURL_BIN" -sS -D - -o /dev/null -X "$M" \
      -H "x-api-key: $APIKEY" \
      "$GW_URL$PATH0" \
      | "$GREP_BIN" -Ei 'HTTP/|allow:|location:|content-type:|x-request-id:|x-policy-version:|x-schema-version:' || true
  done
  echo
done
