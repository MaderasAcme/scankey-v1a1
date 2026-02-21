#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
SERVICE="${SERVICE:-scankey-gateway}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/gateway"

echo "Deploying $SERVICE (region=$REGION) from: $PWD"
gcloud run deploy "$SERVICE" --region "$REGION" --source .
