#!/usr/bin/env bash
# Apagar stack local
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
docker compose -f docker-compose.local.yml down
