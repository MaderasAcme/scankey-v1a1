#!/bin/bash
# QA anti-TS: Falla si encuentra archivos .ts/.tsx en el repo (excluyendo node_modules).
# Regla: NO TypeScript en ui-studio.

set -euo pipefail

UI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$UI_ROOT/.." && pwd)"

echo "🔍 Verificando ausencia de TypeScript (.ts/.tsx)..."

FOUND=$(git -C "$REPO_ROOT" ls-files | grep -E '\.ts$|\.tsx$' || true)

if [ -n "$FOUND" ]; then
  echo "❌ ERROR: Se encontraron archivos TypeScript:"
  echo "$FOUND"
  exit 1
fi

echo "✅ No hay archivos .ts/.tsx en el repositorio."
exit 0
