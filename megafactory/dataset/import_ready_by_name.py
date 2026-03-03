#!/usr/bin/env python3
from __future__ import annotations
import os, argparse
from pathlib import Path

IMG_EXT={".jpg",".jpeg",".png",".webp"}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--class", dest="label", required=True)
    ap.add_argument("--ready", default=os.path.expanduser("~/WORK/scankey/train_inbox/READY"))
    ap.add_argument("--v2", default=os.path.expanduser("~/WORK/scankey/datasets/v2"))
    args=ap.parse_args()

    ready=Path(args.ready)
    v2=Path(args.v2)/args.label
    (v2/"A").mkdir(parents=True, exist_ok=True)
    (v2/"B").mkdir(parents=True, exist_ok=True)

    movedA=movedB=kept=0
    for p in ready.iterdir():
        if not (p.is_file() and p.suffix.lower() in IMG_EXT):
            continue
        name=p.name.upper()
        if "_A_" in name:
            p.rename(v2/"A"/p.name); movedA += 1
        elif "_B_" in name:
            p.rename(v2/"B"/p.name); movedB += 1
        else:
            kept += 1

    print(f"DONE movedA={movedA} movedB={movedB} kept(no_tag)={kept}")

if __name__=="__main__":
    main()
