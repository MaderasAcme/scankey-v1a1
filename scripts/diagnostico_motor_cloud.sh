#!/usr/bin/env bash
# Diagnóstico: Gateway → Motor Cloud
# Uso: ./scripts/diagnostico_motor_cloud.sh
# Requiere: gcloud autenticado, proyecto activo
set -euo pipefail

REGION="${REGION:-europe-southwest1}"
GW_SVC="${GW_SVC:-scankey-gateway}"
MOTOR_SVC="${MOTOR_SVC:-scankey-motor}"

echo "=== DIAGNÓSTICO GATEWAY → MOTOR CLOUD ==="
echo "Region: $REGION | Gateway: $GW_SVC | Motor: $MOTOR_SVC"
echo

# 1) Motor existe y URL
echo "--- [1] Motor: URL y existencia ---"
if ! MOTOR_URL=$(gcloud run services describe "$MOTOR_SVC" --region "$REGION" --format='value(status.url)' 2>/dev/null); then
  echo "❌ Motor '$MOTOR_SVC' no encontrado. Despliega con: ./motor/deploy_motor.sh"
  exit 1
fi
echo "Motor URL: $MOTOR_URL"

# 2) Motor /health (con token)
echo
echo "--- [2] Motor /health (con token) ---"
TOKEN=$(gcloud auth print-identity-token 2>/dev/null)
HEALTH_RESP=$(curl -sS -w "\n%{http_code}" --max-time 30 \
  -H "Authorization: Bearer $TOKEN" "$MOTOR_URL/health" 2>/dev/null || true)
HEALTH_BODY=$(echo "$HEALTH_RESP" | head -n -1)
HEALTH_CODE=$(echo "$HEALTH_RESP" | tail -1)
echo "HTTP $HEALTH_CODE"
if [ "$HEALTH_CODE" = "200" ]; then
  echo "$HEALTH_BODY" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_BODY"
  MODEL_READY=$(echo "$HEALTH_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model_ready', False))" 2>/dev/null || echo "?")
  echo "model_ready: $MODEL_READY"
  if [ "$MODEL_READY" != "True" ] && [ "$MODEL_READY" != "true" ]; then
    echo "⚠️  Motor arrancado pero modelo aún cargando. Espera 1–5 min y vuelve a probar."
  fi
else
  echo "❌ Motor no responde 200. Body: $HEALTH_BODY"
fi

# 3) Gateway MOTOR_URL
echo
echo "--- [3] Gateway: MOTOR_URL configurado ---"
GW_MOTOR_URL=$(gcloud run services describe "$GW_SVC" --region "$REGION" --format=json 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
envs = d.get('spec', {}).get('template', {}).get('spec', {}).get('containers', [{}])[0].get('env', [])
for e in envs:
    if e.get('name') == 'MOTOR_URL':
        print(e.get('value', ''))
        break
" 2>/dev/null || echo "")
if [ -z "$GW_MOTOR_URL" ]; then
  echo "❌ MOTOR_URL no configurado en gateway."
  echo "   Ejecuta:"
  echo "   gcloud run services update $GW_SVC --region $REGION --set-env-vars=\"MOTOR_URL=$MOTOR_URL\""
else
  echo "MOTOR_URL (gateway): $GW_MOTOR_URL"
  if [ "$GW_MOTOR_URL" != "$MOTOR_URL" ]; then
    echo "⚠️  La URL no coincide con la del motor actual. Puede causar 404/502."
  fi
fi

# 4) Gateway /motor/health (proxy)
echo
echo "--- [4] Gateway /motor/health (proxy al motor) ---"
GW_URL=$(gcloud run services describe "$GW_SVC" --region "$REGION" --format='value(status.url)' 2>/dev/null)
PROXY_RESP=$(curl -sS -w "\n%{http_code}" --max-time 25 "$GW_URL/motor/health" 2>/dev/null || true)
PROXY_BODY=$(echo "$PROXY_RESP" | head -n -1)
PROXY_CODE=$(echo "$PROXY_RESP" | tail -1)
echo "HTTP $PROXY_CODE"
if [ "$PROXY_CODE" = "200" ]; then
  echo "✅ Proxy gateway→motor OK"
  echo "$PROXY_BODY" | python3 -m json.tool 2>/dev/null || echo "$PROXY_BODY"
elif [ "$PROXY_CODE" = "500" ]; then
  echo "❌ 500: Revisa MOTOR_URL y permisos invoker (ver docs/DIAGNOSTICO_MOTOR_CLOUD.md)"
elif [ "$PROXY_CODE" = "504" ]; then
  echo "❌ 504: Timeout. Motor tarda más de TIMEOUT segundos. Aumenta TIMEOUT en gateway o espera model_ready."
else
  echo "Respuesta: $PROXY_BODY"
fi

# 5) Resumen
echo
echo "=== RESUMEN ==="
echo "Motor:     $MOTOR_URL (health=$HEALTH_CODE)"
echo "Gateway:   $GW_URL (motor proxy=$PROXY_CODE)"
echo "MOTOR_URL: ${GW_MOTOR_URL:-NO CONFIGURADO}"
echo
echo "Si hay fallos, ver docs/DIAGNOSTICO_MOTOR_CLOUD.md"
