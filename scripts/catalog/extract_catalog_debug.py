import json, re
from pathlib import Path
from pypdf import PdfReader

pdf_path = Path("backend/resources/catalog/_src/catalogo-llaves-c12.pdf")
out_canon = Path("backend/resources/catalog/jma_catalog_refs_canon.json")
out_variants = Path("backend/resources/catalog/jma_catalog_refs_variants.json")
out_report = Path("backend/resources/catalog/_extract_report.txt")

NON_ALNUM = re.compile(r"[^A-Z0-9]+")
TOKEN_RE = re.compile(r"\b[A-Z0-9][A-Z0-9\-/]{1,18}\b")

def canon(s: str) -> str:
    s = s.strip().upper().replace("|","I").replace("¡","I")
    return NON_ALNUM.sub("", s)

def ok_ref(tok: str) -> bool:
    t = tok.upper()
    if not any(c.isdigit() for c in t): return False
    if not any("A" <= c <= "Z" for c in t): return False
    c = canon(t)
    if len(c) < 2 or len(c) > 18: return False
    if c in {"JMA","ESPANA","SPAIN","EURO","EU","PATENT","PATENTADA"}: return False
    return True

r = PdfReader(str(pdf_path))
variants_map = {}
total_tokens = 0
total_ok = 0

for i, page in enumerate(r.pages):
    txt = (page.extract_text() or "").upper()
    txt = txt.replace("—","-").replace("–","-").replace("_","-")
    toks = TOKEN_RE.findall(txt)
    total_tokens += len(toks)
    ok = 0
    for tok in toks:
        tok = tok.strip().strip(",.;:()[]{}")
        if not ok_ref(tok):
            continue
        c = canon(tok)
        if not c:
            continue
        variants_map.setdefault(c, set()).add(tok.replace("/", "-"))
        ok += 1
    total_ok += ok
    if i in (0, 1, 2, 5, 10, 20):
        print(f"[page {i}] text_len={len(txt)} tokens={len(toks)} ok={ok}")

canon_list = sorted(variants_map.keys())
variants_out = {k: sorted(list(v)) for k, v in variants_map.items() if len(v) > 1}

out_canon.write_text(json.dumps(canon_list, ensure_ascii=False), encoding="utf-8")
out_variants.write_text(json.dumps(variants_out, ensure_ascii=False), encoding="utf-8")

report = [
    f"PDF: {pdf_path}",
    f"Pages: {len(r.pages)}",
    f"Total raw tokens scanned: {total_tokens}",
    f"Total ok refs collected: {total_ok}",
    f"Unique canon refs: {len(canon_list)}",
    f"Canon refs with >1 variant: {len(variants_out)}",
]
out_report.write_text("\n".join(report) + "\n", encoding="utf-8")
print("\n".join(report))
