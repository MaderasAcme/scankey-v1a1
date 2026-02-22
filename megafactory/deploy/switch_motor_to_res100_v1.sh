#!/usr/bin/env bash
set -Eeuo pipefail
REGION="europe-southwest1"
SVC="scankey-motor"

BASE="gs://scankey-models-scankey-dc007-95b419/scankey/models/v2_res100_v1"
MODEL_URI="$BASE/modelo_llaves.onnx"
DATA_URI="$BASE/modelo_llaves.onnx.data"
LABELS_URI="$BASE/labels.json"

echo "== PRECHECK: objects exist =="
gsutil ls -l "$MODEL_URI" "$DATA_URI" "$LABELS_URI" >/dev/null

echo "== DEPLOY (update env vars only) =="
DEPLOY_NONCE="$(date +%s)"
gcloud run services update "$SVC" --region "$REGION" \
  --update-env-vars \
MODEL_GCS_URI="$MODEL_URI",MODEL_GCS_DATA_URI="$DATA_URI",LABELS_GCS_URI="$LABELS_URI",DEPLOY_NONCE="$DEPLOY_NONCE"

echo "== VERIFY /health (IAM) =="
URL="$(gcloud run services describe "$SVC" --region "$REGION" --format='value(status.url)')"
TOKEN="$(gcloud auth print-identity-token)"
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL/health"
echo
