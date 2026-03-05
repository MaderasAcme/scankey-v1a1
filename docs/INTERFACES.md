# Inventario de interfaces — ScanKey

> **Source of truth web:** `ui-studio` (sirve scankeyapp.com)

## Interfaces detectadas

| Ruta | Tipo | Estado | Publicar |
|------|------|--------|----------|
| `ui-studio/` | Web oficial (Vite + React) | **OFICIAL** | ✅ SÍ |
| `index.html` (raíz) | Landing vieja | NO PUBLICAR | ❌ |
| `docs/index.html` | Landing/docs alternativa | NO PUBLICAR | ❌ |
| `App.js` (raíz) | App móvil Expo | NO PUBLICAR (móvil) | ❌ |
| `ui-studio/App.js` | Expo dentro de ui-studio | NO PUBLICAR (móvil) | ❌ |

## Reglas

- **OFICIAL:** Solo `ui-studio/dist` se publica en GitHub Pages → scankeyapp.com
- **NO PUBLICAR:** Todo lo demás queda en el repo pero nunca se sirve como sitio web
- **Legacy landing archivada, NO se publica:** Raíz y docs/index.html movidos a `docs/legacy_landing/` y `docs/legacy_ui/docs_landing/`. Solo referencia.

## Huellas de verificación en producción

- `https://scankeyapp.com/ui-source.txt` → debe contener `UI_SOURCE=ui-studio`
- `https://scankeyapp.com/deploy-ping.txt` → incluye `COMMIT`, `GATEWAY`, `UI_SOURCE=ui-studio`
