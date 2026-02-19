import os, json, re
from functools import lru_cache
from pathlib import Path
from collections import Counter

BASE = Path(__file__).resolve().parent
CATALOG_DIR = BASE / "resources" / "catalog"

CANON_CLEAN = CATALOG_DIR / "jma_catalog_refs_canon.clean.json"
CANON_FULL  = CATALOG_DIR / "jma_catalog_refs_canon.json"
VARIANTS_PATH = CATALOG_DIR / "jma_catalog_refs_variants.json"

# Override opcional por env (Cloud Run)
CANON_OVERRIDE = os.getenv("SCN_CATALOG_CANON", "").strip()

TOKEN_RE = re.compile(
    r"\b[A-Z0-9]{1,12}(?:[-/][A-Z0-9]{1,12}){0,4}\b|\b[A-Z]{1,10}\d[A-Z0-9]{0,14}\b",
    re.IGNORECASE
)

NON_ALNUM = re.compile(r"[^A-Z0-9]+")

# Confusiones OCR típicas
CONF = {
    "0": ["O", "Q"],
    "O": ["0", "Q"],
    "Q": ["0", "O"],
    "1": ["I", "L"],
    "I": ["1", "L"],
    "L": ["1", "I"],
    "5": ["S"],
    "S": ["5"],
    "2": ["Z"],
    "Z": ["2"],
    "8": ["B"],
    "B": ["8"],
    "6": ["G"],
    "G": ["6"],
}

def canon(s: str) -> str:
    s = (s or "").upper().strip()
    s = s.replace("/", "-")
    return NON_ALNUM.sub("", s)

def pretty_ref(c: str) -> str:
    """
    Fallback visual:
    - TE8I -> TE-8I
    - TOK83D -> TOK-83D
    - YA300D -> YA-300D
    - U5D -> U5D (sin guion, prefijo 1 letra)
    """
    m = re.match(r"^([A-Z]+)(\d+)([A-Z0-9]*)$", c or "")
    if not m:
        return c
    letters, digits, tail = m.group(1), m.group(2), m.group(3)
    if len(letters) == 1:
        return f"{letters}{digits}{tail}"
    return f"{letters}-{digits}{tail}"

def _expand_slash(tok: str):
    """
    Expande:
    - TIF-15/20 -> TIF-15, TIF-20
    - TE8I/TE8D -> TE8I, TE8D
    - TE8I/D   -> TE8I, TE8D
    """
    if "/" not in tok:
        return [tok]

    tok = tok.strip()

    if "-" in tok:
        a, b = tok.split("-", 1)
        parts = [p.strip() for p in b.split("/") if p.strip()]
        return [f"{a}-{p}" for p in parts] if parts else [tok]

    parts = [p.strip() for p in tok.split("/") if p.strip()]
    if not parts:
        return [tok]

    base = parts[0]
    m = re.match(r"^([A-Z]+\d+)", base, re.IGNORECASE)
    prefix = m.group(1) if m else base

    out = [base]
    for p in parts[1:]:
        if re.match(r"^[A-Z]+", p, re.IGNORECASE):
            out.append(p)
        else:
            out.append(prefix + p)
    return out



@lru_cache(maxsize=1)
def _load_catalog():
    canon_set = set()
    preferred = {}
    rich_ref_db = {} # Initialize as empty

    # Load rich_ref_db from SCN_REF_DB_PATH
    scn_ref_db_path = os.getenv("SCN_REF_DB_PATH", "").strip()
    if scn_ref_db_path:
        ref_db_path = Path(scn_ref_db_path)
        if ref_db_path.exists():
            try:
                with open(ref_db_path, "r", encoding="utf-8") as f:
                    rich_ref_db = json.load(f)
            except Exception:
                # If loading fails, rich_ref_db remains empty
                pass

    paths = []
    if CANON_OVERRIDE:
        paths.append(Path(CANON_OVERRIDE))
    # unión (clean + full)
    paths.extend([CANON_CLEAN, CANON_FULL])

    for p in paths:
        if p and p.exists():
            try:
                lst = json.load(open(p, "r", encoding="utf-8"))
                for x in lst:
                    canon_set.add(str(x).upper())
            except Exception:
                pass

    # Ensure rich_ref_db keys are also in canon_set
    for k in rich_ref_db.keys():
        canon_set.add(k)

    if VARIANTS_PATH.exists():
        try:
            variants = json.load(open(VARIANTS_PATH, "r", encoding="utf-8"))
        except Exception:
            variants = {}
        for k, arr in variants.items():
            k2 = str(k).upper()
            if not isinstance(arr, list) or not arr:
                continue
            arr2 = [str(x).upper() for x in arr]
            arr2.sort(key=lambda x: (0 if "-" in x else 1, len(x)))
            preferred[k2] = arr2[0]

    return canon_set, preferred, rich_ref_db

def _gen_variants(c: str, max_flips: int = 2, max_out: int = 64):
    out = {c}
    positions = [i for i, ch in enumerate(c) if ch in CONF]
    if not positions:
        return list(out)

    layer = {c}
    flips = 0
    while flips < max_flips and len(out) < max_out:
        nxt = set()
        for s in layer:
            for i in positions:
                ch = s[i]
                if ch not in CONF:
                    continue
                for alt in CONF[ch]:
                    ss = s[:i] + alt + s[i+1:]
                    if ss not in out:
                        nxt.add(ss)
                        out.add(ss)
                        if len(out) >= max_out:
                            break
                if len(out) >= max_out:
                    break
            if len(out) >= max_out:
                break
        if not nxt:
            break
        layer = nxt
        flips += 1

    return list(out)

def extract_tokens(text: str):
    t = (text or "").upper()
    t = t.replace("—", "-").replace("–", "-").replace("_", "-")
    toks = TOKEN_RE.findall(t)

    clean = []
    for x in toks:
        x = x.strip(" ,.;:()[]{}")
        if not x:
            continue
        for y in _expand_slash(x):
            y = y.strip(" ,.;:()[]{}")
            if y:
                clean.append(y)
    return clean

def match_tokens(tokens, manufacturer_hint=None):
    canon_set, preferred, rich_ref_db = _load_catalog()

    hits = []
    for idx, tok in enumerate(tokens):
        c = canon(tok)
        if not c:
            continue

        hit = None
        if c in canon_set:
            hit = c
            match_kind = "exact"
        else:
            hit = None
            match_kind = "confusion"
            for cc in _gen_variants(c):
                if cc in canon_set:
                    hit = cc
                    break

        if hit:
            rich_data = rich_ref_db.get(hit, {}) # Get rich data, or empty dict if not found
            disp = preferred.get(hit) or pretty_ref(hit)
            
            # Prioritize hits that match manufacturer_hint if provided and confident
            score = 1.0 # Base score for a match
            if manufacturer_hint and manufacturer_hint.get("found") and manufacturer_hint.get("confidence", 0) >= 0.85:
                if rich_data.get("brand") and rich_data["brand"].lower() == manufacturer_hint["name"].lower():
                    score += 0.5 # Boost score for matching manufacturer hint

            hits.append({
                "raw": tok,
                "canon": hit,
                "display": disp,
                "index": idx,
                "match_kind": match_kind,
                "rich_data": rich_data, # Include the rich data
                "score": score # Include score for later ranking adjustment
            })

    # únicos por canon (con primer índice)
    uniq = []
    seen = set()
    first_idx = {}
    for h in hits:
        if h["canon"] not in first_idx:
            first_idx[h["canon"]] = h["index"]
        if h["canon"] not in seen:
            seen.add(h["canon"])
            uniq.append(h)

    # best_ref: 1) mayor frecuencia 2) aparece antes 3) más corto 4) score del hint
    best = None
    if hits:
        # 1) prioriza EXACT; si no hay exact, usa todo (incluye confusion)
        exact_hits = [h for h in hits if h.get('match_kind') == 'exact']
        pool = exact_hits if exact_hits else hits
    
        # frecuencia
        cnt = Counter([h['canon'] for h in pool])
    
        # 2) aparece antes (index menor)
        first_pos = {}
        for h in pool:
            c = h['canon']
            idx = int(h.get('index', 10**9))
            if c not in first_pos or idx < first_pos[c]:
                first_pos[c] = idx
        
        # 3) score (del hint)
        score_map = {h['canon']: h['score'] for h in pool}
        
        # 4) más corto (y estable)
        best = sorted(
            cnt.items(),
            key=lambda kv: (-score_map.get(kv[0], 0), -kv[1], first_pos.get(kv[0], 10**9), len(kv[0]), kv[0])
        )[0][0]
    return {
        "tokens_raw": tokens,
        "catalog_hits": hits,
        "catalog_hits_unique": uniq,
        "catalog_hits_count": len(hits),
        "catalog_unique_count": len(uniq),
        "best_ref": (preferred.get(best) or pretty_ref(best)) if best else None,
        "best_ref_canon": best,
        "best_ref_rich_data": rich_ref_db.get(best, {}) # Include rich data for best ref
    }

def match_text(text: str, manufacturer_hint=None):
    return match_tokens(extract_tokens(text), manufacturer_hint)

