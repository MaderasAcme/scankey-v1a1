#!/usr/bin/env bash
set -Eeuo pipefail

# Cloud Build puede ir en otra región distinta a Cloud Run
CB_REGION="${CB_REGION:-global}"
REGION_AR="${REGION_AR:-europe-southwest1}"

PROJECT="$(gcloud config get-value project)"
STAGE_BUCKET="${STAGE_BUCKET:-gs://scankey-build-staging-${PROJECT}}"
CB_SA="${CB_SA:-scankey-runner@scankey-dc007.iam.gserviceaccount.com}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! gcloud storage buckets describe "$STAGE_BUCKET" >/dev/null 2>&1; then
  echo "Creating staging bucket: $STAGE_BUCKET"
  gcloud storage buckets create "$STAGE_BUCKET" --location="$REGION_AR" --uniform-bucket-level-access
fi

TAG="${TAG:-$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="${IMAGE:-${REGION_AR}-docker.pkg.dev/${PROJECT}/scankey-repo/scankey-motor:${TAG}}"

echo "== Building motor image =="
echo "IMAGE=$IMAGE"
echo "CB_REGION=$CB_REGION"
echo "STAGE_BUCKET=$STAGE_BUCKET"
echo "CB_SA=$CB_SA"
echo

gcloud --impersonate-service-account="$CB_SA" builds submit motor \
  --region "$CB_REGION" \
  --gcs-source-staging-dir "$STAGE_BUCKET/source" \
  --gcs-log-dir "$STAGE_BUCKET/logs" \
  --tag "$IMAGE"

echo
echo "OK IMAGE=$IMAGE"
