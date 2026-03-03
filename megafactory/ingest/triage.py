#!/usr/bin/env python3
from __future__ import annotations
import os, sys, json, time, shutil
from pathlib import Path

# Dependencias “light”
try:
    from PIL import Image
except Exception as e:
    print("❌ Falta Pillow (PIL). Instala: pip install pillow", file=sys.stderr)
    raise

try:
    import numpy as np
except Exception as e:
    print("❌ Falta numpy. Instala: pip install numpy", file=sys.stderr)
    raise

def now_ts() -> str:
    return time.strftime("%Y-%m-%d_%H%M%S")

def is_image(p: Path) -> bool:
    return p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")

def blur_score(gray: np.ndarray) -> float:
    # “Sharpness” simple: varianza del gradiente (sin OpenCV)
    gy = np.abs(np.diff(gray.astype(np.float32), axis=0)).mean()
    gx = np.abs(np.diff(gray.astype(np.float32), axis=1)).mean()
    return float(gx + gy)

def brightness(gray: np.ndarray) -> float:
    return float(gray.mean())

def triage_one(p: Path, min_w: int, min_h: int, blur_min: float, bright_min: float, bright_max: float):
    meta = {"file": str(p), "ok": False, "reason": None, "w": None, "h": None, "blur": None, "bright": None}
    try:
        im = Image.open(p).convert("L")
        w, h = im.size
        meta["w"], meta["h"] = w, h

        arr = np.array(im, dtype=np.uint8)
        meta["blur"] = blur_score(arr)
        meta["bright"] = brightness(arr)

        if w < min_w or h < min_h:
            meta["reason"] = "too_small"
            return "DEAD", meta

        # Si está demasiado oscuro/claro, suele ser recuperable (luz)
        if meta["bright"] < bright_min or meta["bright"] > bright_max:
            meta["reason"] = "bad_exposure"
            return "RECOVERABLE", meta

        # Si blur bajo: normalmente recuperable si no es extremo
        if meta["blur"] < blur_min:
            meta["reason"] = "blurry"
            return "RECOVERABLE", meta

        meta["ok"] = True
        meta["reason"] = "pass"
        return "READY", meta

    except Exception:
        meta["reason"] = "unreadable"
        return "DEAD", meta

def main():
    inbox = Path(os.environ.get("SCN_INBOX", str(Path.home() / "WORK/scankey/train_inbox"))).expanduser()
    raw = inbox / "RAW"
    ready = inbox / "READY"
    bad_rec = inbox / "BAD/RECOVERABLE"
    bad_aux = inbox / "BAD/AUX"
    bad_dead = inbox / "BAD/DEAD"
    for d in (raw, ready, bad_rec, bad_aux, bad_dead):
        d.mkdir(parents=True, exist_ok=True)

    # umbrales (ajustables por env)
    min_w = int(os.environ.get("SCN_MIN_W", "800"))
    min_h = int(os.environ.get("SCN_MIN_H", "600"))
    blur_min = float(os.environ.get("SCN_BLUR_MIN", "18.0"))
    bright_min = float(os.environ.get("SCN_BRIGHT_MIN", "35.0"))
    bright_max = float(os.environ.get("SCN_BRIGHT_MAX", "220.0"))

    dry = "--dry-run" in sys.argv
    log_path = inbox / f"triage_{now_ts()}.jsonl"

    files = [p for p in raw.iterdir() if p.is_file() and is_image(p)]
    if not files:
        print(f"ℹ️ No hay imágenes en {raw}")
        return 0

    moved = 0
    with open(log_path, "w", encoding="utf-8") as f:
        for p in sorted(files):
            bucket, meta = triage_one(p, min_w, min_h, blur_min, bright_min, bright_max)

            # BAD/AUX reservado: por ahora no lo usamos automático (lo dejamos manual)
            dest_dir = {"READY": ready, "RECOVERABLE": bad_rec, "DEAD": bad_dead}.get(bucket, bad_aux)
            dest = dest_dir / p.name

            meta["bucket"] = bucket
            meta["dest"] = str(dest)
            meta["dry_run"] = dry
            f.write(json.dumps(meta, ensure_ascii=False) + "\n")

            if dry:
                print(f"[DRY] {p.name} -> {bucket} ({meta['reason']})")
                continue

            try:
                shutil.move(str(p), str(dest))
                moved += 1
                print(f"✅ {p.name} -> {bucket} ({meta['reason']})")
            except Exception:
                print(f"❌ No pude mover {p}", file=sys.stderr)

    print(f"\n📦 Triage terminado. Movidos: {moved}/{len(files)}")
    print(f"🧾 Log: {log_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
