# ScanKey — BACKLOG MASTER (brutal)

## P0 — Estabilización (Hotfix)
- [ ] OCR token: validación y rotación segura (DoD: no tokens en logs; rotación documentada)
- [ ] Size-class: modo debug-only (DoD: no producción si debug desactivado)
- [ ] Smoke SKIP: qa:all no rompe cuando backend apagado; RUN_SMOKE=1 para forzar smoke
- [ ] Clamp: bbox/ROI dentro de límites válidos (DoD: tests unitarios)
- [ ] Input validation: validar payloads en gateway antes de proxy (DoD: 400 en malformados)

**DoD Hotfix P0:**
- `npm run qa:all` pasa con backend apagado (smoke SKIP)
- `RUN_SMOKE=1 npm run qa:smoke` pasa con stack levantado
- qa:no-ts, qa:pages, build ui-studio pasan

---

## P0.LD1 — Flujo local primero (no depender de Cloud Shell)
- [x] El desarrollo diario se hace en local (Windows/WSL) y Cloud Shell queda solo para operaciones GCP (deploy/env/logs).
- [x] Opción A (recomendada): Docker Compose local (gateway + motor + ocr opcional).
- [x] Opción B: venv+npm (sin Docker) documentada como fallback.
- [x] `.env.example` sin secretos + `.env.local` ignorado por git.
- [x] Comandos "one-liner" para: levantar stack, apagar stack, correr QA (qa:all) y smoke (RUN_SMOKE=1).
- [x] Smoke local: `curl localhost` a /health de gateway y motor.

**DoD:**
- Un dev nuevo puede clonar y levantar todo en <15 min siguiendo docs.
- `npm -C ui-studio run qa:all` pasa en local.
- `RUN_SMOKE=1 npm -C ui-studio run qa:smoke` pasa con stack levantado.

---

## P0 — Sistema de Sentidos (QualityGate + PolicyEngine)
- [ ] QualityGate: rechazar/rebajar requests fuera de umbral (DoD: policy aplicada antes de motor)
- [ ] PolicyEngine: reglas configurables (confianza mínima, labels permitidos, etc.)
- [ ] Integración gateway ↔ policy (DoD: 422/200 según policy)

---

## P0 — Multi-clase / Multi-label (mantener y enriquecer)
- [ ] Definir N labels v2 (lista cerrada) y congelarla (DoD: archivo `refs/v2_labels.txt`)
- [ ] Dataset v2 mínimo por clase (DoD: >= 30 A/B por label en `~/WORK/scankey/datasets/v2/<LABEL>/{A,B}`)
- [ ] Entrenar + exportar ONNX v2 (DoD: `modelo_llaves.onnx` + `.data` si aplica + `labels.json` con N>1)
- [ ] Subir a GCS con carpeta versionada `models/v2_YYYYMMDD_HHMM/` (DoD: 3 artefactos en GCS)
- [ ] Deploy motor apuntando a esa carpeta (DoD: `/health labels_count > 1`)

---

## P0 — Catálogo mínimo (para que el producto tenga "cerebro")
- [x] Seed inicial de refs comunes (`refs/catalog_seed_common.csv`)
- [x] Generador de catálogo (`megafactory/catalog/build_catalog_refs.py`)
- [x] Sanity checks (`scripts/catalog_sanity.sh`)
- [ ] Enriquecimiento: `catalog_refs.json` con tipo/brand/tags reales (DoD: >= 20 refs con campos completos)

## P1 — Unknown / Open-set (para las que no están)
- [ ] Regla UNKNOWN por capas (DoD: motor devuelve `UNKNOWN` con umbrales y "U-xxx" cuando aplique)
- [ ] Guardado "oro" para correcciones manuales (DoD: siempre se guarda feedback manual aunque confidence < 0.75)
- [ ] Dedupe + diversidad temporal (DoD: no duplica misma llave en ventana corta)

## P1 — Seguridad / Operación
- [x] Motor privado detrás de gateway
- [x] Bucket modelos con versionado
- [ ] Rate-limit / abuse guardrails (DoD: policy version != none y límites aplicados)

