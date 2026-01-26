#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, time
from pathlib import Path

IMG_EXT = {".jpg",".jpeg",".png",".webp"}

def md5_file(p: Path) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def list_images(d: Path):
    if not d.exists(): return []
    return [p for p in d.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT]

def safe_move(src: Path, dst_dir: Path) -> Path:
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / src.name
    if dst.exists():
        stem, suf = src.stem, src.suffix
        dst = dst_dir / f"{stem}__{int(time.time())}{suf}"
    src.rename(dst)
    return dst

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--class", dest="cls", required=True)
    ap.add_argument("--inbox", default=os.path.expanduser("~/WORK/scankey/train_inbox"))
    ap.add_argument("--v1-root", default=os.path.expanduser("~/WORK/scankey/datasets/v1"))
    ap.add_argument("--v2-root", default=os.path.expanduser("~/WORK/scankey/datasets/v2"))
    args = ap.parse_args()

    inbox = Path(args.inbox).expanduser()
    ready = inbox / "READY"
    aux_unsorted = inbox / "BAD" / "AUX" / "UNSORTED"

    v1 = Path(args.v1_root).expanduser() / args.cls
    v2 = Path(args.v2_root).expanduser() / args.cls
    v2A = v2 / "A"
    v2B = v2 / "B"

    v1A = v1 / "A"
    v1B = v1 / "B"

    # mapa md5 -> "A"/"B"
    m = {}
    for p in list_images(v1A):
        m[md5_file(p)] = "A"
    for p in list_images(v1B):
        m[md5_file(p)] = "B"

    ts = time.strftime("%Y-%m-%d_%H%M%S")
    logp = inbox / f"sort_ready_{ts}.jsonl"

    files = list_images(ready)
    movedA = movedB = movedAux = 0

    with logp.open("w", encoding="utf-8") as log:
        for p in files:
            h = md5_file(p)
            side = m.get(h)
            if side == "A":
                dst = safe_move(p, v2A); movedA += 1
                rec = {"src": str(p), "dst": str(dst), "class": args.cls, "side": "A", "reason": "match_v1"}
            elif side == "B":
                dst = safe_move(p, v2B); movedB += 1
                rec = {"src": str(p), "dst": str(dst), "class": args.cls, "side": "B", "reason": "match_v1"}
            else:
                dst = safe_move(p, aux_unsorted); movedAux += 1
                rec = {"src": str(p), "dst": str(dst), "class": args.cls, "side": None, "reason": "unmatched_keep_aux"}
            log.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"✅ DONE: moved A={movedA}  B={movedB}  AUX(unsorted)={movedAux}")
    print(f"🧾 LOG: {logp}")
    print("📊 v2 counts:")
    print("  A:", len(list_images(v2A)))
    print("  B:", len(list_images(v2B)))
    print("📦 inbox READY remaining:", len(list_images(ready)))

if __name__ == "__main__":
    main()
