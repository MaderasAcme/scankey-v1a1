#!/bin/bash
# QA anti-regresión Pages: verifica que Pages use actions nativas y no workflows legacy

set -e

# Encontrar workflows dir que contenga deploy-pages.yml (repo principal, no subproyectos)
WORKFLOWS_DIR=
DEPLOY_PAGES=
for d in . .. ../.. ../../..; do
  wd="$d/.github/workflows"
  if [ -f "$wd/deploy-pages.yml" ]; then
    WORKFLOWS_DIR="$(cd "$d" && pwd)/.github/workflows"
    DEPLOY_PAGES="$WORKFLOWS_DIR/deploy-pages.yml"
    break
  fi
done

if [ -z "$WORKFLOWS_DIR" ] || [ ! -f "$DEPLOY_PAGES" ]; then
  echo "❌ ERROR: No se encontró .github/workflows/deploy-pages.yml"
  exit 1
fi

echo "🔍 Verificando Pages source (workflows en $WORKFLOWS_DIR)..."

# 1. Fallar si hay workflows con JamesIves, peaceiris, actions-gh-pages o push a gh-pages
BAD_PATTERNS="JamesIves|peaceiris|actions-gh-pages"
if grep -rE "$BAD_PATTERNS" "$WORKFLOWS_DIR" 2>/dev/null; then
  echo "❌ ERROR: Se detectaron workflows con JamesIves/peaceiris/actions-gh-pages."
  echo "   Usa actions/upload-pages-artifact y actions/deploy-pages nativos."
  exit 1
fi

if grep -rE "gh-pages" "$WORKFLOWS_DIR" 2>/dev/null | grep -v "github-pages" | grep -v "deploy-pages" | grep -v "upload-pages"; then
  echo "❌ ERROR: Se detectó push o referencia a rama gh-pages."
  echo "   Pages debe usar GitHub Actions nativos, no rama gh-pages."
  exit 1
fi

# 2. Verificar que deploy-pages.yml contiene los artefactos correctos
if ! grep -q "upload-pages-artifact" "$DEPLOY_PAGES"; then
  echo "❌ ERROR: deploy-pages.yml debe contener upload-pages-artifact"
  exit 1
fi

if ! grep -q "actions/deploy-pages" "$DEPLOY_PAGES"; then
  echo "❌ ERROR: deploy-pages.yml debe contener actions/deploy-pages"
  exit 1
fi

echo "✅ Pages source OK: upload-pages-artifact + actions/deploy-pages, sin workflows legacy."
exit 0
