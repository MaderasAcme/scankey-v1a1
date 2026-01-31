#!/usr/bin/env bash
set -euo pipefail

# ===== Config =====
FULL_LABELS="${FULL_LABELS:-0}"   # 1 = imprime todas las labels, 0 = solo primeras 250
MAX_LABELS_PREVIEW="${MAX_LABELS_PREVIEW:-250}"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="${ROOT}/SCN_MOTOR_EXPORT_${TS}.txt"

# ===== Helpers =====
h1(){ printf "\n============================================================\n%s\n============================================================\n" "$1"; }
h2(){ printf "\n------------------------------\n%s\n------------------------------\n" "$1"; }

# ===== Start =====
: > "$OUT"

{
  echo "SCA NKEY — EXPORT MOTOR (REGLAS + TIPOS + API) — $(date -Iseconds)"
  echo "ROOT: $ROOT"
  echo

  h1 "0) CONTEXTO REPO (git)"
  if command -v git >/dev/null 2>&1 && [ -d "$ROOT/.git" ]; then
    echo "BRANCH: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    echo "COMMIT: $(git rev-parse HEAD 2>/dev/null || true)"
    echo "REMOTE:"
    git remote -v 2>/dev/null || true
    echo
    echo "STATUS (porcelain):"
    git status --porcelain 2>/dev/null || true
  else
    echo "No es un repo git (o no disponible)."
  fi

  h1 "1) ARCHIVOS RELEVANTES DETECTADOS (motor/backend/onnx/ocr/rules/ranking)"
  # Ajusta patrones según tu repo
  find "$ROOT" -type f \
    \( -name "*.py" -o -name "*.json" -o -name "*.md" -o -name "*.yml" -o -name "*.yaml" \) 2>/dev/null \
    | grep -E '/(motor|backend|api|onnx|ocr|ranking|rules|labels|engine|model|inference|store|sample|feedback)/' \
    | sed 's#^#- #' || true

  h1 "2) ENDPOINTS (FastAPI) — rutas @app.get/@app.post y add_api_route"
  # Captura decoradores típicos y rutas registradas
  find "$ROOT" -type f -name "*.py" 2>/dev/null \
    | xargs -r grep -nE '(@app\.(get|post|put|delete)\(|add_api_route\()' \
    | sed 's#^#- #' || true

  h1 "3) VARIABLES DE ENTORNO (os.getenv / os.environ.get)"
  find "$ROOT" -type f -name "*.py" 2>/dev/null \
    | xargs -r grep -nE 'os\.(getenv|environ\.get)\(' \
    | sed 's#^#- #' || true

  h1 "4) REGLAS CLAVE (confianza, top3, almacenamiento, patentadas, manufacturer_hint)"
  PAT='high_confidence|low_confidence|confidence|topk|top_?3|rank|should_store|storage_probability|max.*samples|sample|patent|patentada|manufacturer_hint|manual_correction|compatibility_tags|crop_bbox'
  find "$ROOT" -type f -name "*.py" 2>/dev/null \
    | xargs -r grep -nE "$PAT" \
    | sed 's#^#- #' || true

  h1 "5) OCR (cuándo corre + regex + tesseract + boost ranking)"
  PAT_OCR='OCR|tesseract|pytesseract|whitelist|regex|rotate|threshold|equalizeHist|Otsu|manufacturer_hint|boost'
  find "$ROOT" -type f -name "*.py" 2>/dev/null \
    | xargs -r grep -nE "$PAT_OCR" \
    | sed 's#^#- #' || true

  h1 "6) EXTRAER UMBRALES (si están codificados como números en rules/ranking)"
  python3 - <<'PY' 2>/dev/null || true
import re, os
from pathlib import Path

root = Path(os.environ.get("ROOT", ".")).resolve()
keys = [
  "high_confidence", "low_confidence", "should_store_sample",
  "storage_probability", "max_samples", "MAX_SAMPLES",
  "ocr", "OCR", "manufacturer_hint", "boost"
]

paths = []
for p in root.rglob("*.py"):
  sp = str(p).lower()
  if any(k in sp for k in ["rules","ranking","ocr","engine","main","api"]):
    paths.append(p)

num_re = re.compile(r"(?<!\d)(0\.\d+|[1-9]\d*(?:\.\d+)?)(?!\d)")
hits = []
for p in paths:
  try:
    txt = p.read_text(encoding="utf-8", errors="replace")
  except Exception:
    continue
  for line_no, line in enumerate(txt.splitlines(), 1):
    if any(k in line for k in keys) and any(ch.isdigit() for ch in line):
      nums = num_re.findall(line)
      if nums:
        hits.append((str(p), line_no, line.strip(), nums))

print("Encontradas líneas con posibles umbrales/constantes:")
for fp, ln, line, nums in hits[:400]:
  print(f"- {fp}:{ln}  nums={nums}  | {line}")
if len(hits) > 400:
  print(f"... ({len(hits)-400} líneas más omitidas)")
PY

  h1 "7) LABELS / TIPOS SOPORTADOS (labels.json / labels*.json si existen)"
  # Busca labels.json en el repo
  LABEL_FILE="$(find "$ROOT" -maxdepth 6 -type f -iname "labels*.json" 2>/dev/null | head -n 1 || true)"
  if [ -n "${LABEL_FILE:-}" ] && [ -f "$LABEL_FILE" ]; then
    echo "Labels file: $LABEL_FILE"
    python3 - <<PY
import json, os
p = os.environ.get("LABEL_FILE")
with open(p,"r",encoding="utf-8") as f:
  data = json.load(f)
if isinstance(data, dict):
  # soporta formatos {"labels":[...]} u otros
  labels = data.get("labels") or data.get("classes") or data.get("items") or []
else:
  labels = data
print("labels_count:", len(labels))
show_all = int(os.environ.get("FULL_LABELS","0")) == 1
max_preview = int(os.environ.get("MAX_LABELS_PREVIEW","250"))
if show_all:
  for x in labels: print("-", x)
else:
  for x in labels[:max_preview]: print("-", x)
  if len(labels) > max_preview:
    print(f"... (omitidas {len(labels)-max_preview}. Para todas: FULL_LABELS=1 ./scripts/export_motor_doc.sh)")
PY
  else
    echo "No encontré labels*.json cerca. (Si las labels están en GCS, añádelas al repo o indícame el path.)"
  fi

  h1 "8) CONTRATO DE SALIDA (Spec ScanKey que la app debe soportar)"
  cat <<'SPEC'
{
  "input_id": "string",
  "timestamp": "ISO8601",
  "manufacturer_hint": { "found": true, "name": "string|null", "confidence": 0.0 },
  "results": [
    {
      "rank": 1,
      "id_model_ref": "string|null",
      "type": "string",
      "brand": "string|null",
      "model": "string|null",
      "orientation": "string|null",
      "head_color": "string|null",
      "visual_state": "string|null",
      "patentada": false,
      "compatibility_tags": ["string"],
      "confidence": 0.0,
      "explain_text": "string",
      "crop_bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }
    }
  ],
  "low_confidence": false,
  "high_confidence": false,
  "should_store_sample": false,
  "storage_probability": 0.75,
  "current_samples_for_candidate": 0,
  "manual_correction_hint": { "fields": ["marca","modelo","tipo","orientacion","ocr_text"] },
  "debug": { "processing_time_ms": 0, "model_version": "string" }
}
SPEC

  h1 "9) ALMACENAMIENTO (qué buscar en código + checks)"
  echo "Buscando en código referencias a:"
  echo " - GCS / buckets / storage / upload / should_store_sample / max 30 / prob 0.75"
  find "$ROOT" -type f -name "*.py" 2>/dev/null \
    | xargs -r grep -nE 'gs://|storage\.googleapis|google\.cloud\.storage|bucket|upload|should_store_sample|max.?30|0\.75|store_sample|store.*image' \
    | sed 's#^#- #' || true

  h1 "10) ARCHIVOS SENSIBLES (NO IMPRIME CONTENIDO, SOLO RUTA)"
  echo "Si sale algo aquí, bórralo del repo y rota credenciales."
  find "$ROOT" -maxdepth 8 -type f \( \
    -iname "*recovery*" -o -iname "*credentials*.json" -o -iname "*token*" -o -iname "*.pem" -o -iname "*.key" -o -iname ".env" -o -iname ".env.*" \
  \) 2>/dev/null | sed 's#^#- #' || true

  h1 "FIN"
  echo "Documento generado: $OUT"
} >> "$OUT"

echo "OK -> $OUT"
