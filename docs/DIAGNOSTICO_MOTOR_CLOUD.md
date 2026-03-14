# Diagnóstico: Gateway → Motor Cloud (timeout / no responde)

**Objetivo:** Cerrar el bloqueo "Gateway -> motor cloud no responde correctamente / timeout".

---

## 1. Cadena de dependencias

```
UI (Pages) → Gateway (Cloud Run) → Motor (Cloud Run)
                  ↓
            MOTOR_URL (env)
            TIMEOUT=15s (default)
            ID Token (si motor es privado)
```

---

## 2. Checklist de verificación

### 2.1 MOTOR_URL en Gateway (CRÍTICO)

El `cloudbuild-gateway.yaml` **NO** setea `MOTOR_URL`. Debe configurarse manualmente.

```bash
# Ver env vars actuales del gateway
gcloud run services describe scankey-gateway --region europe-southwest1 \
  --format="yaml(spec.template.spec.containers[0].env)"

# Si MOTOR_URL está vacío o no existe → 500 "MOTOR_URL no configurado"
# Configurar (obtener URL del motor primero):
MOTOR_URL=$(gcloud run services describe scankey-motor --region europe-southwest1 --format='value(status.url)')
gcloud run services update scankey-gateway --region europe-southwest1 \
  --set-env-vars="MOTOR_URL=$MOTOR_URL"
```

### 2.2 Motor desplegado y accesible

```bash
# URL del motor
gcloud run services describe scankey-motor --region europe-southwest1 --format='value(status.url)'

# Health con token (motor suele ser privado)
TOKEN=$(gcloud auth print-identity-token)
curl -s -H "Authorization: Bearer $TOKEN" "$MOTOR_URL/health" | jq .
```

**Códigos esperados:**
- `200` + `model_ready: true` → Motor OK
- `200` + `model_ready: false` → Motor arrancado pero modelo aún cargando (esperar 1–5 min)
- `401` → Token inválido o motor requiere auth
- `502/503` → Motor aún arrancando o bootstrap fallando
- Timeout → Motor no responde (cold start, bootstrap lento, red)

### 2.3 Permisos: Gateway → Motor (invoker)

Si el motor es **privado** (`--no-allow-unauthenticated`), el gateway debe poder invocarlo.

```bash
# SA que usa el gateway (por defecto el SA por defecto del proyecto)
GW_SA=$(gcloud run services describe scankey-gateway --region europe-southwest1 \
  --format='value(spec.template.spec.serviceAccountName)')
# Si vacío, usa: PROJECT_NUMBER-compute@developer.gserviceaccount.com

# Dar run.invoker al gateway sobre el motor
gcloud run services add-iam-policy-binding scankey-motor \
  --region europe-southwest1 \
  --member="serviceAccount:${GW_SA:-scankey-runner@scankey-dc007.iam.gserviceaccount.com}" \
  --role="roles/run.invoker"
```

**Nota:** Si el gateway usa otro SA, verifica en la consola de Cloud Run → scankey-gateway → Configuration → Service account.

### 2.4 Timeout Gateway → Motor

| Variable | Default | Descripción |
|----------|---------|-------------|
| `TIMEOUT` | 15 | Segundos que el gateway espera al motor |
| Motor bootstrap | ~60–300s | Primera descarga de modelo desde GCS |
| Motor inferencia | ~1–5s | Por request normal |

**Problema:** Con cold start + bootstrap, la primera request puede tardar >15s → timeout 504.

**Mitigaciones:**
1. `min-instances=1` en motor (deploy_motor.sh ya lo usa) → reduce cold starts
2. Aumentar `TIMEOUT` en gateway para las primeras requests:
   ```bash
   gcloud run services update scankey-gateway --region europe-southwest1 \
     --set-env-vars="TIMEOUT=120"
   ```
3. Warm-up: llamar a `/motor/health` o `/health` del motor tras cada deploy

### 2.5 Motor bootstrap (modelo GCS)

Variables en `deploy_motor.sh`:
- `MODEL_GCS_URI`, `MODEL_GCS_DATA_URI`, `LABELS_GCS_URI`
- `BOOTSTRAP_HTTP_TIMEOUT=900`, `GUNICORN_TIMEOUT=900`

Si el modelo no existe en GCS o el SA del motor no tiene permisos → bootstrap falla → motor no sirve requests.

```bash
# Ver logs del motor (bootstrap)
gcloud run services logs read scankey-motor --region europe-southwest1 --limit 50
```

Buscar: `BOOTSTRAP`, `model_ready`, `error`.

### 2.6 ID Token Proxy (gateway → motor)

`SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED=true` (default) → el gateway añade `Authorization: Bearer <id_token>` al llamar al motor.

- El token se obtiene con `id_token.fetch_id_token(audience=MOTOR_URL)`
- Requiere que el gateway corra en GCP (Cloud Run, GCE, etc.) con credenciales adecuadas
- Si `MOTOR_URL` está mal formada (sin https, typo) → fallo al obtener token

---

## 3. Script de verificación rápida

Ejecutar desde el repo:

```bash
./scripts/diagnostico_motor_cloud.sh
```

Ver `scripts/diagnostico_motor_cloud.sh`.

---

## 4. Resumen de acciones

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| 500 "MOTOR_URL no configurado" | MOTOR_URL vacío en gateway | `--set-env-vars="MOTOR_URL=<url_motor>"` en gateway |
| 504 "motor timeout" | Motor tarda >15s (bootstrap, cold start) | Aumentar `TIMEOUT`, verificar min-instances=1, warm-up |
| 502/503 desde gateway al motor | Motor no listo o bootstrap fallando | Revisar logs motor, GCS, MODEL_GCS_URI |
| 401 al llamar motor | Permisos invoker | `gcloud run services add-iam-policy-binding` |
| Motor /health OK pero /api/analyze-key timeout | Inferencia lenta o workers bloqueados | Revisar GUNICORN_WORKERS, tamaño modelo |

---

## 5. Orden recomendado de cierre

1. Verificar que `scankey-motor` existe y responde `/health` (con token)
2. Configurar `MOTOR_URL` en `scankey-gateway` apuntando a la URL del motor
3. Dar `roles/run.invoker` al SA del gateway sobre el motor
4. Aumentar `TIMEOUT` del gateway si hay cold start (ej. 60–120s)
5. Esperar `model_ready: true` en motor antes de probar analyze-key
6. Probar `/motor/health` desde el gateway (proxy) y luego `POST /api/analyze-key`
