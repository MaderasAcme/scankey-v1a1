#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
MOTOR_SVC="${MOTOR_SVC:-scankey-motor}"
MODELS_BUCKET="${MODELS_BUCKET:-gs://scankey-models-scankey-dc007-95b419}"
MODELS_PREFIX="${MODELS_PREFIX:-scankey/models}"
MODEL_DIR="${MODEL_DIR:-}"

DRY="${DRY:-0}"

if [[ -z "$MODEL_DIR" ]]; then
  echo "ERROR: set MODEL_DIR a carpeta con modelo_llaves.onnx + labels.json (+ .data opcional)" >&2
  exit 1
fi

test -f "$MODEL_DIR/modelo_llaves.onnx" || { echo "ERROR: falta $MODEL_DIR/modelo_llaves.onnx"; exit 1; }
test -f "$MODEL_DIR/labels.json" || { echo "ERROR: falta $MODEL_DIR/labels.json"; exit 1; }

TS="$(date -u +%Y%m%d_%H%M)"
V2="v2_${TS}"
DEST="${MODELS_BUCKET}/${MODELS_PREFIX}/${V2}"

echo "== Deploy v2 =="
echo "MODEL_DIR=$MODEL_DIR"
echo "DEST=$DEST"
echo "REGION=$REGION MOTOR_SVC=$MOTOR_SVC"
echo

if [[ "$DRY" == "1" ]]; then
  echo "(dry-run) gcloud storage cp ..."
else
  gcloud storage cp "$MODEL_DIR/modelo_llaves.onnx" "$DEST/modelo_llaves.onnx"
  if [[ -f "$MODEL_DIR/modelo_llaves.onnx.data" ]]; then
    gcloud storage cp "$MODEL_DIR/modelo_llaves.onnx.data" "$DEST/modelo_llaves.onnx.data"
  fi
  gcloud storage cp "$MODEL_DIR/labels.json" "$DEST/labels.json"
fi

MODEL_URI="$DEST/modelo_llaves.onnx"
LABELS_URI="$DEST/labels.json"

# data opcional
if [[ -f "$MODEL_DIR/modelo_llaves.onnx.data" ]]; then
  DATA_URI="$DEST/modelo_llaves.onnx.data"
  UPD="MODEL_GCS_URI=$MODEL_URI,MODEL_GCS_DATA_URI=$DATA_URI,LABELS_GCS_URI=$LABELS_URI,RESTART_TS=$(date +%s)"
  RM=""
else
  UPD="MODEL_GCS_URI=$MODEL_URI,LABELS_GCS_URI=$LABELS_URI,RESTART_TS=$(date +%s)"
  RM="MODEL_GCS_DATA_URI"
fi

echo "== Updating motor env vars =="
echo "UPDATE=$UPD"
if [[ -n "$RM" ]]; then echo "REMOVE=$RM"; fi
echo

if [[ "$DRY" == "1" ]]; then
  echo "(dry-run) gcloud run services update ..."
else
  if [[ -n "$RM" ]]; then
    gcloud run services update "$MOTOR_SVC" --region "$REGION" --update-env-vars "$UPD" --remove-env-vars "$RM"
  else
    gcloud run services update "$MOTOR_SVC" --region "$REGION" --update-env-vars "$UPD"
  fi
fi

echo
echo "== Verify /health labels_count =="
MOTOR_URL="$(gcloud run services describe "$MOTOR_SVC" --region "$REGION" --format='value(status.url)')"
TOKEN="$(gcloud auth print-identity-token)"
curl -fsS -H "Authorization: Bearer $TOKEN" "$MOTOR_URL/health"; echo
echo "OK"
