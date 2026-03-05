# Cloudflare — Anti-cache para scankeyapp.com (una interfaz)

## Principio

- **HTML (`/`)** — NO se cachea (evitar "versión antigua" tras deploy)
- **Assets (`/assets/*`)** — Sí se cachean (tienen hash en el nombre)
- **`deploy-ping.txt`** — NO se cachea (verificación de build)

Objetivo: scankeyapp.com como única interfaz; www → apex. Sin tocar backend.

---

## Reglas Cloudflare (Cache Rules)

Aplicar a **apex** y **www**.

### Regla 1: Bypass HTML

| Campo | Valor |
|-------|-------|
| Hostname | `in {scankeyapp.com, www.scankeyapp.com}` |
| Path | `is "/" OR "/index.html"` |
| **Action** | **Bypass cache** |

### Regla 2: Bypass deploy-ping

| Campo | Valor |
|-------|-------|
| Hostname | `in {scankeyapp.com, www.scankeyapp.com}` |
| Path | `equals "/deploy-ping.txt"` |
| **Action** | **Bypass cache** |

---

## Redirect Rule (www → apex)

| Campo | Valor |
|-------|-------|
| When | Hostname equals `www.scankeyapp.com` |
| Then | 301 Permanent Redirect to `https://scankeyapp.com/$1` |

Resultado: `www.scankeyapp.com/foo` → `https://scankeyapp.com/foo`

---

## Purge y debug

1. **Purge Everything** — Una vez tras cambios de reglas o si sospechas caché corrupta.
2. **Development Mode ON** — 10 minutos para comprobar si el problema era caché (no cachea nada).

---

## Señales de verificación

1. Abrir `https://scankeyapp.com/deploy-ping.txt` y comprobar:
   - `DEPLOY_PING=` (timestamp)
   - `COMMIT=` (hash corto)
   - `GATEWAY=` (URL del gateway)

2. En la **UI Perfil Técnico** verificar:
   - Build ID
   - Deploy (timestamp)

---

## Problemas típicos

| Síntoma | Causa | Solución |
|---------|-------|----------|
| "Veo la versión vieja" tras deploy | HTML cacheado | Bypass cache para `/` y `/index.html`; Purge Everything |
| "Cache Everything" activo | Regla global cachea todo | Eliminar o excluir `/` y `/index.html` |
| Resultados diferentes apex vs www | Falta redirect o reglas duplicadas | Aplicar reglas a ambos hostnames; redirect www→apex |
| deploy-ping.txt muestra datos antiguos | Ping cacheado | Bypass cache para `/deploy-ping.txt` |

---

## Checklist reproducible

- [ ] Reglas 1 y 2 configuradas en Cloudflare (Cache Rules)
- [ ] Redirect www→apex configurado
- [ ] Purge Everything tras cambios
- [ ] Verificar `/deploy-ping.txt` sin cache
- [ ] Verificar Perfil Técnico muestra Build ID y Deploy correctos
- [ ] Si persiste "vieja": Development Mode 10 min y comprobar

**DoD P0.4:** Reglas documentadas, checklist reproducible, solución de "veo la vieja" sin tocar código.
