#!/usr/bin/env bash
#
# Verifica que Cloudflare NO cachee HTML en scankeyapp.com.
# Requisitos: bash + curl
#
# FAIL si cf-cache-status=HIT en / o /index.html (HTML no debe cachearse).
# OK si BYPASS o MISS en esos recursos.
#
set -e

BASE="https://scankeyapp.com"
FAIL=0

fetch_headers() {
  curl -sSIL -o /dev/null -D - "$1" 2>/dev/null
}

extract_cf_status() {
  grep -i "cf-cache-status:" | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r'
}

extract_age() {
  grep -i "^age:" | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r'
}

extract_server() {
  grep -i "^server:" | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r'
}

check_url() {
  local url="$1"
  local label="$2"
  local headers
  headers=$(fetch_headers "$url")
  local status
  status=$(echo "$headers" | extract_cf_status)
  local age
  age=$(echo "$headers" | extract_age)
  local server
  server=$(echo "$headers" | extract_server)

  echo ""
  echo "=== $label ($url) ==="
  echo "  cf-cache-status: ${status:-<no presente>}"
  echo "  age: ${age:-<no presente>}"
  echo "  server: ${server:-<no presente>}"

  if [ -z "$status" ]; then
    echo "  -> SKIP (no Cloudflare o sin cf-cache-status)"
    return 0
  fi

  local upper
  upper=$(echo "$status" | tr '[:lower:]' '[:upper:]')
  if [ "$upper" = "HIT" ]; then
    echo "  -> FAIL (HTML/deploy-ping no debe estar en cache)"
    return 1
  fi
  if [ "$upper" = "BYPASS" ] || [ "$upper" = "MISS" ]; then
    echo "  -> OK"
    return 0
  fi
  # EXPIRED, UPDATING, etc. - aceptable
  echo "  -> OK (no HIT)"
  return 0
}

echo "Verificando cache Cloudflare en scankeyapp.com"
echo "Criterio: / y /index.html deben ser BYPASS o MISS (nunca HIT)"

check_url "${BASE}/" "GET /" || FAIL=1
check_url "${BASE}/index.html" "GET /index.html" || FAIL=1
check_url "${BASE}/deploy-ping.txt" "GET /deploy-ping.txt" || FAIL=1

echo ""
if [ $FAIL -eq 1 ]; then
  echo "RESULTADO: FAIL - HTML o deploy-ping esta cacheado (cf-cache-status=HIT)"
  echo "Configura Cache Rules: Bypass para /, /index.html y /deploy-ping.txt"
  echo "Ver docs/CLOUDFLARE_CACHE.md"
  exit 1
fi

echo "RESULTADO: OK - HTML y deploy-ping no estan en cache"
exit 0
