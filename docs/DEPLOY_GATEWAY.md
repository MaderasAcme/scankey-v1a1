# Despliegue del Gateway (Cloud Run)

El gateway incluye el endpoint `POST /api/auth/login` para el login del taller.

## Requisitos

- **Contexto build**: Repo root (por `common/`). Usar `cloudbuild-gateway.yaml`.
- **Variables ENV** en Cloud Run (obligatorias para login):
  - `WORKSHOP_LOGIN_EMAIL` — email permitido (ej. `scankey@scankey.com`)
  - `WORKSHOP_LOGIN_PASSWORD` — contraseña del taller
  - `WORKSHOP_TOKEN` — token para sesión taller (enviado al frontend en login OK)

## Desplegar

```bash
# Desde el repo root
gcloud builds submit --config=cloudbuild-gateway.yaml .
```

O con el script:
```bash
./scripts/deploy_gateway.sh
```

## Configurar variables de login (primera vez o cambio)

```bash
# Opción 1: Env vars directas (solo desarrollo / pruebas)
gcloud run services update scankey-gateway --region europe-southwest1 \
  --set-env-vars="WORKSHOP_LOGIN_EMAIL=scankey@scankey.com,WORKSHOP_LOGIN_PASSWORD=1357,WORKSHOP_TOKEN=<token-seguro>"

# Opción 2: Secret Manager (producción)
# Crear secretos y referenciar:
gcloud run services update scankey-gateway --region europe-southwest1 \
  --set-secrets="WORKSHOP_LOGIN_EMAIL=workshop-login-email:latest,WORKSHOP_LOGIN_PASSWORD=workshop-login-password:latest,WORKSHOP_TOKEN=workshop-token:latest"
```

## Verificar login en producción

```bash
curl -X POST "https://<GATEWAY_URL>/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"scankey@scankey.com","password":"1357"}'
```

- **200 OK** → login configurado correctamente
- **401** → credenciales incorrectas
- **503** → login no configurado (falta WORKSHOP_* en Cloud Run)
