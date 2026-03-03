#!/usr/bin/env bash
set -Eeuo pipefail

UI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$UI_ROOT/.." && pwd)"

TARGET="${SCN_SMOKE_URL:-http://localhost:8080}"

# API key opcional (para gateway)
API_KEY="${SCN_SMOKE_API_KEY:-}"
if [ -z "$API_KEY" ] && [ -f "$HOME/GATEWAY_API_KEY.txt" ]; then
  API_KEY="$(cat "$HOME/GATEWAY_API_KEY.txt" 2>/dev/null || true)"
fi

HDRS=()
if [ -n "${API_KEY:-}" ]; then
  HDRS=(-H "x-api-key: $API_KEY")
fi

echo "🚀 Iniciando Smoke Test contra: $TARGET"

health() {
  curl -fsS --max-time 10 "${HDRS[@]}" "$1/health" >/dev/null
}

# 1) prueba health donde toca
if ! health "$TARGET"; then
  echo "🔍 Test /health: ❌ FALLO (Respuesta vacía o servicio caído)"
  # 2) fallback automático a Cloud Run si no se fijó SCN_SMOKE_URL
  if [ -z "${SCN_SMOKE_URL:-}" ] && command -v gcloud >/dev/null 2>&1; then
    REGION="${SCN_SMOKE_REGION:-europe-southwest1}"
    SVC="${SCN_SMOKE_SVC:-scankey-gateway}"
    GW_URL="$(gcloud run services describe "$SVC" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
    if [ -n "$GW_URL" ]; then
      TARGET="$GW_URL"
      echo "↪️  Fallback a Cloud Run: $TARGET"
      if ! health "$TARGET"; then
        echo "❌ FALLO también en Cloud Run. Revisa gateway/motor."
        exit 1
      fi
    else
      echo "❌ No pude autodetectar Cloud Run. Si querías local, arranca backend en 0.0.0.0:8080."
      exit 1
    fi
  else
    echo "❌ Si querías local, arranca backend en 0.0.0.0:8080."
    exit 1
  fi
fi
echo "🔍 Test /health: ✅ OK"

# analyze con imágenes de test del repo
FRONT="${SCN_SMOKE_FRONT:-$REPO_ROOT/backend/test.png}"
BACK="${SCN_SMOKE_BACK:-$REPO_ROOT/backend/test.png}"

TMP_JSON="$(mktemp)"
curl -fsS --max-time 30 "${HDRS[@]}" \
  -F "front=@${FRONT}" \
  -F "back=@${BACK}" \
  -F "image_front=@${FRONT}" \
  -F "image_back=@${BACK}" \
  "$TARGET/api/analyze-key" > "$TMP_JSON"

echo "🧪 Test /api/analyze-key: ✅ OK"

# contrato sobre respuesta real
node "$UI_ROOT/scripts/contract_check.js" "$TMP_JSON" >/dev/null
echo "📜 Contract (live): ✅ OK"

# feedback mínimo
curl -fsS --max-time 20 "${HDRS[@]}" -H "Content-Type: application/json" \
  -d '{"input_id":"smoke-shell","timestamp":"'"$(date -Is)"'","choice":{"rank":1,"id_model_ref":"JIS2I"},"note":"smoke"}' \
  "$TARGET/api/feedback" >/dev/null
echo "🧾 Test /api/feedback: ✅ OK"

rm -f "$TMP_JSON"
echo "✅ Smoke Test COMPLETO OK contra: $TARGET"
