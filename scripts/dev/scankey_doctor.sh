#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

REPORT="$HOME/WORK/SCN_DOCTOR_REPORT_$(date +%Y%m%d_%H%M%S).txt"
echo "ScanKey Doctor Report - $(date -Is)" | tee "$REPORT"
echo "ROOT=$ROOT" | tee -a "$REPORT"
echo | tee -a "$REPORT"

echo "== GIT STATUS ==" | tee -a "$REPORT"
git status -sb | tee -a "$REPORT" || true
echo | tee -a "$REPORT"

echo "== CHECK: JS syntax (App.js) ==" | tee -a "$REPORT"
node --check App.js && echo "JS_OK" | tee -a "$REPORT" || echo "JS_FAIL" | tee -a "$REPORT"
echo | tee -a "$REPORT"

echo "== CHECK: conflict markers REAL ==" | tee -a "$REPORT"
grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.expo --exclude='*.bak.*' \
  -E '^(<<<<<<<|=======|>>>>>>>)' . | head -n 80 | tee -a "$REPORT" || true
echo | tee -a "$REPORT"

echo "== CHECK: python compile ==" | tee -a "$REPORT"
python3 -m compileall -q backend gateway motor megafactory common jobs 2>&1 | tee -a "$REPORT" || true
echo "PY_COMPILE_DONE" | tee -a "$REPORT"
echo | tee -a "$REPORT"

echo "== CHECK: bash -n ==" | tee -a "$REPORT"
find scripts -type f -name "*.sh" 2>/dev/null | while read -r f; do
  bash -n "$f" 2>/dev/null || echo "SH_FAIL $f"
done | tee -a "$REPORT" || true
echo | tee -a "$REPORT"

echo "== CHECK: objectURL direct calls ==" | tee -a "$REPORT"
grep -RIn "URL\.createObjectURL" App.js | tee -a "$REPORT" || true
echo | tee -a "$REPORT"

echo "== DONE ==" | tee -a "$REPORT"
echo "Report: $REPORT"
