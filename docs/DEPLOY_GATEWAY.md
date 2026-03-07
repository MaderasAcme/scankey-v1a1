# Despliegue del Gateway (Cloud Run)

El gateway incluye el endpoint `POST /api/auth/login` para el login del taller.

## GitHub Actions (recomendado)

El workflow `.github/workflows/deploy-gateway.yml` despliega automáticamente en push a `main` cuando cambian:
- `gateway/**`
- `common/**`
- `cloudbuild-gateway.yaml`

**Secrets obligatorios** (Settings → Secrets and variables → Actions):

| Secret | Descripción |
|--------|-------------|
| `GCP_PROJECT_ID` | ID del proyecto GCP (ej. `scankey-dc007`) |
| `GCP_WIF_PROVIDER` | Workload Identity Federation provider (ej. `projects/123456789/locations/global/workloadIdentityPools/...`) |
| `GCP_WIF_SERVICE_ACCOUNT` | Service account para el pool (ej. `scankey-deploy@proyecto.iam.gserviceaccount.com`) |

También se puede lanzar manualmente: Actions → Deploy Gateway to Cloud Run → Run workflow.

## ENV en Cloud Run (OBLIGATORIO para login)

Tras el deploy, configurar en Cloud Run (una sola vez o al cambiar):

```bash
gcloud run services update scankey-gateway --region europe-southwest1 \
  --set-env-vars="WORKSHOP_LOGIN_EMAIL=scankey@scankey.com,WORKSHOP_LOGIN_PASSWORD=1357,WORKSHOP_TOKEN=<token-seguro>"
```

- `WORKSHOP_TOKEN`: genera uno seguro (ej. `openssl rand -hex 32`). Sin esto el login devuelve 503.

## Desplegar manualmente

```bash
# Desde el repo root (requiere gcloud autenticado)
gcloud builds submit --config=cloudbuild-gateway.yaml . --project=TU_PROJECT_ID
```

## Verificar en producción

URL gateway: `https://scankey-gateway-2apb4vvlhq-no.a.run.app`

```bash
curl -X POST "https://scankey-gateway-2apb4vvlhq-no.a.run.app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"scankey@scankey.com","password":"1357"}'
```

- **200** → OK (login configurado y credenciales válidas)
- **401** → credenciales incorrectas
- **503** → login no configurado (falta WORKSHOP_*)
- **404** → gateway viejo sin endpoint (redeployar)
