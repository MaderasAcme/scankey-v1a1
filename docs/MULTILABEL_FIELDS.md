# Multi-label Fase 2 — Taxonomía oficial de campos

**ScanKey KeyResult**: identidad principal (top1/top2/top3) + atributos multi-label opcionales.

## Regla principal
- **NO romper** flujo single-class. Si el backend/modelo no devuelve multi-label, todo sigue funcionando.
- `tags` es el campo oficial; `compatibility_tags` es legacy (misma semántica).
- Si un atributo no viene, queda `null` o `[]`. No inventar.

---

## Lista oficial

### A) Obligatorios (fase inicial real)
| Campo        | Tipo       | Significado                          | Policy/Risk |
|-------------|------------|--------------------------------------|-------------|
| type        | string     | Tipo de llave (Serreta, etc.)        | —           |
| orientation | string     | Orientación normalizada              | Sí (si contradice top1) |
| patentada   | bool       | Llave patentada                      | Sí (riesgo legal ↑) |
| head_color  | string     | Color del cabezal                    | —           |
| visual_state| string     | Estado visual                        | —           |
| tags        | string[]   | Tags de compatibilidad (array)       | —           |

### B) Recomendados
| Campo             | Tipo   | Significado                         | Policy/Risk |
|-------------------|--------|-------------------------------------|-------------|
| brand_head_text   | string | Texto marca en cabezal              | Sí (contradicción con OCR/top1 → warning) |
| brand_blade_text  | string | Texto marca en hoja                 | Sí (idem)   |
| brand_visible_zone| enum   | head \| blade \| both \| none       | —           |
| ocr_brand_guess   | string | Marca inferida por OCR              | Sí (consistencia) |
| head_shape        | string | Forma del cabezal                   | —           |
| blade_profile     | string | Perfil de la hoja                   | —           |
| tip_shape         | string | Forma de la punta                   | —           |
| side_count        | int    | Número de lados                     | —           |
| symmetry          | bool   | Simetría                            | —           |
| wear_level        | enum   | low \| medium \| high               | —           |
| high_security     | bool   | Alta seguridad                      | Sí (mensajes más claros) |
| requires_card     | bool   | Requiere tarjeta                    | Sí (idem)   |

### C) Experimentales
| Campo             | Tipo   | Significado                         | Policy/Risk |
|-------------------|--------|-------------------------------------|-------------|
| oxidation_present | bool   | Oxidación presente                  | —           |
| surface_damage    | bool   | Daño superficial                    | —           |
| material_hint     | string | Pista de material                   | —           |
| restricted_copy   | bool   | Copia restringida                   | —           |
| text_visible_head | string | Texto visible en cabezal            | —           |
| text_visible_blade| string | Texto visible en hoja               | —           |
| structural_notes  | string | Notas estructurales                 | —           |

---

## Fase 3 — Consistency / Risk / Policy

Campos que **ya influyen** en consistency_score, risk y policy:

| Campo              | Consistency | Risk                          | Policy                           |
|--------------------|-------------|-------------------------------|----------------------------------|
| orientation        | ✓ match/conflict | orientation_conflict +12    | WARN si conflictos                |
| patentada          | ✓ legal_restriction | legal_restriction +12   | Mensaje legal en user_message     |
| high_security      | ✓ security_restriction | +6                      | —                                 |
| requires_card      | ✓ security_restriction | +6                      | —                                 |
| brand_head_text    | ✓ brand_match/conflict | brand_conflict +18      | —                                 |
| brand_blade_text   | ✓ brand_match/conflict | idem                     | —                                 |
| ocr_brand_guess    | ✓ brand_match/conflict | idem                     | —                                 |
| tags / type        | ✓ type_tag_match/conflict | type_tag_conflict +6 | —                                 |
| visual_state       | ✓ visual_degradation | visual_degradation +4       | —                                 |
| wear_level         | ✓ visual_degradation | idem                         | —                                 |

Campos **solo informativos** (UI): head_color, head_shape, blade_profile, tip_shape, side_count, symmetry, brand_visible_zone, experimentales.

---

## Fallback single-class
- Si `labels_count <= 1` o no vienen atributos multi-label → UI funciona igual, sin secciones vacías.
- Si vienen solo algunos campos → mostrar solo esos. No exigir el resto.
- `tags` y `compatibility_tags` siempre array (vacío si no hay).

---

## Fase 4 — Capacidad real, health y activación controlada

### multi_label_enabled
- **Significado**: El backend/modelo soporta atributos multi-label reales.
- **Detalle**: `true` solo si:
  - `labels_count > 1`, O
  - Existe metadata explícita (`model_meta.json`) con `multi_label_enabled: true`.
- **Regla**: El sistema NO debe “parecer multi-label” si el backend no lo soporta realmente.

### supported vs present
- **multi_label_fields_supported**: Array de campos que el backend/modelo puede devolver. Viene de `model_meta.json` o de la lista por defecto del pipeline (catalog + normalize).
- **multi_label_fields_present**: Campos realmente presentes en una respuesta concreta (top1). No se inventan campos ausentes.

### Cómo detectar single-class vs multi-label real
1. Consultar `/health` (motor) o `/motor/health` (gateway).
2. Si `multi_label_enabled === false` → single-class. UI usa fallback, sin ruido.
3. Si `multi_label_enabled === true` → multi-label activo. UI puede mostrar `multi_label_fields_present` en modo taller.

### Metadata del modelo (model_meta.json)
- Opcional. Ruta: mismo directorio que `labels.json` o `MODEL_META_PATH`.
- Formato:
```json
{
  "multi_label_enabled": true,
  "multi_label_fields": ["orientation", "patentada", "head_color", "tags", ...]
}
```
- Modelo viejo sin metadata → single-class (labels_count <= 1).
- Modelo nuevo con metadata → multi-label si `multi_label_enabled: true` o `labels_count > 1`.

---

## Fase 5 — Vocabularios canónicos, provenance, *_meta

### Vocabularios canónicos (common/multilabel_vocab.py)

| Campo              | Valores canónicos                    | Aliases / normalización                     |
|--------------------|--------------------------------------|---------------------------------------------|
| orientation        | left, right, front, back             | izq/izquierda/l → left; der/derecha/r → right |
| brand_visible_zone | head, blade, both, none              | —                                           |
| wear_level         | low, medium, high                    | bajo→low, mediano/medio→medium, alto→high   |
| visual_state       | good, worn, oxidized, damaged        | desgastado→worn, oxidado→oxidized, etc.     |
| type               | Serreta, Cilindro, etc.              | Variantes sin romper compatibilidad         |
| head_color         | lowercase estable                    | —                                           |
| side_count         | int >= 0 o null                      | —                                           |
| patentada, high_security, requires_card, symmetry | bool o null | true/1/yes/si, false/0/no |

### Provenance / Source (common/multilabel_attrs.py)

Fuentes válidas: `model` | `ocr` | `catalog` | `heuristic` | `manual` | `unknown`

- **model**: viene del clasificador/backbone
- **ocr**: viene de OCR (brand_head_text, brand_blade_text, ocr_brand_guess)
- **catalog**: viene de catálogo
- **heuristic**: inferencia/normalización auxiliar
- **manual**: corrección manual
- **unknown**: no se sabe

### Campos con *_meta

Para cada atributo relevante existe:
- **campo plano** (legacy): valor directo
- **campo_meta** (opcional): `{ value, confidence?, source }`

Campos con *_meta: orientation, patentada, head_color, visual_state, brand_head_text, brand_blade_text, brand_visible_zone, ocr_brand_guess, head_shape, blade_profile, tip_shape, side_count, symmetry, wear_level, high_security, requires_card.

Ejemplo:
```json
{
  "orientation": "left",
  "orientation_meta": { "value": "left", "confidence": 0.92, "source": "model" }
}
```

### Reglas de source esperadas

| Origen              | source   |
|---------------------|----------|
| Modelo/clasificador | model    |
| OCR                 | ocr      |
| Catálogo            | catalog  |
| Inferencia auxiliar | heuristic|
| Corrección manual   | manual   |
| Desconocido         | unknown  |

### tags

`tags` se mantiene simple por ahora, sin `tags_meta`. Pendiente Fase 6 si se requiere trazabilidad por tag.

### Consistency / Risk / Policy

- Fase 3 sin reescribir.
- **Fase 6** implementa fusión por confianza (ver sección siguiente).

---

## Fase 6 — Fusión por confianza (confidence-aware fusion)

### Regla principal

- **No disparar** conflictos duros con evidencia débil.
- **Sí reforzar** señales con evidencia fuerte y confiable.
- **Single-class sin meta** sigue funcionando como antes (evidencia implícita suficiente).

### Fuentes ordenadas por fiabilidad

| source     | Peso   |
|------------|--------|
| manual     | muy fuerte |
| model      | fuerte |
| catalog    | media-fuerte |
| ocr        | media |
| heuristic  | débil-media |
| unknown    | débil |

### Confidence

| Rango      | Fuerza |
|------------|--------|
| >= 0.85    | fuerte |
| 0.60–0.84  | media |
| < 0.60     | débil |

### Cuándo un conflicto es fuerte o débil

- **Conflicto fuerte**: source en (manual, model, catalog) y confidence >= 0.85. Penalización completa en consistency, risk y policy.
- **Conflicto suave (medio)**: evidencia media (ej. ocr con conf 0.70). Penalización reducida.
- **Evidencia débil**: source heuristic/unknown o confidence < 0.60. No conflicto duro; como mucho `evidence_notes` informativa.

### Ejemplos

- `brand_conflict` con OCR confidence 0.45 → **no** conflicto fuerte; solo nota informativa.
- `brand_conflict` con model/manual confidence 0.92 → conflicto fuerte.
- `orientation_conflict` con evidencia baja en alguna orientación → conflicto débil o ninguno.
- `legal_restriction` / `security_restriction` con source fuerte → impacto claro.
- Sin `*_meta` (legacy/single-class) → se asume evidencia suficiente; comportamiento previo.

### Helpers (common/multilabel_evidence.py)

- `get_attr_meta(item, field_name)`
- `meta_confidence(item, field_name, default=None)`
- `meta_source(item, field_name, default="unknown")`
- `is_strong_evidence(field_name, meta)`
- `is_weak_evidence(field_name, meta)`

### Debug (Fase 6)

- `consistency_strong_conflicts`: conflictos con evidencia fuerte.
- `consistency_weak_conflicts`: conflictos con evidencia media.
- `evidence_notes`: notas informativas (ej. "brand_conflict: evidencia débil OCR, no conflicto duro").
