#!/usr/bin/env bash
set -euo pipefail
fuser -k 8080/tcp 2>/dev/null || true
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 1

export MODEL_PATH="/tmp/modelo_llaves.onnx"
export MODEL_GCS_URI="gs://scankey-models-scankey-dc007/modelo_llaves.onnx"
export MODEL_DATA_GCS_URI=""   # vacío si no hay .data

cd ~/scankey-motor
rm -f /tmp/motor.log /tmp/modelo_llaves.onnx /tmp/modelo_llaves.onnx.data
python3 -m uvicorn main:app --host 0.0.0.0 --port 8080 > /tmp/motor.log 2>&1 &
sleep 2
curl -sS http://127.0.0.1:8080/health | python3 -m json.tool
