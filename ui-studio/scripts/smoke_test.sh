#!/bin/bash

# Lead Engineer - Smoke Test Script
# Verifica el estado de salud de la API después de un despliegue.

API_URL=${1:-"http://localhost:8080"}
echo "🔍 Iniciando Smoke Test contra: $API_URL"

# 1. Verificar /health
echo "Testing /health..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
if [ "$HEALTH_STATUS" -ne 200 ]; then
    echo "❌ Fallo en /health (Status: $HEALTH_STATUS)"
    exit 1
fi

# 2. Verificar /api/analyze-key (Prueba de estructura)
# Nota: Esta prueba simula una petición vacía para ver si el router responde 422 o 400 en lugar de 404/500
echo "Testing /api/analyze-key structure..."
ANALYZE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/analyze-key")
if [ "$ANALYZE_STATUS" -eq 404 ] || [ "$ANALYZE_STATUS" -eq 500 ]; then
    echo "❌ Fallo en /api/analyze-key (Status: $ANALYZE_STATUS)"
    exit 1
fi

# 3. Verificar /api/feedback
echo "Testing /api/feedback..."
FEEDBACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"input_id":"test","selected_id":"test"}' "$API_URL/api/feedback")
if [ "$FEEDBACK_STATUS" -ne 200 ] && [ "$FEEDBACK_STATUS" -ne 202 ]; then
    echo "❌ Fallo en /api/feedback (Status: $FEEDBACK_STATUS)"
    exit 1
fi

echo "✅ Todos los servicios responden correctamente."
exit 0
