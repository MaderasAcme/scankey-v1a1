#!/usr/bin/env bash
set -euo pipefail

PROJECT="scankey-dc007"
REGION="europe-southwest1"
SVC="scankey-motor"
BUILD_SA="projects/${PROJECT}/serviceAccounts/scankey-build-sa@${PROJECT}.iam.gserviceaccount.com"
RUN_SA="scankey-runner@${PROJECT}.iam.gserviceaccount.com"

ENVVARS="MODEL_GCS_URI=gs://scankey-models-scankey-dc007-95b419/scankey/models/v1/modelo_llaves.onnx,\
MODEL_GCS_DATA_URI=gs://scankey-models-scankey-dc007-95b419/scankey/models/v1/modelo_llaves.onnx.data,\
LABELS_GCS_URI=gs://scankey-models-scankey-dc007-95b419/scankey/models/v1/labels.json,\
GUNICORN_TIMEOUT=900,GUNICORN_GRACEFUL_TIMEOUT=900,\
WEB_CONCURRENCY=1,GUNICORN_WORKERS=1,\
BOOTSTRAP_HTTP_TIMEOUT=900,BOOTSTRAP_MODEL_MIN_BYTES=100000,BOOTSTRAP_DATA_MIN_BYTES=1000000,BOOTSTRAP_LABELS_MIN_BYTES=2,\
DEPLOY_STAMP=fix$(date +%s)"

gcloud run deploy "$SVC" \
  --region "$REGION" \
  --source motor \
  --build-service-account "$BUILD_SA" \
  --service-account "$RUN_SA" \
  --min-instances 1 \
  --max-instances 1 \
  --update-env-vars "$ENVVARS"
