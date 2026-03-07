#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-europe-southwest1}"
SERVICE="${SERVICE:-scankey-gateway}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Deploying $SERVICE (region=$REGION) from: $PWD"
# Gateway requiere contexto repo root (common/). cloudbuild-gateway.yaml usa gateway/Dockerfile + contexto .
# Variables ENV necesarias en Cloud Run: WORKSHOP_LOGIN_EMAIL, WORKSHOP_LOGIN_PASSWORD, WORKSHOP_TOKEN
gcloud builds submit --config=cloudbuild-gateway.yaml .
