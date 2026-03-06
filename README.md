# ScanKey V1A1 (Expo)

**Web oficial:** ui-studio · **Producción:** scankeyapp.com

## Requisitos
- Node 18+
- Expo (se usa vía `npx`)
- Expo Go en el móvil (Android/iOS) o emulador

## Desarrollo local

Desarrollo 100% en local (Windows/WSL). Cloud Shell solo para GCP.

📖 **Documentación completa:** [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)

### 3 one-liners

```bash
npm run stack:up                          # Levantar stack (gateway:8080, motor:8081)
cd ui-studio && npm i && npm run dev      # UI dev
npm -C ui-studio run qa:all               # QA (smoke SKIP si backend apagado)
```

---

## Instalar y ejecutar
```bash
git clone https://github.com/MaderasAcme/scankey-v1a1.git
cd scankey-v1a1
npm i
npx expo start
```

## Deploy / Pages
El sitio web se publica en GitHub Pages (Source: **GitHub Actions**). Ver `docs/PAGES_SOURCE.md` para configuración de Pages, dominio y **variables de producción** (`VITE_GATEWAY_BASE_URL`, `VITE_API_KEY`).

**Troubleshooting caché:** [docs/CLOUDFLARE_CACHE.md](docs/CLOUDFLARE_CACHE.md) — reglas anti-cache y checklist.

**Cómo verificar versión:** `deploy-ping.txt` + `ui-source.txt` en producción (https://scankeyapp.com/deploy-ping.txt).

## QA

Desde `ui-studio/` ejecuta:

| Comando | Descripción |
|---------|-------------|
| `npm run qa:contract` | Valida el contrato básico (respuestas API) |
| `npm run qa:secrets` | Busca fugas de secretos (claves, tokens, credentials.json, recovery codes) |
| `npm run qa:smoke` | Prueba de salud del backend |
| `npm run qa:pages` | Verifica que Pages use `upload-pages-artifact` y `actions/deploy-pages` (no workflows legacy) |
| `npm run qa:all` | Ejecuta toda la suite: contract + secrets + smoke (SKIP si backend off) + pages + no-ts |
| `RUN_SMOKE=1 npm run qa:smoke` | Smoke contra localhost:8080 (requiere stack levantado) |

**Windows:** qa:secrets, qa:smoke, qa:pages usan Bash → usa WSL o Git Bash.

```bash
cd ui-studio
npm run qa:all
```
