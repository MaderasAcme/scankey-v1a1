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
