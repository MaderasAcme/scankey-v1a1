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

---

## Si sigues viendo la vieja

### 1. Verifica dominio

- Entras por **apex** (`scankeyapp.com`) o **www** (`www.scankeyapp.com`)?
- Aplica las reglas a **ambos hostnames**. Si usas www, debe redirigir a apex.

### 2. Quita Page Rules antiguas

- Si tienes **Page Rules** con "Cache Everything", **elimínalas** o excluye `/` y `/index.html`.
- Las Page Rules tienen prioridad y pueden invalidar Cache Rules.

### 3. Cache Rules correctas

| Regla | Hostname | Path | Action |
|-------|----------|------|--------|
| Bypass HTML | `in {scankeyapp.com, www.scankeyapp.com}` | `is "/" OR "/index.html"` | **Bypass cache** |
| Bypass deploy-ping | `in {scankeyapp.com, www.scankeyapp.com}` | `equals "/deploy-ping.txt"` | **Bypass cache** |

### 4. Redirect Rule (www → apex)

| When | Then |
|------|------|
| Hostname equals `www.scankeyapp.com` | 301 Permanent Redirect to `https://scankeyapp.com/$1` |

### 5. Purge + Development Mode

1. **Development Mode** → ON (duración: 10 min). Así Cloudflare no cachea nada.
2. **Purge Everything** → Borra todo el caché.
3. Prueba de nuevo. Si funciona con Dev Mode ON, el problema era caché.

### 6. Verificación automática

Ejecuta desde el repo:

```bash
npm run verify:cache
```

O manualmente:

```bash
bash scripts/verify_cloudflare_cache.sh
```

Si ves `cf-cache-status: HIT` en `/` o `/index.html` → **FAIL** (el HTML no debe cachearse).

### 7. Checklist final (con capturas)

- [ ] Cache Rules aplicadas a apex y www
- [ ] Page Rules sin "Cache Everything" global
- [ ] Redirect www → apex configurado
- [ ] Development Mode 10 min + Purge Everything
- [ ] `npm run verify:cache` pasa (BYPASS o MISS en HTML)
- [ ] Captura de `/deploy-ping.txt` mostrando COMMIT y DEPLOY_PING
- [ ] Captura de Perfil Técnico con Build ID correcto

---

**DoD P0.4:** Reglas documentadas, checklist reproducible, solución de "veo la vieja" sin tocar código.
