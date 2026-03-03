#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
OUT="${1:-scankey_dump.txt}"

# --- Helpers ---
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
hr() { printf "\n\n==================== %s ====================\n" "$1"; }
run() {
  local title="$1"; shift
  hr "$title"
  echo "\$ $*"
  ( "$@" ) 2>&1 || echo "[WARN] comando falló: $*"
}
exists() { [ -f "$1" ]; }
dir_exists() { [ -d "$1" ]; }
bytes() { wc -c < "$1" 2>/dev/null || echo 0; }

dump_file() {
  local path="$1"
  local max_bytes="${2:-220000}" # ~220KB por archivo
  if [ ! -f "$path" ]; then return 0; fi
  hr "FILE: $path"
  local sz; sz="$(bytes "$path")"
  echo "SIZE_BYTES=$sz"
  if [ "$sz" -le "$max_bytes" ]; then
    sed -e 's/\r$//' "$path"
  else
    echo "[TRUNCATED] Mostrando primeros $max_bytes bytes"
    head -c "$max_bytes" "$path" | sed -e 's/\r$//'
  fi
}

dump_tree() {
  hr "REPO TREE (top)"
  if command -v tree >/dev/null 2>&1; then
    tree -a -L 4 -I "node_modules|.git|.expo|.next|dist|build|__pycache__|venv|.venv" 2>/dev/null || true
  else
    find . -maxdepth 4 \
      \( -name node_modules -o -name .git -o -name .expo -o -name dist -o -name build -o -name __pycache__ -o -name venv -o -name .venv \) -prune \
      -o -print | sed -e 's|^\./||' | head -n 400
  fi
}

scan_sensitive_names() {
  hr "SENSITIVE FILE NAMES (no contents)"
  # Solo nombres/rutas, NUNCA contenido
  find "$ROOT" -maxdepth 8 -type f \( \
    -iname "*recovery*code*" -o -iname "*credentials*.json" -o -iname "*service*account*.json" -o \
    -iname "*.pem" -o -iname "*.p12" -o -iname "*.key" -o -iname "*token*" -o \
    -iname ".env" -o -iname ".env.*" -o -iname "*secret*" \
  \) 2>/dev/null | sed -e "s|$ROOT/||" | sort || true
}

redact_env_example() {
  hr ".env.example (auto generado sin valores)"
  # Busca nombres típicos de env en el repo y sugiere plantillas sin valores
  # No imprime valores reales.
  local keys=()
  # patrones básicos; puedes ampliar
  while IFS= read -r line; do
    k="$(echo "$line" | sed -n 's/^\s*\([A-Z0-9_]\{3,\}\)\s*=.*$/\1/p')"
    if [ -n "${k:-}" ]; then keys+=("$k"); fi
  done < <(grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
      -E '^[[:space:]]*[A-Z0-9_]{3,}[[:space:]]*=' "$ROOT" 2>/dev/null | head -n 300 | cut -d: -f3-)

  # unique
  if [ "${#keys[@]}" -eq 0 ]; then
    echo "# (no se detectaron claves en código)"
    return 0
  fi

  printf "# Plantilla sugerida (SIN valores)\n"
  printf "# Generada: %s\n\n" "$(ts)"

  printf "%s\n" "${keys[@]}" | sort -u | head -n 120 | while read -r k; do
    echo "${k}="
  done
}

cloud_run_snapshot() {
  hr "GCP / Cloud Run snapshot (safe)"
  run "gcloud config list" gcloud config list
  run "gcloud auth list" gcloud auth list
  run "gcloud projects list (top)" gcloud projects list --limit=10

  # Intentar listar servicios en varias regiones comunes (sin fallar si no existen)
  for r in europe-west1 europe-southwest1 europe-west4; do
    hr "Cloud Run services list (region=$r)"
    echo "\$ gcloud run services list --region $r --platform managed --format='table(name,url)'"
    gcloud run services list --region "$r" --platform managed --format="table(name,url)" 2>&1 || true
  done
}

# --- Start dump ---
{
  echo "ScanKey SUPPORT DUMP"
  echo "UTC_TIME=$(ts)"
  echo "PWD=$ROOT"

  run "uname -a" uname -a
  run "node -v (if any)" bash -lc 'command -v node >/dev/null 2>&1 && node -v || echo "node: n/a"'
  run "python3 --version (if any)" bash -lc 'command -v python3 >/dev/null 2>&1 && python3 --version || echo "python3: n/a"'

  # git state
  run "git remote -v" git remote -v
  run "git status" git status
  run "git branch -vv" git branch -vv
  run "git log -n 12 --oneline" git log -n 12 --oneline
  run "git diff (name-only)" git diff --name-only || true

  dump_tree
  scan_sensitive_names

  # Archivos clave típicos (si existen)
  dump_file "App.js"
  dump_file "package.json"
  dump_file "app.json"
  dump_file "eas.json"
  dump_file "babel.config.js"
  dump_file "metro.config.js"
  dump_file ".gitignore"
  dump_file "README.md"

  # Backend típico
  dump_file "backend/main.py"
  dump_file "backend/app/main.py"
  dump_file "backend/requirements.txt"
  dump_file "requirements.txt"
  dump_file "Dockerfile"
  dump_file "cloudbuild.yaml"
  dump_file "backend/Dockerfile"

  # Docs útiles
  if dir_exists "docs"; then
    hr "DOCS: list"
    find docs -maxdepth 3 -type f | sed -e 's|^\./||'
  fi

  # Env example sin valores
  redact_env_example

  # Snapshot Cloud Run
  if command -v gcloud >/dev/null 2>&1; then
    cloud_run_snapshot
  else
    hr "gcloud not available"
  fi

  hr "END"
} > "$OUT"

echo "[OK] Generado: $OUT"
echo "[NEXT] Descárgalo con: cloudshell download $OUT"
