#!/usr/bin/env python3
"""Auditoría del bloque 02 del catálogo JMA C12."""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

INPUT = Path(__file__).parent / "jma_c12_catalog_part_02.json"
OUT_JSON = Path(__file__).parent / "jma_c12_catalog_part_02_audit.json"
OUT_MD = Path(__file__).parent / "jma_c12_catalog_part_02_audit.md"

# Rango esperado bloque 02
BLOCK_02_PAGE_MIN = 52
BLOCK_02_PAGE_MAX = 84


def is_suspicious_format(id_model_ref: str) -> tuple[bool, str]:
    """Devuelve (es_sospechoso, motivo)."""
    if not id_model_ref or not isinstance(id_model_ref, str):
        return True, "vacío_o_no_string"
    s = id_model_ref.strip()
    if not s:
        return True, "solo_espacios"
    if len(s) > 50:
        return True, "muy_largo"
    # Formato típico: dígitos, guiones, letras, puntos, slash (subvariantes JMA)
    typical = re.match(r"^[\w\-\./]+$", s)
    if not typical:
        return True, "caracteres_raros"
    # Espacios en medio
    if " " in s:
        return True, "contiene_espacios"
    # Múltiples guiones o puntos extraños
    if s.count("-") > 3 or s.count(".") > 2:
        return True, "demasiados_separadores"
    return False, ""


def main():
    with open(INPUT, encoding="utf-8") as f:
        data = json.load(f)

    refs = data.get("refs", [])
    total = len(refs)

    # 0. Verificación de contaminación (páginas fuera de 52-84)
    catalog_pages = [r.get("catalog_page") for r in refs if r.get("catalog_page") is not None]
    out_of_range = [p for p in catalog_pages if p < BLOCK_02_PAGE_MIN or p > BLOCK_02_PAGE_MAX]
    if out_of_range:
        unique_bad = sorted(set(out_of_range))
        raise SystemExit(
            f"CONTAMINACIÓN: Páginas fuera del rango 52-84: {unique_bad[:30]}{'...' if len(unique_bad) > 30 else ''}\n"
            f"Total fuera de rango: {len(out_of_range)}. Detener."
        )

    # 1. id_model_ref únicos
    id_values = [r.get("id_model_ref") for r in refs]
    unique_ids = set(id_values)
    unique_count = len(unique_ids)

    # 2. Duplicados exactos por id_model_ref
    id_counts = Counter(id_values)
    duplicates = {k: v for k, v in id_counts.items() if v > 1}
    dup_examples = {}
    for dup_id in duplicates:
        indices = [i for i, r in enumerate(refs) if r.get("id_model_ref") == dup_id]
        dup_examples[dup_id] = {"count": duplicates[dup_id], "indices_sample": indices[:5]}

    # 3. Referencias con formato raro o sospechoso
    suspicious = []
    for i, r in enumerate(refs):
        mid = r.get("id_model_ref")
        ok, reason = is_suspicious_format(mid)
        if ok:
            suspicious.append({
                "index": i,
                "id_model_ref": mid,
                "reason": reason,
                "family": r.get("family"),
                "catalog_page": r.get("catalog_page"),
            })

    # 4. Top 20 family por frecuencia
    families = [r.get("family") for r in refs if r.get("family") is not None]
    top20_family = Counter(families).most_common(20)

    # 5. Referencias por catalog_page
    by_page = defaultdict(int)
    for r in refs:
        p = r.get("catalog_page")
        by_page[p] += 1
    refs_per_page = dict(sorted(by_page.items(), key=lambda x: (-x[1], x[0])))
    page_stats = {
        "pages_with_refs": len(by_page),
        "refs_per_page": refs_per_page,
        "min_refs_page": min(by_page.values()) if by_page else 0,
        "max_refs_page": max(by_page.values()) if by_page else 0,
    }

    # Métricas de resumen
    pages_with_refs = [p for p in catalog_pages if p is not None]
    page_min = min(pages_with_refs) if pages_with_refs else None
    page_max = max(pages_with_refs) if pages_with_refs else None
    distinct_pages = len(set(pages_with_refs))
    needs_review_count = sum(1 for r in refs if r.get("needs_review"))

    # Generar audit JSON
    audit = {
        "source_file": str(INPUT.name),
        "total_refs": total,
        "page_min": page_min,
        "page_max": page_max,
        "distinct_pages": distinct_pages,
        "duplicates_count": len(duplicates),
        "suspicious_count": len(suspicious),
        "needs_review_count": needs_review_count,
        "1_unique_id_model_ref": unique_count,
        "1_duplicates_count": len(duplicates),
        "2_duplicates_by_id": dict(duplicates),
        "2_duplicates_examples": dup_examples,
        "3_suspicious_count": len(suspicious),
        "3_suspicious_list": suspicious,
        "4_top20_family": [{"family": k, "count": v} for k, v in top20_family],
        "5_refs_per_catalog_page": page_stats,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

    # Generar audit MD
    lines = [
        "# Auditoría: jma_c12_catalog_part_02.json",
        "",
        "## 0. Resumen",
        f"- **total_refs**: **{total}**",
        f"- **Página mínima**: **{page_min}**",
        f"- **Página máxima**: **{page_max}**",
        f"- **Páginas distintas**: **{distinct_pages}**",
        f"- **Duplicados**: **{len(duplicates)}**",
        f"- **Formatos sospechosos**: **{len(suspicious)}**",
        f"- **needs_review**: **{needs_review_count}**",
        "",
        "## 1. id_model_ref únicos",
        f"- Total de referencias: **{total}**",
        f"- id_model_ref únicos: **{unique_count}**",
        f"- Diferencia (posibles duplicados): **{total - unique_count}**",
        "",
        "## 2. Duplicados exactos por id_model_ref",
        f"- Cantidad de ids duplicados: **{len(duplicates)}**",
        "",
    ]

    if duplicates:
        lines.append("| id_model_ref | repeticiones |")
        lines.append("|--------------|--------------|")
        for mid, cnt in sorted(duplicates.items(), key=lambda x: -x[1])[:30]:
            lines.append(f"| {mid} | {cnt} |")
        if len(duplicates) > 30:
            lines.append(f"| ... | ({len(duplicates) - 30} más) |")
    else:
        lines.append("No hay duplicados exactos.")
    lines.append("")

    lines.extend([
        "## 3. Referencias con formato raro o sospechoso",
        f"- Total sospechosas: **{len(suspicious)}**",
        "",
    ])

    if suspicious:
        lines.append("| index | id_model_ref | motivo | family | catalog_page |")
        lines.append("|-------|--------------|--------|--------|--------------|")
        for s in suspicious[:50]:
            mid = s.get("id_model_ref", "")
            if isinstance(mid, str) and len(mid) > 30:
                mid = mid[:27] + "..."
            lines.append(f"| {s['index']} | {mid} | {s['reason']} | {s.get('family')} | {s.get('catalog_page')} |")
        if len(suspicious) > 50:
            lines.append(f"| ... | ({len(suspicious) - 50} más) |")
    else:
        lines.append("No se detectaron formatos sospechosos.")
    lines.append("")

    lines.extend([
        "## 4. Top 20 family por frecuencia",
        "",
        "| family | count |",
        "|--------|-------|",
    ])
    for fam, cnt in top20_family:
        lines.append(f"| {fam} | {cnt} |")
    lines.append("")

    lines.extend([
        "## 5. Referencias por catalog_page",
        "",
        f"- Páginas con referencias: **{page_stats['pages_with_refs']}**",
        f"- Mín refs por página: **{page_stats['min_refs_page']}**",
        f"- Máx refs por página: **{page_stats['max_refs_page']}**",
        "",
        "### Distribución (por página, ordenada por count desc)",
        "",
        "| catalog_page | count |",
        "|--------------|-------|",
    ])
    for page, cnt in list(refs_per_page.items())[:40]:
        lines.append(f"| {page} | {cnt} |")
    if len(refs_per_page) > 40:
        lines.append(f"| ... | ({len(refs_per_page) - 40} páginas más) |")
    lines.append("")
    lines.append("---")
    lines.append("*Generado por audit_block_02.py*")

    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("Auditoría completada.")
    print(f"  - {OUT_JSON}")
    print(f"  - {OUT_MD}")
    print(f"\nResumen: total_refs={total}, página_min={page_min}, página_max={page_max}, "
          f"páginas_distintas={distinct_pages}, duplicados={len(duplicates)}, "
          f"sospechosos={len(suspicious)}, needs_review={needs_review_count}")


if __name__ == "__main__":
    main()
