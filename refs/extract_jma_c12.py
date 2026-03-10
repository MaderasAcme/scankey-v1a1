#!/usr/bin/env python3
"""
Extrae referencias JMA del catálogo C12 desde el texto de los PDFs.
Fuente: data/raw/catalogs/c12/catalogo-llaves-c12.pdf
No inventa datos. Marca dudosas con needs_review.
Salida: jma_c12_catalog_part_01.json
"""
import json
import re
from pathlib import Path

# Rutas
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = PROJECT_ROOT / "data" / "raw" / "catalogs" / "c12" / "catalogo-llaves-c12.pdf"
OUT_PATH = Path(__file__).parent / "jma_c12_catalog_part_01.json"

# Patrones que NO son referencias JMA
SKIP_PATTERNS = {
    "1-18", "2 of 18", "3 of 18", "4 of 18", "5 of 18", "6 of 18", "7 of 18", "8 of 18",
    "9 of 18", "10 of 18", "11 of 18", "12 of 18", "13 of 18", "14 of 18", "15 of 18",
    "16 of 18", "17 of 18", "18 of 18", "1 of 7", "2 of 7", "3 of 7", "4 of 7", "5 of 7",
    "6 of 7", "7 of 7", "1 of 25", "2 of 25", "3 of 25", "4 of 25", "5 of 25", "6 of 25",
    "7 of 25", "8 of 25", "9 of 25", "10 of 25", "11 of 25", "12 of 25", "13 of 25",
    "14 of 25", "15 of 25", "16 of 25", "17 of 25", "18 of 25", "19 of 25", "20 of 25",
    "21 of 25", "22 of 25", "23 of 25", "24 of 25", "25 of 25",
    "K01", "K02", "K03", "K04", "K05", "K06", "K07", "K08", "K09",
    "JMA", "ESPANA", "SPAIN", "EURO", "EU", "PATENT", "PATENTADA",
}

# Referencias dudosas (formato atípico o posible error OCR)
DOUBTFUL_PREFIXES = frozenset({"45-", "303-", "333-", "3M-"})


def extract_refs_from_text(text: str, page_num: int | None = None) -> tuple[set[str], dict[str, int]]:
    """Extrae referencias JMA del texto. Retorna (refs, ref_to_page)."""
    text = text.upper().replace("—", "-").replace("–", "-").replace("_", "-")
    refs = set()
    ref_to_page: dict[str, int] = {}
    
    # Formato estándar: XX-NNN, XXX-NN, XXXX-N, con sufijos D,I,P,/, etc.
    for m in re.finditer(r"\b([A-Z]{2,5})-(\d+)([A-Z0-9]*(?:\/[A-Z0-9]+)?)\b", text, re.I):
        full = f"{m.group(1).upper()}-{m.group(2)}{m.group(3).upper()}"
        if full not in SKIP_PATTERNS:
            refs.add(full)
            if page_num is not None and full not in ref_to_page:
                ref_to_page[full] = page_num + 1  # 1-based para legibilidad
    
    # Formato numérico atípico: 45-1, 303-1D, etc. (solo conocidos del catálogo)
    for m in re.finditer(r"\b(\d{2,3})-(\d)([A-Z]?)\b", text):
        full = f"{m.group(1)}-{m.group(2)}{m.group(3)}"
        if full in {"45-1", "45-1D", "45-2D", "45-2", "303-1D", "303-1", "333-1D", "333-2D", "3M-1D"}:
            refs.add(full)
            if page_num is not None and full not in ref_to_page:
                ref_to_page[full] = page_num + 1
    
    return refs, ref_to_page


def build_entry(ref: str, catalog_page: int | None = None) -> dict:
    """Construye la entrada normalizada."""
    is_doubtful = any(ref.startswith(p) for p in DOUBTFUL_PREFIXES)
    prefix = ref.split("-")[0] if "-" in ref else ref[:2]
    return {
        "id_model_ref": ref,
        "brand": "JMA",
        "model": ref,
        "aliases": [],
        "family": prefix,
        "type": "cylinder_special",
        "source": "jma_c12_catalog",
        "source_confidence": "low" if is_doubtful else "high",
        "catalog_page": catalog_page,
        "expected_visible_text": ref,
        "expected_head_markings": None,
        "expected_blade_markings": None,
        "possible_tags": ["JMA", "C12", "K01"],
        "needs_review": is_doubtful,
    }


# Páginas con catálogo de llaves (0-based). Fuente original: p019-025, p026-050.
PAGE_RANGE: range | None = range(18, 51)  # páginas 19-51 (1-based); None = todas


def extract_from_pdf(pdf_path: Path) -> tuple[set[str], dict[str, int]]:
    """Lee el PDF y extrae referencias de las páginas con catálogo de llaves."""
    from pypdf import PdfReader
    
    reader = PdfReader(str(pdf_path))
    all_refs: set[str] = set()
    ref_to_page: dict[str, int] = {}
    
    indices = PAGE_RANGE if PAGE_RANGE is not None else range(len(reader.pages))
    for i in indices:
        if i >= len(reader.pages):
            break
        txt = reader.pages[i].extract_text() or ""
        page_refs, page_map = extract_refs_from_text(txt, i)
        all_refs |= page_refs
        for r, p in page_map.items():
            if r not in ref_to_page:
                ref_to_page[r] = p
    
    return all_refs, ref_to_page


def main():
    if not PDF_PATH.exists():
        raise FileNotFoundError(f"No se encontró el PDF: {PDF_PATH}")
    
    print(f"Leyendo PDF: {PDF_PATH}")
    refs, ref_to_page = extract_from_pdf(PDF_PATH)
    refs = sorted(refs)
    
    entries = [
        build_entry(r, catalog_page=ref_to_page.get(r))
        for r in refs
    ]
    
    doubtful_count = sum(1 for e in entries if e["needs_review"])
    
    pages_str = "19-51" if PAGE_RANGE else "all"
    out = {
        "source": "jma_c12_catalog",
        "catalog": "C12",
        "pages_covered": pages_str,
        "family": "K01",
        "type": "cylinder_and_special_keys",
        "total_refs": len(entries),
        "doubtful_count": doubtful_count,
        "refs": entries,
    }
    
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    
    print(f"Referencias extraídas: {len(entries)}")
    print(f"Dudosas (needs_review): {doubtful_count}")
    print(f"Guardado: {OUT_PATH}")


if __name__ == "__main__":
    main()
