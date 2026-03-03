# Guía de Despliegue - ScanKey Pro

Este documento detalla los pasos para poner el sistema en producción.

## 1. Configuración de Secretos en GitHub
Para que los Workflows funcionen, configura los siguientes **Secrets** en tu repositorio:

### Frontend (GitHub Pages)
- `EXPO_PUBLIC_API_BASE_URL`: URL final de tu servicio en Cloud Run.

### Backend (Cloud Run)
- `GCP_PROJECT_ID`: ID de tu proyecto en Google Cloud.
- `GCP_WIF_PROVIDER`: El provider de Workload Identity Federation (ej. `projects/12345/locations/global/workloadIdentityPools/github/providers/github`).
- `GCP_WIF_SERVICE_ACCOUNT`: Email de la Service Account con permisos de Cloud Run Admin y Storage Object Viewer.
- `CORS_ORIGINS`: Tu URL de GitHub Pages (ej. `https://tu-usuario.github.io`).
- `MODEL_GCS`: Ruta al archivo ONNX en Cloud Storage.
- `LABELS_GCS`: Ruta al archivo JSON de etiquetas en Cloud Storage.

## 2. Despliegue del Backend (Cloud Run)
El despliegue es automático al hacer push a la rama `main` si hay cambios en la carpeta `/backend`.

**Manual:**
1. Navega a `/backend`.
2. Ejecuta: `gcloud run deploy scankey-api --source . --region europe-west1 --allow-unauthenticated`.

## 3. Despliegue del Frontend (Web)
El despliegue se realiza a GitHub Pages automáticamente mediante el workflow `web-gh-pages.yml`.

**Configuración de CORS:**
Es vital que el backend tenga configurado el `CORS_ORIGINS` apuntando a tu URL de GitHub Pages, de lo contrario el navegador bloqueará las peticiones de análisis.

## 4. Verificación Post-Deploy
Ejecuta el script de Smoke Test para asegurar que todo está en orden:
```bash
./scripts/smoke_test.sh https://tu-api-cloud-run.a.run.app
```

## 5. Rotación de Credenciales
Si alguna vez se subió información sensible al repositorio:
1. Elimina el archivo o contenido.
2. Limpia el historial de Git (opcional pero recomendado para purga total).
3. **Revoca y rota** el secreto en el panel de control correspondiente.
