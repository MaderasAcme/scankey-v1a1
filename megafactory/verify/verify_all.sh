#!/usr/bin/env bash
set -euo pipefail

say() { printf "%s\n" "$*"; }
ok()  { say "✅ $*"; }
warn(){ say "⚠️  $*"; }
bad() { say "❌ $*"; }

ROOT="$HOME/WORK/scankey_app"
TARGET="$HOME/WORK/scankey/app/scankey-v1a1"
GCS_V1="gs://scankey-models-scankey-dc007-95b419/scankey/models/v1"

INBOX="$HOME/WORK/scankey/train_inbox"
DS1="$HOME/WORK/scankey/datasets/v1"
DS2="$HOME/WORK/scankey/datasets/v2"
LABEL="JIS2I"

say "=== ScanKey Verify (read-only) ==="

# A) Paths
if [ -d "$ROOT" ]; then ok "Existe $ROOT"; else bad "No existe $ROOT"; exit 1; fi
RL="$(readlink -f "$ROOT" || true)"
if [ "$RL" = "$TARGET" ]; then ok "Symlink OK: $ROOT -> $RL"; else warn "Symlink distinto: $ROOT -> $RL (esperado $TARGET)"; fi

# B) Git
cd "$ROOT"
BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[ "$BR" = "main" ] && ok "Rama main" || warn "No estás en main (estás en: $BR)"
ORIG="$(git remote get-url origin 2>/dev/null || true)"
if echo "$ORIG" | grep -q "MaderasAcme/scankey-v1a1.git"; then ok "Origin OK: $ORIG"; else warn "Origin raro: $ORIG"; fi
ST="$(git status -sb 2>/dev/null || true)"
if echo "$ST" | grep -q "behind\|ahead\|diverged"; then warn "Git no está sync:\n$ST"; else ok "Git parece sync"; fi
if git diff --quiet && git diff --cached --quiet; then ok "Working tree limpio"; else warn "Tienes cambios sin commitear"; fi

# C) GCloud project
if command -v gcloud >/dev/null 2>&1; then
  PRJ="$(gcloud config get-value project 2>/dev/null || true)"
  [ "$PRJ" = "scankey-dc007" ] && ok "Proyecto GCP OK: $PRJ" || warn "Proyecto GCP distinto: $PRJ"
else
  warn "gcloud no disponible"
fi

# D) Modelos en GCS
if command -v gsutil >/dev/null 2>&1; then
  if gsutil ls "$GCS_V1/" >/dev/null 2>&1; then
    ok "GCS v1 accesible: $GCS_V1/"
    need=("labels.json" "modelo_llaves.onnx" "modelo_llaves.onnx.data")
    for f in "${need[@]}"; do
      if gsutil ls "$GCS_V1/$f" >/dev/null 2>&1; then ok "GCS v1 tiene $f"; else bad "Falta en GCS v1: $f"; fi
    done
  else
    bad "No puedo listar $GCS_V1/ (permisos o ruta)"
  fi
else
  warn "gsutil no disponible"
fi

# E) Inbox
for d in RAW READY BAD BAD/RECOVERABLE BAD/AUX BAD/DEAD; do
  [ -d "$INBOX/$d" ] && ok "Inbox dir OK: $INBOX/$d" || warn "Falta dir: $INBOX/$d"
done

count_dir () {
  local p="$1"
  if [ -d "$p" ]; then
    find "$p" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) | wc -l
  else
    echo "0"
  fi
}

RAWN="$(count_dir "$INBOX/RAW")"
READYN="$(count_dir "$INBOX/READY")"
RECN="$(count_dir "$INBOX/BAD/RECOVERABLE")"
DEADN="$(count_dir "$INBOX/BAD/DEAD")"

say ""
say "Inbox counts:"
say "- RAW:         $RAWN"
say "- READY:       $READYN"
say "- RECOVERABLE: $RECN"
say "- DEAD:        $DEADN"
[ "$RAWN" -eq 0 ] && ok "RAW=0 (normal si ya hiciste triage)" || warn "RAW>0 (aún no has triado o hay lote nuevo)"

# F) Dataset JIS2I
count_side () {
  local base="$1" side="$2"
  if [ -d "$base/$LABEL/$side" ]; then
    find "$base/$LABEL/$side" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) | wc -l
  else
    echo "0"
  fi
}

A1="$(count_side "$DS1" A)"; B1="$(count_side "$DS1" B)"
A2="$(count_side "$DS2" A)"; B2="$(count_side "$DS2" B)"

say ""
say "Dataset counts (JIS2I):"
say "- v1 A=$A1  B=$B1"
say "- v2 A=$A2  B=$B2"

[ "$B2" -gt 0 ] && ok "v2 tiene cara B" || bad "v2 NO tiene cara B (bloqueo principal)"

if [ "$A2" -ge 30 ] && [ "$B2" -ge 30 ]; then
  ok "v2 listo para entrenar (>=30 A y >=30 B)"
else
  warn "v2 aún no cumple mínimo 30/30 (A=$A2, B=$B2)"
fi

# G) OCR dual presente (solo archivos)
if [ -f "backend/api_ocr.py" ] && [ -f "backend/modules/ocr_dual.py" ]; then
  ok "OCR dual files presentes (backend/api_ocr.py + backend/modules/ocr_dual.py)"
else
  warn "OCR dual files faltan o ruta cambió"
fi

say ""
say "=== Fin verify ==="
