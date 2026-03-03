#!/usr/bin/env python3
from __future__ import annotations
import os, argparse
from pathlib import Path

from PIL import Image

IMG_EXT={".jpg",".jpeg",".png",".webp"}

def ahash(p: Path, size=8) -> int:
    im = Image.open(p).convert("L").resize((size,size))
    px = list(im.getdata())
    avg = sum(px)/len(px)
    bits = 0
    for i,v in enumerate(px):
        if v >= avg:
            bits |= (1<<i)
    return bits

def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()

def imgs(d: Path):
    if not d.exists(): return []
    return [p for p in d.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT]

def best_side(p: Path, refA, refB):
    hp = ahash(p)
    best=("A", 9999)
    for rp in refA:
        best = min(best, ("A", hamming(hp, ahash(rp))), key=lambda x:x[1])
    for rp in refB:
        best = min(best, ("B", hamming(hp, ahash(rp))), key=lambda x:x[1])
    return best

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--class", dest="label", required=True)
    ap.add_argument("--aux", default=os.path.expanduser("~/WORK/scankey/train_inbox/BAD/AUX/UNSORTED"))
    ap.add_argument("--v1", default=os.path.expanduser("~/WORK/scankey/datasets/v1"))
    ap.add_argument("--v2", default=os.path.expanduser("~/WORK/scankey/datasets/v2"))
    ap.add_argument("--maxdist", type=int, default=12)
    args=ap.parse_args()

    aux=Path(args.aux)
    v1=Path(args.v1)/args.label
    v2=Path(args.v2)/args.label
    v2A=v2/"A"; v2B=v2/"B"
    v2A.mkdir(parents=True, exist_ok=True); v2B.mkdir(parents=True, exist_ok=True)

    refA=imgs(v1/"A"); refB=imgs(v1/"B")
    if not refA:
        raise SystemExit("No hay refs A en v1")
    if not refB:
        raise SystemExit("No hay refs B en v1 (B=0). No se puede clasificar a B todavía.")

    movedA=movedB=kept=0
    for p in imgs(aux):
        side, dist = best_side(p, refA, refB)
        if dist > args.maxdist:
            print(f"KEEP {p.name} (dist={dist})")
            kept += 1
            continue
        dst = v2A if side=="A" else v2B
        p.rename(dst/p.name)
        print(f"MOVE {p.name} -> {side} (dist={dist})")
        movedA += (side=="A")
        movedB += (side=="B")

    print(f"DONE movedA={movedA} movedB={movedB} kept={kept}")

if __name__=="__main__":
    main()
