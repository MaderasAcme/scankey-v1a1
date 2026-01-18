#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="scankey-dc007"
REGION="europe-southwest1"
REPO="scankey-docker"
SERVICE="scankey-ocr"
SA="scankey-runner@scankey-dc007.iam.gserviceaccount.com"
IMG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/scankey-ocr:$(date +%Y%m%d-%H%M%S)"

# Log a fichero (para que no "se cierre" y pierdas el rastro)
exec > >(tee -a "/tmp/${SERVICE}_deploy.log") 2>&1

echo "== Config =="
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud config set account guille3056swatch@gmail.com >/dev/null
gcloud auth print-access-token >/dev/null && echo "AUTH OK"

echo "== APIs =="
gcloud services enable artifactregistry.googleapis.com run.googleapis.com >/dev/null

echo "== Repo =="
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
    --description="ScanKey Docker images"
fi
gcloud artifacts repositories describe "$REPO" --location="$REGION" --format="value(name)"

echo "== Docker auth =="
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "DOCKER AUTH OK"

echo "== Build local (sin Cloud Build) =="
command -v docker >/dev/null 2>&1 || { echo "❌ No hay docker en este Cloud Shell. Usa el plan B al final del log."; exit 2; }

docker build -t "$IMG" .
docker push "$IMG"

echo "== Verificación imagen en Artifact Registry =="
gcloud artifacts docker images list "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}" --include-tags --limit=20 | head -n 50

echo "== Deploy Cloud Run =="
gcloud run deploy "$SERVICE" \
  --image "$IMG" \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account "$SA"

echo "✅ OK. Imagen desplegada: $IMG"
echo "Log: /tmp/${SERVICE}_deploy.log"
