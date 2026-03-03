# ScanKey — BACKLOG MASTER (brutal)

## P0 — Multilabel REAL (sin esto, todo es humo)
- [ ] Definir N labels v2 (lista cerrada) y congelarla (DoD: archivo `refs/v2_labels.txt`)
- [ ] Dataset v2 mínimo por clase (DoD: >= 30 A/B por label en `~/WORK/scankey/datasets/v2/<LABEL>/{A,B}`)
- [ ] Entrenar + exportar ONNX v2 (DoD: `modelo_llaves.onnx` + `.data` si aplica + `labels.json` con N>1)
- [ ] Subir a GCS con carpeta versionada `models/v2_YYYYMMDD_HHMM/` (DoD: 3 artefactos en GCS)
- [ ] Deploy motor apuntando a esa carpeta (DoD: `/health labels_count > 1`)

## P0 — Catálogo mínimo (para que el producto tenga “cerebro”)
- [x] Seed inicial de refs comunes (`refs/catalog_seed_common.csv`)
- [x] Generador de catálogo (`megafactory/catalog/build_catalog_refs.py`)
- [x] Sanity checks (`scripts/catalog_sanity.sh`)
- [ ] Enriquecimiento: `catalog_refs.json` con tipo/brand/tags reales (DoD: >= 20 refs con campos completos)

## P1 — Unknown / Open-set (para las que no están)
- [ ] Regla UNKNOWN por capas (DoD: motor devuelve `UNKNOWN` con umbrales y “U-xxx” cuando aplique)
- [ ] Guardado “oro” para correcciones manuales (DoD: siempre se guarda feedback manual aunque confidence < 0.75)
- [ ] Dedupe + diversidad temporal (DoD: no duplica misma llave en ventana corta)

## P1 — Seguridad / Operación
- [x] Motor privado detrás de gateway
- [x] Bucket modelos con versionado
- [ ] Rate-limit / abuse guardrails (DoD: policy version != none y límites aplicados)

