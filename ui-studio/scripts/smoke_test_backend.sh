#!/usr/bin/env bash
set -Eeuo pipefail

UI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$UI_ROOT/.." && pwd)"

# RUN_SMOKE=1: forzar local (stack Docker levantado)
if [ -n "${RUN_SMOKE:-}" ]; then
  : "${SCN_SMOKE_URL:=http://localhost:8080}"
  if [ -z "${SCN_SMOKE_API_KEY:-}" ] && [ -f "$UI_ROOT/.env.local" ]; then
    _key=$(grep -E '^VITE_API_KEY=' "$UI_ROOT/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'") || true
    [ -n "$_key" ] && export SCN_SMOKE_API_KEY="$_key"
  fi
  : "${SCN_SMOKE_API_KEY:=local-dev-key}"
fi

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

# 1) prueba health donde toque
if ! health "$TARGET"; then
  # Si RUN_SMOKE no está definido y backend está caído -> SKIP (no romper qa:all)
  if [ -z "${RUN_SMOKE:-}" ]; then
    echo "⏭️  Smoke SKIP: backend apagado. Usa RUN_SMOKE=1 npm run qa:smoke con stack levantado."
    exit 0
  fi
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
    echo "❌ Si querías local, arranca backend con: npm run stack:up"
    exit 1
  fi
fi
echo "🔍 Test /health: ✅ OK"

# analyze con imágenes de test (fixtures o backend)
FIXTURE="$UI_ROOT/scripts/fixtures/test.png"
if [ -n "${RUN_SMOKE:-}" ] && [ -f "$FIXTURE" ]; then
  FRONT="${SCN_SMOKE_FRONT:-$FIXTURE}"
  BACK="${SCN_SMOKE_BACK:-$FIXTURE}"
else
  FRONT="${SCN_SMOKE_FRONT:-${REPO_ROOT}/backend/test.png}"
  BACK="${SCN_SMOKE_BACK:-${REPO_ROOT}/backend/test.png}"
  if [ ! -f "$FRONT" ] || [ ! -f "$BACK" ]; then
    [ -f "$FIXTURE" ] && FRONT="$FIXTURE" && BACK="$FIXTURE"
  fi
fi
[ ! -f "$FRONT" ] && { echo "❌ Imagen de test no encontrada: $FRONT"; exit 1; }

TMP_JSON="$(mktemp)"
curl -fsS --max-time 30 "${HDRS[@]}" \
  -F "front=@${FRONT}" \
  -F "back=@${BACK}" \
  -F "image_front=@${FRONT}" \
  -F "image_back=@${BACK}" \
  "$TARGET/api/analyze-key" > "$TMP_JSON"

echo "🧪 Test /api/analyze-key: ✅ OK"

# contrato sobre respuesta real (incluye crop_bbox válido en cada result)
node "$UI_ROOT/scripts/contract_check.js" "$TMP_JSON" >/dev/null
echo "📜 Contract (live): ✅ OK"

# smoke: siempre hay crop_bbox válido en cada result
node -e "
const d=JSON.parse(require('fs').readFileSync('$TMP_JSON','utf8'));
const r=d.results||[];
for(let i=0;i<3;i++){
  const b=r[i]?.crop_bbox;
  if(!b||b.w<=0||b.h<=0){console.error('Result '+(i+1)+': crop_bbox inválido');process.exit(1);}
}
" || { echo "❌ crop_bbox inválido en algún result."; exit 1; }
echo "📐 crop_bbox válido en results: ✅ OK"

# smoke: request_id y debug.model_version presentes
node -e "
const d=JSON.parse(require('fs').readFileSync('$TMP_JSON','utf8'));
if(!d.request_id){console.error('request_id faltante en respuesta');process.exit(1);}
const db=d.debug||{};
if(!db.model_version){console.error('debug.model_version faltante');process.exit(1);}
" || { echo "❌ request_id o debug.model_version faltantes."; exit 1; }
echo "🔗 request_id y debug.model_version: ✅ OK"

# feedback mínimo
curl -fsS --max-time 20 "${HDRS[@]}" -H "Content-Type: application/json" \
  -d '{"input_id":"smoke-shell","timestamp":"'"$(date -Is)"'","choice":{"rank":1,"id_model_ref":"JIS2I"},"note":"smoke"}' \
  "$TARGET/api/feedback" >/dev/null
echo "🧾 Test /api/feedback: ✅ OK"

rm -f "$TMP_JSON"
echo "✅ Smoke Test COMPLETO OK contra: $TARGET"
