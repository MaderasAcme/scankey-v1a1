from __future__ import annotations
import os, json, time, hashlib
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

try:
    from PIL import Image
    import io
except Exception:
    Image = None
    io = None

DEFAULT_DB = os.environ.get("SIM_DB_PATH", "/tmp/scankey_similarity.jsonl")

def _ahash_from_bytes(img_bytes: bytes) -> str:
    """
    aHash 64-bit (hex) si PIL está disponible; si no, hash de bytes (fallback).
    """
    if Image is None:
        return hashlib.sha256(img_bytes).hexdigest()[:16]

    im = Image.open(io.BytesIO(img_bytes)).convert("L").resize((8, 8))
    px = list(im.getdata())
    avg = sum(px) / len(px)
    bits = 0
    for i, v in enumerate(px):
        if v > avg:
            bits |= (1 << i)
    return f"{bits:016x}"

def _hamming_hex64(a: str, b: str) -> int:
    try:
        return (int(a, 16) ^ int(b, 16)).bit_count()
    except Exception:
        # si es fallback sha (16 hex) también funciona
        return (int(a, 16) ^ int(b, 16)).bit_count()

@dataclass
class SimItem:
    id: str
    h: str
    label: Optional[str]
    ts: float
    meta: Dict[str, Any]

class SimilarityStore:
    def __init__(self, path: str = DEFAULT_DB):
        self.path = path
        self.items: List[SimItem] = []
        self._load()

    def _load(self) -> None:
        self.items = []
        if not os.path.exists(self.path):
            return
        with open(self.path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                    self.items.append(SimItem(
                        id=o["id"], h=o["hash"], label=o.get("label"),
                        ts=o.get("ts", 0.0), meta=o.get("meta", {}) or {}
                    ))
                except Exception:
                    continue

    def ingest(self, img_bytes: bytes, label: Optional[str], meta: Optional[Dict[str, Any]] = None) -> SimItem:
        h = _ahash_from_bytes(img_bytes)
        ts = time.time()
        _id = hashlib.sha1(f"{h}:{ts}".encode("utf-8")).hexdigest()[:12]
        item = SimItem(id=_id, h=h, label=label, ts=ts, meta=meta or {})
        os.makedirs(os.path.dirname(self.path), exist_ok=True) if "/" in self.path else None
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"id": item.id, "hash": item.h, "label": item.label, "ts": item.ts, "meta": item.meta}, ensure_ascii=False) + "\n")
        self.items.append(item)
        return item

    def query(self, img_bytes: bytes, top_k: int = 5) -> List[Dict[str, Any]]:
        h = _ahash_from_bytes(img_bytes)
        scored = []
        for it in self.items:
            d = _hamming_hex64(h, it.h)
            scored.append((d, it))
        scored.sort(key=lambda x: x[0])
        out = []
        for d, it in scored[:max(1, top_k)]:
            out.append({
                "id": it.id,
                "label": it.label,
                "distance": int(d),
                "ts": it.ts,
                "meta": it.meta
            })
        return out
