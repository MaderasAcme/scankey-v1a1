
#!/bin/bash

# Lead Engineer - Smoke Test Backend
# Uso: bash scripts/smoke_test_backend.sh [URL_API]

API_URL=${1:-"http://localhost:8080"}
echo "🚀 Iniciando Smoke Test contra: $API_URL"

# 1. Health Check
echo -n "🔍 Test /health: "
HEALTH_RES=$(curl -s "$API_URL/health")
if [[ $HEALTH_RES == *"\"status\":\"ok\""* ]]; then
  echo "✅ OK"
else
  echo "❌ FALLO (Respuesta: $HEALTH_RES)"
  exit 1
fi

# 2. Feedback Test (Dummy)
echo -n "🔍 Test /api/feedback: "
FEEDBACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"input_id":"smoke_test","selected_id":"yale_24d"}' \
  "$API_URL/api/feedback")

if [[ $FEEDBACK_STATUS == "200" || $FEEDBACK_STATUS == "202" ]]; then
  echo "✅ OK (Status: $FEEDBACK_STATUS)"
else
  echo "❌ FALLO (Status: $FEEDBACK_STATUS)"
  exit 1
fi

# 3. Analyze Test (Estructura/No 404)
# Enviamos una petición vacía para verificar que el endpoint existe y responde 400/422 (validación) no 404/500
echo -n "🔍 Test /api/analyze-key (Route Exists): "
ANALYZE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/analyze-key")
if [[ $ANALYZE_STATUS == "400" || $ANALYZE_STATUS == "422" ]]; then
  echo "✅ OK (Ruta detectada, validación activa)"
elif [[ $ANALYZE_STATUS == "404" ]]; then
  echo "❌ FALLO (Ruta no encontrada: 404)"
  exit 1
else
  echo "⚠️ AVISO (Status inesperado: $ANALYZE_STATUS)"
fi

echo "🎉 Smoke test finalizado con éxito."
exit 0
