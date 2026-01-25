# ScanKey — ARCHIVO BUENO (Fuente de verdad)

## 0) Regla de oro
- SOLO se trabaja desde: `~/WORK/scankey_app`
- `~/WORK/scankey_app` es symlink a: `~/WORK/scankey/app/scankey-v1a1`
- Si no estás en esa carpeta, NO se ejecuta nada.

## 1) Repo oficial (código)
- Path: `~/WORK/scankey_app`
- Origin: `https://github.com/MaderasAcme/scankey-v1a1.git`
- Rama estable: `main`

## 2) Motor / Backend (FastAPI)
- Backend: `backend/`
- Endpoints verificados (local):
  - `/health`
  - `/api/ocr`  (OCR dual: cliente seguro / taller autorizado)

## 3) Datos (inbox)
- Inbox: `~/WORK/scankey/train_inbox/`
  - `RAW/` = cuarentena (subidas masivas)
  - `READY/` = listo para dataset
  - `BAD/RECOVERABLE/` = salvable (blur/luz/inclinación)
  - `BAD/AUX/` = malo pero útil (robustez/OCR/noise) — NO entrenar directo
  - `BAD/DEAD/` = basura total (sin llave/fuera de foco extremo/recorte brutal)
- Logs:
  - `~/WORK/scankey/train_inbox/triage_*.jsonl`
  - `~/WORK/scankey/train_inbox/sort_ready_*.jsonl` (si aplica)

## 4) Datasets
- v1 estable: `~/WORK/scankey/datasets/v1`
- v2 próxima: `~/WORK/scankey/datasets/v2`
- Por ahora foco: `JIS2I` (A/B)

## 5) Modelos (GCS)
- v1 (EXISTE):
  - `gs://scankey-models-scankey-dc007-95b419/scankey/models/v1/labels.json`
  - `gs://scankey-models-scankey-dc007-95b419/scankey/models/v1/modelo_llaves.onnx`
  - `gs://scankey-models-scankey-dc007-95b419/scankey/models/v1/modelo_llaves.onnx.data`
- v2 (cuando toque):
  - `gs://scankey-models-scankey-dc007-95b419/scankey/models/v2/`

## 6) Cuellos de botella / Bloqueos (lista oficial)
1) Falta cara B (sin B no hay entrenamiento serio ni validación de flujo completo).
2) Falta volumen mínimo por lado (objetivo real: 30A + 30B por referencia).
3) Nombres de archivos sin marca A/B → acaban en AUX/UNSORTED y se pierde tiempo.
4) Confusión RAW vs triage: si haces triage, RAW debe quedar en 0 (normal).
5) Canal de subida no fijado = vuelves a bloquearte.

## 7) MegaFactory (módulos que existen)
- `megafactory/ingest/triage.py`  (RAW → READY/RECOVERABLE/DEAD)
- `megafactory/dataset/sort_ready_to_v2.py`
- `megafactory/dataset/import_ready_by_name.py`
- `megafactory/dataset/recover_aux_by_ahash.py`

## 8) Verificación (sin tocar nada)
Ejecuta:
- `bash megafactory/verify/verify_all.sh`

Eso solo inspecciona y te dice ✅/⚠️/❌.

<!-- MEGAFACTORY_AUTOMATION_START -->
## Megafábrica: automatización “sin toque humano” (backlog)

**Objetivo:** automatizar ingest → QC → dataset → train → eval → release → monitor.
**Regla de oro:** el humano solo hace la captura en el mundo real y validaciones sensibles (patentadas/identidad).

### A. Ingest & Control de entradas (RAW)
- A1) Subidas multi-canal: móvil→Cloud Shell, PC→Cloud Shell, GCS bucket→RAW (sin tocar dataset).
- A2) Inventario automático: lista de archivos + tamaños + hash (SHA256) + dedupe.
- A3) Detección de duplicados y near-duplicates (hash + aHash/pHash).
- A4) “Quarantine rules”: bloquear formatos raros/corruptos, mover a BAD/DEAD.

### B. QC automático (calidad)
- B1) Blur/focus score y descarte por umbral.
- B2) Exposición/contraste: demasiado oscuro/quemado → RECOVERABLE.
- B3) Resolución mínima + orientación (rotación básica) + fondo muy ruidoso.
- B4) Heurística de “llave visible” (si no hay forma clara, a AUX).

### C. Normalización & preprocesado
- C1) Re-encode JPG estándar (calidad fija) y tamaño máximo controlado.
- C2) Auto-rotate si EXIF, recorte leve opcional (sin inventar).
- C3) Versionado de transformaciones: siempre conservar RAW intacto.

### D. Dataset builder (v2, v3…)
- D1) Import READY → datasets/vX/REF/{A,B} por nombre (_A_/_B_) o por matching.
- D2) Dedup dentro del dataset (hash) + diversidad mínima.
- D3) Políticas por clase: mínimo 30A+30B para “entrenable”.
- D4) Balance y muestreo: evita sobre-representación de un taller/dispositivo.

### E. Entrenamiento automático
- E1) Pipeline reproducible (seed, splits, config).
- E2) Entrenar solo si cumple mínimos (A/B) y QC OK.
- E3) Export automático a ONNX + .data + labels.json.
- E4) Guardar métricas y artefactos por versión (v2.0.0, v2.0.1…).

### F. Evaluación y “gates” (no pasa si no cumple)
- F1) Test set fijo (“golden set”) para evitar autoengaño.
- F2) Métricas mínimas: top1/top3, confusión, recall por clase.
- F3) Detección de drift y alerta si baja rendimiento.

### G. Release automático (Cloud Run)
- G1) Subida a GCS models/vX/ + checksum.
- G2) Deploy controlado (canary/rollout) y rollback instantáneo.
- G3) Verificación post-deploy: /health + /api/analyze-key + /api/ocr.

### H. Monitorización y operación
- H1) Dashboard: colas RAW/READY/RECOVERABLE/DEAD + tiempos.
- H2) Alertas: falta B, caída de calidad, drift, picos de tráfico.
- H3) Auditoría: log por imagen (hash, timestamp, destino, motivo QC).

### I. Seguridad & abuso (automático)
- I1) Rate limit + detección de patrones sospechosos.
- I2) Registro inmutable de eventos (hash chain).
- I3) Señales de “posible llave sensible” → workflow seguro.


### Megafactory — backlog “sin toque humano” (añadido completo)

> Regla de oro: automatizar **ingest → QC → dataset → train → eval → release → monitor**.
> Lo único no 100% automático: **captura real** y **verificaciones sensibles** (patentadas/identidad).

#### A. Ingesta (entrada de datos)
- A1) Canal de subida único (móvil/PC/bucket) + naming convention obligatorio.
- A2) Inventario automático (lista + tamaño + hash SHA256) al entrar a RAW.
- A3) Dedupe en RAW (mismo hash) y reporte de duplicados.
- A4) Conversión automática HEIC→JPG (sin tocar el original; guardar “derivado”).
- A5) Normalización de estructura: RAW/READY/BAD/{RECOVERABLE,AUX,DEAD} siempre presentes.

#### B. QC automático (calidad antes de contaminar dataset)
- B1) Blur/focus score + umbrales por tipo (serreta, tubular, etc.).
- B2) Exposición (muy oscuro/quemado) + “recoverable” si se puede arreglar.
- B3) Tamaño mínimo + ratio/orientación detectada (rechazo si inválido).
- B4) Detector de “contenido basura” (pantallazos, memes, texto puro, etc.).
- B5) Logs por imagen: motivo QC + métricas + timestamp + hash.

#### C. Normalización y preprocesado (derivados reproducibles)
- C1) Re-encode JPG estándar (calidad fija) y tamaño máximo controlado.
- C2) Auto-rotate por EXIF; recorte leve opcional (sin inventar datos).
- C3) Versionado de transformaciones: siempre conservar RAW intacto.
- C4) Generar “preview” ligero para UI/inspección (sin usarlo para entrenar).

#### D. Dataset builder (v2, v3…)
- D1) Import READY → datasets/vX/REF/{A,B} por nombre (_A_/_B_) y/o matching.
- D2) Dedupe dentro del dataset (hash) + diversidad mínima (evitar clones).
- D3) Política por clase: mínimo **30A + 30B** para marcar “entrenable”.
- D4) Balance y muestreo: evita sobre-representación de un taller/dispositivo.
- D5) Split fijo train/val/test por hash (reproducible).

#### E. Entrenamiento automático (pipeline reproducible)
- E1) Entrenar solo si pasa gates (A/B mínimos + QC OK + splits OK).
- E2) Config reproducible (seed, augmentations, input size, batch, epochs).
- E3) Export automático a ONNX + .data + labels.json (artefactos completos).
- E4) Guardar métricas y artefactos por versión (v2.0.0, v2.0.1…).
- E5) “Early stop” y registro de curvas (loss/acc) para evitar overfit.

#### F. Evaluación y “gates” (si no cumple, NO sale)
- F1) Golden set fijo (no se toca) para evitar autoengaño.
- F2) Métricas mínimas: top1/top3, confusión, recall por clase.
- F3) Drift detector: alerta si baja rendimiento vs versión anterior.
- F4) Robustez: test por condiciones (luz baja, reflejos, fondo, desgaste).
- F5) Gate de “familias parecidas” (embedding/similitud) para evitar colisiones.

#### G. Release automático (Cloud Run / GCS)
- G1) Subida a GCS models/vX/ + checksum + manifest de versión.
- G2) Deploy controlado (canary/rollout) + rollback instantáneo.
- G3) Post-deploy verify: /health + /api/analyze-key + /api/ocr.
- G4) Registro de “qué versión está en prod” (fuente única de verdad).

#### H. Monitorización y operación
- H1) Dashboard: colas RAW/READY/RECOVERABLE/DEAD + tiempos.
- H2) Alertas: falta B, caída de calidad, drift, picos de tráfico.
- H3) Auditoría: log por imagen (hash, timestamp, origen, QC, destino).

#### I. Seguridad y abuso (automático)
- I1) Rate limit + detección de patrones sospechosos (reintentos, scraping).
- I2) Registro inmutable de eventos (hash-chain) para trazabilidad.
- I3) Señales de “posible llave sensible” → workflow seguro (gated).

#### J. Calidad de datos sin humanos (lo máximo posible)
- J1) Score de “dataset health” por clase (diversidad, blur, exposición).
- J2) Detectar duplicados “casi iguales” (aHash/pHash) a nivel dataset.
- J3) Detectar mezcla accidental A/B (si el modelo lo infiere inconsistencias).
- J4) Rechazo automático de datos que no aportan (redundancia alta).

<!-- MEGAFACTORY_AUTOMATION_END -->

