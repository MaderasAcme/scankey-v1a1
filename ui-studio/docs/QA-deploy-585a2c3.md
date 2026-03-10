# QA Deploy 585a2c3

**Commit:** `585a2c3338d6a81ecc7915f06085aaf66dc7f0ad`  
**Mensaje:** fix(web): reduce false key_not_detected blocking in quality gate  

**Cambio:** Cuando la llave no se detecta (p. ej. está muy pequeña en el frame) y *no* hay otros problemas graves, ya no se bloquea: se permite capturar con override implícito y se muestra aviso informativo.

---

## Checklist de verificación

### Deploy 585a2c3
- [ ] **Estado visual:** verde o rojo  
  *(¿El flujo permite avanzar o sigue bloqueando con rojo?)*

### Tras recargar / modo incógnito
- [ ] **¿Sigue saliendo rojo?** sí / no  
- [ ] **¿Sale el aviso "La llave se ve pequeña; intentaremos analizar igualmente."?** sí / no  

---

## Comportamiento esperado

| Escenario | Antes | Después |
|-----------|-------|---------|
| `key_not_detected` solo (llave pequeña) | Bloqueo (rojo) | Permitir + aviso info |
| `key_not_detected` + `poor_mask` / `key_incomplete` | Bloqueo | Bloqueo (sin cambios) |
| `critical_glare` | Bloqueo | Bloqueo (sin cambios) |

El aviso "La llave se ve pequeña..." solo debe aparecer cuando:
- El quality gate tiene `key_not_detected` en sus `reasons`, y
- No hay `critical_glare`, `poor_mask` ni `key_incomplete`.
