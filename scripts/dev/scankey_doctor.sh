#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

REPORT="$HOME/WORK/SCN_DOCTOR_REPORT_$(date +%Y%m%d_%H%M%S).txt"
{
  echo "ScanKey Doctor Report - $(date -Is)"
  echo "ROOT=$ROOT"
  echo
  echo "== GIT STATUS =="
  git status -sb || true
  echo
  echo "== CHECK: JS syntax (App.js) =="
  if node --check App.js >/dev/null 2>&1; then
    echo "JS_OK"
  else
    echo "JS_FAIL"
  fi
  echo
  echo "== CHECK: conflict markers REAL =="
  # Solo conflictos reales (no '====' decorativo)
  grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.expo --exclude='*.bak.*' \
    -E '^(<<<<<<<|=======|>>>>>>>)' . | head -n 80 || true
  echo
  echo "== CHECK: python compile (compileall) =="
  python3 -m compileall -q backend gateway motor megafactory common jobs 2>&1 || true
  echo "PY_COMPILE_DONE"
  echo
  echo "== CHECK: bash -n (*.sh) =="
  find scripts -type f -name "*.sh" 2>/dev/null | while read -r f; do
    bash -n "$f" 2>/dev/null || echo "SH_FAIL $f"
  done || true
  echo
  echo "== CHECK: objectURL direct calls (outside helper) =="
  # Permitimos SOLO la línea del helper: "const u = URL.createObjectURL(obj);"
  HITS="$(grep -n "URL\.createObjectURL" App.js | grep -v 'const u = URL.createObjectURL(obj);' | grep -v 'Web: evita fugas' || true)"
  if [ -n "$HITS" ]; then
    echo "$HITS"
  else
    echo "(ok)"
  fi
  echo
  echo "== DONE =="
  echo "Report: $REPORT"
} | tee "$REPORT"
