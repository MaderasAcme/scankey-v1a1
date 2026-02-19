#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-mount}"          # mount | gcs
PORT="${PORT:-8080}"        # puerto dentro del contenedor
HOST_PORT="${HOST_PORT:-8081}"  # puerto en el host (Cloud Shell suele tener 8080 ocupado)
NAME="${NAME:-scankey-motor-smoke}"
IMAGE="${IMAGE:-scankey-motor-smoke}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

port_in_use() {
  local p="$1"
  # ss(8) permite filtrar por sport/dport; si hay listening sockets, el puerto está ocupado. 5
  ss -ltnH "sport = :$p" 2>/dev/null | grep -q .
}

echo "== precheck ports =="
if port_in_use "$HOST_PORT"; then
  echo "ERROR: HOST_PORT=$HOST_PORT ya está en uso. Prueba HOST_PORT=8082 (o 8083...)." >&2
  ss -ltnp "sport = :$HOST_PORT" || true
  exit 1
fi

echo "== build =="
docker build -t "$IMAGE" -f motor/Dockerfile .

docker rm -f "$NAME" >/dev/null 2>&1 || true

if [[ "$MODE" == "mount" ]]; then
  : "${MODEL_DIR:?set MODEL_DIR to folder with modelo_llaves.onnx, modelo_llaves.onnx.data, labels.json}"

  test -f "$MODEL_DIR/modelo_llaves.onnx" || { echo "Falta $MODEL_DIR/modelo_llaves.onnx" >&2; exit 1; }
  test -f "$MODEL_DIR/modelo_llaves.onnx.data" || { echo "Falta $MODEL_DIR/modelo_llaves.onnx.data" >&2; exit 1; }
  test -f "$MODEL_DIR/labels.json" || { echo "Falta $MODEL_DIR/labels.json" >&2; exit 1; }

  # Monta el directorio entero para evitar el error archivo<->directorio en binds
  docker run -d --name "$NAME" \
    -e PORT="$PORT" \
    -e MODEL_PATH="/mnt/models/modelo_llaves.onnx" \
    -e MODEL_DATA_DST="/mnt/models/modelo_llaves.onnx.data" \
    -e LABELS_DST="/mnt/models/labels.json" \
    -p "$HOST_PORT:$PORT" \
    -v "$MODEL_DIR:/mnt/models:ro" \
    "$IMAGE"

elif [[ "$MODE" == "gcs" ]]; then
  : "${MODEL_GCS_URI:?set MODEL_GCS_URI=gs://.../modelo_llaves.onnx}"
  : "${LABELS_GCS_URI:?set LABELS_GCS_URI=gs://.../labels.json}"
  docker run -d --name "$NAME" \
    -e PORT="$PORT" \
    -e MODEL_GCS_URI \
    -e MODEL_GCS_DATA_URI \
    -e DATA_GCS_URI \
    -e LABELS_GCS_URI \
    -p "$HOST_PORT:$PORT" \
    "$IMAGE"
else
  echo "Usage: $0 [mount|gcs]" >&2
  exit 2
fi

echo "== wait /health =="
URL="http://127.0.0.1:${HOST_PORT}/health"
for i in {1..40}; do
  if curl -4fsS "$URL" >/tmp/health.json 2>/dev/null; then
    cat /tmp/health.json; echo
    echo "OK"
    exit 0
  fi
  sleep 0.4
done

echo "FAIL: no /health" >&2
echo "--- Docker logs ---" >&2
docker logs --tail 200 "$NAME" >&2 || true
exit 1
