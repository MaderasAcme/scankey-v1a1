#!/usr/bin/env bash
# Levantar stack local (gateway + motor)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
docker compose -f docker-compose.local.yml up -d --build
