import os, random, time, hashlib
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

EXTS={".jpg",".jpeg",".png",".webp"}
TARGET=int(os.getenv("TARGET","30"))
ONLY_REF=(os.getenv("ONLY_REF","") or "").strip().upper()
ROOT=Path(os.getenv("DATASET_ROOT", str(Path.home()/ "WORK/scankey/datasets/v2")))

def is_img(p: Path): 
    return p.is_file() and p.suffix.lower() in EXTS

def list_imgs(d: Path, include_aug=False):
    if not d.exists(): return []
    out=[p for p in d.iterdir() if is_img(p)]
    if not include_aug:
        out=[p for p in out if not p.name.startswith("AUG_")]
    return sorted(out)

def quality(p: Path) -> float:
    # “se ve bien”: nitidez + no demasiado oscura/clara
    try:
        im=Image.open(p).convert("L")
        im=ImageOps.exif_transpose(im)
        im.thumbnail((600,600))
        lap = im.filter(ImageFilter.Kernel((3,3), [-1,-1,-1,-1,8,-1,-1,-1,-1], scale=1))
        var=ImageStat.Stat(lap).var[0]
        mean=ImageStat.Stat(im).mean[0]
        return float(var) - abs(mean-135.0)*0.5
    except Exception:
        return -1e9

def augment(im: Image.Image) -> Image.Image:
    im=ImageOps.exif_transpose(im).convert("RGB")

    # pequeños cambios “realistas”
    if random.random()<0.8:
        deg=random.uniform(-3.0, 3.0)
        bg=(255,255,255)
        im=im.rotate(deg, resample=Image.BICUBIC, expand=True, fillcolor=bg)
        # crop al centro para mantener tamaño razonable
        w,h=im.size
        cw,ch=int(w*0.92), int(h*0.92)
        left=(w-cw)//2; top=(h-ch)//2
        im=im.crop((left, top, left+cw, top+ch))

    if random.random()<0.8:
        im=ImageEnhance.Brightness(im).enhance(random.uniform(0.9,1.12))
    if random.random()<0.8:
        im=ImageEnhance.Contrast(im).enhance(random.uniform(0.9,1.18))
    if random.random()<0.6:
        im=ImageEnhance.Sharpness(im).enhance(random.uniform(0.85,1.35))
    if random.random()<0.4:
        r=random.uniform(0.0,0.8)
        if r>0.05:
            im=im.filter(ImageFilter.GaussianBlur(radius=r))

    # limita tamaño para no inflar disco
    im.thumbnail((2048,2048))
    return im

def write_aug(dst_dir: Path, side: str, src: Path, idx: int):
    raw=src.read_bytes()
    h=hashlib.sha256(raw).hexdigest()[:10]
    name=f"AUG_{side}_{int(time.time())}_{h}_{idx:03}.jpg"
    out=dst_dir/name

    im=Image.open(src)
    im=augment(im)
    im.save(out, "JPEG", quality=90, optimize=True)
    return out

def main():
    if not ROOT.exists():
        print("NO DIR:", ROOT)
        return 2

    refs=[d for d in ROOT.iterdir() if d.is_dir()]
    if ONLY_REF:
        refs=[d for d in refs if d.name.upper()==ONLY_REF]

    if not refs:
        print("No hay referencias en:", ROOT)
        return 3

    print("ROOT:", ROOT)
    print("TARGET:", TARGET)
    print()

    for refdir in sorted(refs, key=lambda x: x.name):
        ref=refdir.name
        for side in ("A","B"):
            sdir=refdir/side
            sdir.mkdir(parents=True, exist_ok=True)

            real=list_imgs(sdir, include_aug=False)
            total_now=len(list_imgs(sdir, include_aug=True))

            if len(real)==0:
                print(f"[WARN] {ref}/{side}: 0 reales -> NO relleno (necesitas al menos 1 foto real)")
                continue

            need=max(0, TARGET-total_now)
            if need==0:
                print(f"[OK]   {ref}/{side}: {total_now}/{TARGET} (reales={len(real)})")
                continue

            ranked=sorted(real, key=quality, reverse=True)
            base=ranked[:min(12,len(ranked))]

            for i in range(need):
                src=random.choice(base)
                write_aug(sdir, side, src, i)

            done=len(list_imgs(sdir, include_aug=True))
            print(f"[FILL] {ref}/{side}: {done}/{TARGET} (reales={len(real)} aug={done-len(real)})")

    return 0

if __name__=="__main__":
    raise SystemExit(main())
