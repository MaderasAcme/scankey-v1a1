
#!/bin/bash

# Lead Engineer - System Health Monitor
# Uso: bash scripts/uptime_check.sh [URL_MOTOR]
# O configurar MOTOR_BASE_URL env var.

TARGET_URL=${1:-$MOTOR_BASE_URL}
TARGET_URL=${TARGET_URL:-"http://localhost:8080"}

echo "🔍 Verificando salud del motor en: $TARGET_URL"

# Realizar curl con timeout
RESPONSE=$(curl -s --max-time 10 "$TARGET_URL/health")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$TARGET_URL/health")

# 1. Verificar Status Code
if [ "$HTTP_CODE" -ne 200 ]; then
    echo "❌ ERROR: El motor respondió con HTTP $HTTP_CODE"
    exit 1
fi

# 2. Verificar contenido JSON (status: ok)
if [[ $RESPONSE == *"\"status\":\"ok\""* ]]; then
    MODEL=$(echo $RESPONSE | grep -o '"model_version":"[^"]*"' | cut -d'"' -f4)
    UPTIME=$(echo $RESPONSE | grep -o '"uptime_s":[0-9]*' | cut -d':' -f2)
    echo "✅ MOTOR OPERATIVO"
    echo "   - Modelo: $MODEL"
    echo "   - Uptime: $UPTIME segundos"
    exit 0
else
    echo "❌ ERROR: Respuesta JSON inválida o estado no 'ok'."
    echo "   - Respuesta: $RESPONSE"
    exit 1
fi
