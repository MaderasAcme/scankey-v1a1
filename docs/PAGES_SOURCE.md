# GitHub Pages — Origen del deploy

## Resumen
El sitio web se publica con **GitHub Actions** como fuente (no con rama `gh-pages`).

## Variables de producción (obligatorias)

Para que scankeyapp.com use el gateway real (Cloud Run), configura las **Repository variables** en GitHub:

1. Repo → Settings → Secrets and variables → Actions
2. Pestaña **Variables** → New repository variable
3. Añade:
   - **VITE_GATEWAY_BASE_URL** (obligatorio): URL del gateway en Cloud Run, ej. `https://scankey-gateway-xxxxx.run.app`
   - **VITE_API_KEY** (opcional): API key si el gateway la requiere

El build de Pages **fallará** si `VITE_GATEWAY_BASE_URL` está vacío. Las variables de Vite se inyectan en **build-time**; GitHub Pages no puede leer `.env.local` en runtime.

## Settings → Pages (comprobar manualmente)
1. Repo → Settings → Pages
2. **Build and deployment → Source:** debe ser **GitHub Actions** (no "Deploy from a branch")
3. Si estaba en rama `gh-pages`, cámbialo a GitHub Actions para que el workflow `deploy-pages` publique correctamente
4. **Custom domain:** `scankeyapp.com` (y opcionalmente `www.scankeyapp.com`)

## Importante
Si **Source = GitHub Actions**, la rama `gh-pages` **no** es la fuente. El contenido lo publica el workflow `.github/workflows/deploy-pages.yml` mediante:
1. `actions/upload-pages-artifact` (artifact del build)
2. `actions/deploy-pages` (publicación en Pages)

## URLs
| URL | Descripción |
|-----|-------------|
| https://maderasacme.github.io/scankey-v1a1/ | URL estándar de proyecto |
| https://scankeyapp.com | Dominio personalizado |
| https://www.scankeyapp.com | Variante www (si está configurada) |

## Verificación
Tras el deploy, el workflow hace `curl -I` contra `deploy-ping.txt` para comprobar que el contenido se sirve bien. Si hay 404 en el dominio personalizado pero no en `maderasacme.github.io`, el problema suele estar en DNS/Settings del dominio.
