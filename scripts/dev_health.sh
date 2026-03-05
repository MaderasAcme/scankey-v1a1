#!/usr/bin/env bash
# Health check de gateway y motor
set -euo pipefail
echo "=== Gateway (8080) ==="
curl -sf http://localhost:8080/health | cat || echo "FAIL"
echo ""
echo "=== Motor (8081) ==="
curl -sf http://localhost:8081/health | cat || echo "FAIL"
