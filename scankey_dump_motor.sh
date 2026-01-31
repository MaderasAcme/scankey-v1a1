#!/usr/bin/env bash
set -euo pipefail

# ==== Config ====
OUT="SCN_MOTOR_SHELL_DUMP_$(date +%Y-%m-%d_%H%M).txt"
ROOT="$(pwd)"

# ==== Helpers ====
say() { printf "\n\n===== %s =====\n" "$*" >> "$OUT"; }
cmd() { echo "\$ $*" >> "$OUT"; ( "$@" 2>&1 || true ) >> "$OUT"; }
catfile() {
  local f="$1"
  if [ -f "$f" ]; then
    say "FILE: $f"
    echo "--- BEGIN $f ---" >> "$OUT"
    # Evita vomitar ficheros gigantes
    if [ "$(wc -c < "$f")" -gt 400000 ]; then
      echo "(file too large; showing first 500 lines)" >> "$OUT"
      sed -n '1,500p' "$f" >> "$OUT"
    else
      cat "$f" >> "$OUT"
    fi
    echo "--- END $f ---" >> "$OUT"
  fi
}

# ==== Start ====
: > "$OUT"
say "IDENTIDAD"
cmd pwd
cmd date
cmd whoami
cmd uname -a

say "GIT (estado del repo)"
cmd git rev-parse --show-toplevel
cmd git status -sb
cmd git remote -v
cmd git branch --show-current
cmd git log -n 20 --oneline --decorate
cmd git diff --stat || true

say "ESTRUCTURA (top level)"
cmd ls -la
cmd find . -maxdepth 3 -type d -print | sed 's|^\./||'

say "BUSQUEDA: endpoints FastAPI"
cmd bash -lc "grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude='*.min.*' -E '@app\\.(get|post|put|delete)\\(|FastAPI\\(|APIRouter\\(' . | head -n 200"

say "BUSQUEDA: reglas de negocio (thresholds + store sample + confidence)"
cmd bash -lc "grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E 'high_confidence|low_confidence|should_store_sample|storage_probability|current_samples_for_candidate|>= 0\\.95|< 0\\.60|0\\.75|max.*30|samples.*30' . | head -n 250"

say "BUSQUEDA: OCR (cuando corre + regex + whitelist)"
cmd bash -lc "grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E 'OCR|tesseract|whitelist|regex|equalizeHist|Otsu|rotate\\(|manufacturer_hint' . | head -n 250"

say "BUSQUEDA: labels / tipos / catalogo"
cmd bash -lc "find . -maxdepth 6 -type f -iname '*labels*.json' -o -iname '*catalog*' -o -iname '*llaves*' -o -iname '*types*' | sed 's|^\./||'"

say "VARIABLES DE ENTORNO (solo nombres, sin valores)"
cmd bash -lc "grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E 'os\\.getenv\\(|process\\.env\\.' . | head -n 250"

say "ARCHIVOS CLAVE (se incluyen si existen)"
# App / cliente (si está en el repo)
catfile "App.js"

# Backend / motor (rutas típicas; añade más si tienes)
catfile "backend/main.py"
catfile "backend/api_ocr.py"
catfile "backend/modules/ocr_dual.py"
catfile "backend/onnx_engine.py"
catfile "backend/ranking.py"
catfile "backend/rules.py"

# Motor standalone si existe en tu repo
catfile "motor/main.py"
catfile "motor/rules.py"
catfile "motor/ranking.py"
catfile "motor/ocr_engine.py"
catfile "motor/lang_norm.py"

# Labels
# (Incluye cualquiera encontrada en el repo)
for f in $(find . -maxdepth 6 -type f -iname '*labels*.json' 2>/dev/null | head -n 20); do
  catfile "${f#./}"
done

say "SEGURIDAD: detectar ficheros sensibles (NO se vuelcan contenidos)"
cmd bash -lc "find . -maxdepth 8 -type f \\( -iname '*recovery*' -o -iname '*credential*' -o -iname '*.pem' -o -iname '*.key' -o -iname '*token*' -o -iname '*.env' \\) -print | sed 's|^\./||' | head -n 200"

say "FIN"
echo "Generado: $OUT"
