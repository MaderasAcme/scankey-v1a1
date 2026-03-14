#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
SVC="${SVC:-scankey-motor}"
IMAGE="${IMAGE:?set IMAGE=... (from build_motor_image.sh output)}"

NONCE="$(date +%s)"

echo "== Deploy motor =="
echo "SVC=$SVC REGION=$REGION"
echo "IMAGE=$IMAGE"
echo

gcloud run services update "$SVC" --region "$REGION" \
  --image "$IMAGE" \
  --update-env-vars DISABLE_STORE_SINGLE_LABEL=1,STORAGE_PROBABILITY=0,RESTART_TS=$NONCE,DEPLOY_NONCE=$NONCE

gcloud run services update-traffic "$SVC" --region "$REGION" --to-latest
echo "OK"
