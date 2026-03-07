# ScanKey — BACKLOG MASTER (brutal)

---

## BLOQUE 5 — Single Source of Truth (common/) ✅

**Regla de arquitectura:**
- `common/` = helpers compartidos estables (size_class, quality_gate, risk_engine, policy_engine)
- `gateway/normalize.py` = **normalización oficial** del contrato ScanKey
- `ui-studio/backend/utils/normalize.py` = **adaptador mock dev** — delega en gateway, sin duplicar lógica

---

## ROADMAP TALLER (B) — PRIORIDADES

### P0

- [ ] **P0.1** Build ID visible (COMMIT + DEPLOY_PING)
  - Fuente: `deploy-ping.txt`
  - UI: mostrar build y deploy en Perfil Técnico
  - **DoD:** se ve el commit corto y timestamp en scankeyapp.com y coincide con deploy-ping.
  - **FLAG:** `BUILD_ID_VISIBLE` — PASIVO ON

- [ ] **P0.2** QualityGate PASIVO (sentidos midiendo)
  - blur/exposición/glare/fondo/encuadre/A-B consistency
  - output a debug: `quality_score`, `roi_score`, `reasons[]`
  - **DoD:** métricas aparecen en debug sin bloquear flujo.
  - **FLAG:** `QUALITYGATE_PASIVO` — PASIVO ON

- [ ] **P0.3** Risk score + margin
  - margin top1-top2, risk_score acumulado, reasons
  - **DoD:** debug incluye margin/risk_score, UI muestra aviso solo si low_confidence.
  - **FLAG:** `RISK_SCORE_VISIBLE` — PASIVO ON

- [ ] **P0.4** Doc anti-cache Cloudflare (1 interfaz)
  - `docs/CLOUDFLARE_CACHE.md` con 2 reglas (bypass html + ping) + redirect www→apex
  - **DoD:** reglas documentadas; checklist reproducible; solución de "veo la vieja" sin tocar código; doc linkado desde README.
  - **FLAG:** `CLOUDFLARE_CACHE_DOC` — PASIVO ON

- [ ] **P0.5** Taller PRO panel (stats operativas)
  - latencia health p50/p95, pendientes feedback, high/low today, model_version, labels_count
  - **DoD:** panel muestra stats sin inputs manuales.
  - **FLAG:** `TALLER_PRO_PANEL` — PASIVO ON

### P1

- [ ] **P1.1** QualityGate ACTIVO — rechazar/rebajar requests fuera de umbral
  - **DoD:** policy aplicada antes de motor.
  - **FLAG:** `QUALITYGATE_ACTIVO` — ACTIVO OFF

- [ ] **P1.2** Unknown / Open-set — regla UNKNOWN por capas
  - **DoD:** motor devuelve `UNKNOWN` con umbrales y "U-xxx" cuando aplique.
  - **FLAG:** `UNKNOWN_OPENSET` — ACTIVO OFF

- [ ] **P1.3** Rate-limit / abuse guardrails
  - **DoD:** policy version != none y límites aplicados.
  - **FLAG:** `RATE_LIMIT` — ACTIVO OFF

### P2

- [ ] **P2.1** Guardado "oro" para correcciones manuales
  - **DoD:** siempre se guarda feedback manual aunque confidence < 0.75.
  - **FLAG:** `GOLDEN_FEEDBACK` — ACTIVO OFF

- [ ] **P2.2** Dedupe + diversidad temporal
  - **DoD:** no duplica misma llave en ventana corta.
  - **FLAG:** `DEDUPE_TEMPORAL` — ACTIVO OFF

---

## CHECKS por PR

Antes de mergear cada PR:

| Check | Comando |
|-------|---------|
| build ui-studio | `npm -C ui-studio run build` |
| qa:no-ts | `npm -C ui-studio run qa:no-ts` |
| qa:contract | `npm -C ui-studio run qa:contract` |
| qa:smoke | `RUN_SMOKE=1 npm -C ui-studio run qa:smoke` (solo si stack up) |

---

## P0 — Estabilización (Hotfix) ✅
- [x] OCR token: X-Workshop-Token coincide con WORKSHOP_TOKEN; modo=taller NO habilita ocr_detail
- [x] Size-class: modo debug-only (debug.size_class, debug.size_class_applied); NO reordenar
- [x] Smoke SKIP: qa:all no rompe cuando backend apagado; RUN_SMOKE=1 para forzar smoke
- [x] Clamp: clamp_confidence aplicado tras AB fusion, manufacturer, ROI fallback (tests)
- [x] Input validation: payload size 413, content-type 415, imagen inválida 400 (tests)

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
- [x] **Fase 2** Taxonomía oficial multi-label (oblig/recomend/experimental) — `docs/MULTILABEL_FIELDS.md`
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
