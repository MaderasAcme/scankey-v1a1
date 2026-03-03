# Incident: Cloud Run scankey-motor bootstrap (2026-02-03)

## Impacto
- 503 / crash en revisiones intermedias.
- Modelo no descargado en una revisión por env vars ausentes.

## Causas raíz
1) NameError: MIN_BYTES no definido en model_bootstrap.py (default en _need).
2) Env vars de modelo ausentes -> bootstrap skip -> ORT NO_SUCHFILE.
3) Drift por múltiples revisiones creadas por updates (min-instances/traffic).

## Fix aplicado
- _need(p, min_bytes) sin default MIN_BYTES.
- Env vars: MODEL_GCS_URI, MODEL_GCS_DATA_URI, LABELS_GCS_URI.
- Script deploy_motor.sh como fuente de verdad.

## Pendiente (hardening)
- Evitar carreras en cold start: workers=1 y/o 503 + Retry-After mientras model_loading.
- Política de revisiones: deploy con --no-traffic para pruebas, y promote explícito.
