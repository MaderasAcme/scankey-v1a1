#!/usr/bin/env python3
import argparse, json, os, sys
from pathlib import Path

IMG_EXT={".jpg",".jpeg",".png",".webp",".heic",".heif"}

def cnt(p: Path)->int:
    if not p.exists(): return -1
    return sum(1 for f in p.iterdir() if f.is_file() and f.suffix.lower() in IMG_EXT)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--labels", default=os.path.expanduser("~/WORK/scankey_app/megafactory/labels/RES100_V1.labels.json"))
    ap.add_argument("--root", default=os.path.expanduser("~/WORK/scankey/datasets/v2_res100_v1"))
    ap.add_argument("--min-per-side", type=int, default=0)
    args=ap.parse_args()

    labels=json.load(open(args.labels))
    root=Path(args.root)

    missing=[]
    low=[]
    total_a=total_b=0

    for lab in labels:
        a=root/lab/"A"
        b=root/lab/"B"
        ca=cnt(a); cb=cnt(b)
        if ca<0 or cb<0:
            missing.append(lab); continue
        total_a+=ca; total_b+=cb
        if ca<args.min_per_side or cb<args.min_per_side:
            low.append((lab,ca,cb))

    print(f"classes={len(labels)} root={root}")
    print(f"total_A={total_a} total_B={total_b}")
    print(f"missing_classes={len(missing)} low_classes={len(low)} min_per_side={args.min_per_side}")

    if args.min_per_side>0 and (missing or low):
        sys.exit(2)

if __name__=="__main__":
    main()
