# Informe de consistencia: jma_c12_catalog_part_01.json

**Fecha:** 2025-03-10  
**Objetivo:** Validar si el JSON corresponde realmente al bloque 01 (páginas 19-51) o a un dataset mezclado.

---

## 1. Resultado directo

### ¿Este JSON es realmente el bloque 01?

# **NO**

### Respuesta inequívoca

El archivo `refs/jma_c12_catalog_part_01.json` **NO** es el bloque 01. Contiene referencias de **todo el catálogo** (o gran parte de él), no solo de las páginas 19-51.

---

## 2. Datos del JSON analizado

| Métrica | Valor |
|---------|-------|
| **total_refs** | 6.264 |
| **Página mínima** | 21 |
| **Página máxima** | 318 |
| **Páginas distintas** | 259 |
| **pages_covered** (metadato) | `null` |

### Distribución por rango

| Rango | Referencias | % del total |
|-------|-------------|-------------|
| **En rango 19-51** (bloque 01 esperado) | 1.881 | 30,0 % |
| **Fuera del rango** (páginas 52-318, etc.) | 4.383 | 70,0 % |

### Páginas fuera del rango esperado

El JSON contiene referencias de **~207 páginas distintas fuera del rango 19-51**, entre ellas: 52-93, 95-209, 222-293, 300-312, 318.

---

## 3. Comparación con lo esperado del bloque 01

| Esperado | Real |
|----------|------|
| Páginas 19-51 | Páginas 21-318 |
| ~33 páginas | 259 páginas distintas |
| Extracción parcial | **Extracción del catálogo completo** (o casi) |

### Marcado de inconsistencia

**INCONSISTENTE**: El JSON contiene páginas muy fuera del rango 19-51. Hay 4.383 referencias asignadas a páginas que no pertenecen al bloque 01.

---

## 4. Análisis del extractor `extract_jma_c12.py`

### PDF que lee exactamente

```python
PDF_PATH = PROJECT_ROOT / "data" / "raw" / "catlogs" / "c12" / "catalogo-llaves-c12.pdf"
```

- Ruta codificada: `data/raw/catlogs/c12/catalogo-llaves-c12.pdf`
- **Problema:** La ruta usa `catlogs` (typo). La carpeta correcta es `catalogs`.
- Estado: **El archivo no existe** en esa ruta. Existe en `data/raw/catalogs/c12/catalogo-llaves-c12.pdf`.

### Páginas que procesa

```python
PAGE_RANGE: range | None = range(18, 51)  # páginas 19-51 (1-based)
```

- Con `PAGE_RANGE = range(18, 51)`:
  - Índices 0-based: 18–50
  - Páginas 1-based: 19–51
- Si `PAGE_RANGE = None`: procesa **todas** las páginas del PDF (0 a N-1).

### ¿Respeta el rango esperado?

El script sí está configurado para procesar solo 19-51. El problema es que:

1. El JSON actual no pudo haber sido generado por el script con esa configuración, porque contiene páginas 52–318.
2. El script fallaría por `FileNotFoundError` debido al typo en la ruta.
3. El JSON debió generarse con otra configuración (por ejemplo, `PAGE_RANGE = None`) o con otra versión del script en otro entorno.

---

## 5. Qué corregir en el extractor

### 5.1 Corregir ruta del PDF

```python
# Actual (incorrecto)
PDF_PATH = PROJECT_ROOT / "data" / "raw" / "catlogs" / "c12" / "catalogo-llaves-c12.pdf"

# Correcto
PDF_PATH = PROJECT_ROOT / "data" / "raw" / "catalogs" / "c12" / "catalogo-llaves-c12.pdf"
```

### 5.2 No está mezclando por configuración

El código actual está bien para un bloque parcial. Si el JSON está mezclado es porque:

- Se generó con `PAGE_RANGE = None`, o
- Se usó otro script/proceso que procesó todo el PDF.

### 5.3 Pasos para obtener un bloque 01 real

1. Corregir la ruta del PDF: `catlogs` → `catalogs`.
2. Asegurarse de que `PAGE_RANGE = range(18, 51)`.
3. Ejecutar el script para regenerar el JSON.
4. El nuevo JSON debería tener:
   - `total_refs` ≈ 1.881 (o similar, según la extracción)
   - `catalog_page` solo entre 19 y 51
   - `pages_covered`: `"19-51"`

---

## 6. Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| **¿Este JSON es realmente el bloque 01?** | **NO** |
| **¿Sí o no?** | **NO** |
| **¿Qué rango de páginas contiene?** | 21–318 (259 páginas distintas) |
| **¿Qué hay que corregir?** | 1) Ruta del PDF (`catlogs` → `catalogs`); 2) Regenerar el JSON ejecutando el extractor con `PAGE_RANGE = range(18, 51)`. |

---

*Informe generado automáticamente como parte de la validación de consistencia del catálogo JMA C12.*
