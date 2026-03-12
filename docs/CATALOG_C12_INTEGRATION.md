# Integración C12 en la capa de catálogo

## Diagnóstico real (Fase 1)

### Archivos de catálogo existentes
| Archivo | Existe | Formato |
|---------|--------|---------|
| `common/resources/catalog/jma_catalog_refs_variants.json` | ✅ | `{canon: [display_variants]}` |
| `common/resources/catalog/jma_catalog_refs_canon.clean.json` | ❌ | Lista de strings canon |
| `common/resources/catalog/jma_catalog_refs_canon.json` | ❌ | Lista de strings canon |
| `common/resources/catalog/jma_c12_ref_db.json` | ✅ (generado) | `{canon: {brand, family, type, model, ...}}` |

### Soporte SCN_REF_DB_PATH
- Sí existe. Si está configurado, **reemplaza** el C12 (no hace merge).
- Si no está configurado, se usa `jma_c12_ref_db.json` por defecto.

### Dónde encaja el C12
- Como `rich_ref_db` en `_load_catalog()`.
- Keys en canon_set para matching.
- preferred display desde `model` del C12.

---

## Archivos tocados

1. **common/catalog_match.py**
   - Añadido `C12_REF_DB`.
   - Carga `jma_c12_ref_db.json` si existe y no hay `SCN_REF_DB_PATH`.
   - preferred display desde rich_data.model.

2. **scripts/catalog/build_c12_ref_db.py** (nuevo)
   - Convierte `refs/jma_c12_catalog_part_*.json` → `common/resources/catalog/jma_c12_ref_db.json`.

3. **common/resources/catalog/jma_c12_ref_db.json** (generado)
   - 4236 referencias JMA del C12.

4. **scripts/catalog/validate_c12_integration.py** (nuevo)
   - Script de validación con ejemplos.

---

## Comandos

```powershell
# Regenerar ref_db desde C12
python scripts/catalog/build_c12_ref_db.py

# Validar integración
python scripts/catalog/validate_c12_integration.py
```

---

## Datos del C12 aprovechados

| Campo C12 | Uso en catalog_match |
|-----------|----------------------|
| brand | manufacturer_hint boost, rich_data en candidatos |
| family | rich_data |
| type | rich_data |
| model | display preferido, rich_data |
| expected_visible_text | rich_data |
| possible_tags | rich_data |
| aliases | rich_data (aún no usado para matching) |

---

## Lo que NO resuelve todavía

1. **CIDL / JMA CIDL**: CIDL no está en el C12 (es seed en `catalog_refs.json`). Para reconocerlo vía catálogo habría que añadirlo a `jma_catalog_refs_variants.json` o a un ref_db que incluya seeds.

2. **OCR → catalog_match**: El flujo actual hace `match_text(top_label)` con el label del modelo. Si hay OCR por low_confidence, el texto OCR se añade al payload pero **no se pasa a catalog_match** para normalización. Para eso haría falta un cambio en `apply_ocr_to_response` o en el motor.

3. **Aliases**: Los aliases del C12 están en rich_data pero no se usan para matching (solo la ref principal).
