#!/usr/bin/env bash
set -Eeuo pipefail

echo "== WHERE AM I =="
pwd

echo
echo "== SYMLINK CHECK =="
ls -la ~/WORK | egrep 'scankey_app|scankey' || true

echo
echo "== GIT REMOTES (must be ONLY origin -> scankey-v1a1) =="
git remote -v

echo
echo "== BRANCH & SYNC =="
git status -sb

echo
echo "== ORIGIN URL MUST MATCH =="
git remote get-url origin

echo
echo "== QUICK HEALTH FILES (expected) =="
for f in backend motor services scripts package.json; do
  test -e "$f" && echo "OK: $f" || echo "MISSING: $f"
done
