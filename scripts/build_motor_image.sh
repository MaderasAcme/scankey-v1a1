#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
PROJECT="$(gcloud config get-value project)"
STAGE_BUCKET="${STAGE_BUCKET:-gs://scankey-build-staging-${PROJECT}}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 1) staging bucket (evita NOT_FOUND al subir el tarball)
if ! gcloud storage buckets describe "$STAGE_BUCKET" >/dev/null 2>&1; then
  echo "Creating staging bucket: $STAGE_BUCKET (region=$REGION)"
  gcloud storage buckets create "$STAGE_BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access
fi

# 2) image tag
TAG="${TAG:-$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT}/scankey-repo/scankey-motor:${TAG}}"

echo "== Building motor image =="
echo "IMAGE=$IMAGE"
echo "REGION=$REGION"
echo "STAGE_BUCKET=$STAGE_BUCKET"
echo

# 3) submit build (usa Dockerfile en motor/)
# Cloud Build docs: gcloud builds submit --tag ... 1
gcloud builds submit motor \
  --region "$REGION" \
  --gcs-source-staging-dir "$STAGE_BUCKET/source" \
  --gcs-log-dir "$STAGE_BUCKET/logs" \
  --tag "$IMAGE"

echo
echo "OK IMAGE=$IMAGE"
