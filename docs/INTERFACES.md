# Inventario de interfaces — ScanKey

> **Web oficial:** `ui-studio` (scankeyapp.com solo sirve ui-studio/dist)

## Interfaces

| Ruta | Tipo | Estado | Publicar |
|------|------|--------|----------|
| `ui-studio/` | Web oficial (Vite + React) | **OFICIAL** | ✅ SÍ |
| `App.js` (raíz) | App móvil Expo | MÓVIL | ❌ No se publica |
| `docs/legacy_landing/` | Landing vieja (archivada) | Legacy | ❌ No se publica |
| `docs/legacy_ui/docs_landing/` | UI estática alternativa | Legacy | ❌ No se publica |

## Reglas

- **OFICIAL:** Solo `ui-studio/dist` se publica en GitHub Pages → scankeyapp.com
- **MÓVIL:** App.js es la app Expo para Android/iOS. No se publica como web.
- **Legacy:** Archivado en docs/legacy_*. No se publica.

## Huellas de verificación en producción

- `https://scankeyapp.com/ui-source.txt` → debe contener `UI_SOURCE=ui-studio`
- `https://scankeyapp.com/deploy-ping.txt` → incluye DEPLOY_PING, COMMIT, GATEWAY, UI_SOURCE=ui-studio
