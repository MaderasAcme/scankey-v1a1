import io, re, time
from typing import Dict, Any, List, Tuple

from PIL import Image, ImageOps, ImageFilter
import numpy as np

# pytesseract ya te está funcionando (porque devuelve texto), así que lo usamos bien.
import pytesseract

ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
ALNUM_RE = re.compile(r"[A-Z0-9]+")

def _otsu_threshold(gray_np: np.ndarray) -> int:
    # gray_np: uint8 2D
    hist = np.bincount(gray_np.ravel(), minlength=256).astype(np.float64)
    total = gray_np.size
    sum_total = np.dot(np.arange(256), hist)
    sumB = 0.0
    wB = 0.0
    varMax = -1.0
    threshold = 127
    for t in range(256):
        wB += hist[t]
        if wB == 0:
            continue
        wF = total - wB
        if wF == 0:
            break
        sumB += t * hist[t]
        mB = sumB / wB
        mF = (sum_total - sumB) / wF
        varBetween = wB * wF * (mB - mF) ** 2
        if varBetween > varMax:
            varMax = varBetween
            threshold = t
    return int(threshold)

def _preprocess_variants(img: Image.Image) -> List[Tuple[str, Image.Image]]:
    # Normaliza
    if img.mode not in ("RGB", "RGBA", "L"):
        img = img.convert("RGB")
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255,255,255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    if img.mode != "L":
        imgL = img.convert("L")
    else:
        imgL = img

    # Upscale (clave para grabados / texto pequeño)
    w, h = imgL.size
    scale = 2 if max(w, h) < 1200 else 1
    if scale != 1:
        imgL = imgL.resize((w*scale, h*scale), Image.Resampling.LANCZOS)

    # Autocontrast + sharpen
    base = ImageOps.autocontrast(imgL, cutoff=1)
    base = base.filter(ImageFilter.UnsharpMask(radius=2, percent=180, threshold=3))

    # Binarizado Otsu
    npg = np.array(base).astype(np.uint8)
    thr = _otsu_threshold(npg)
    bw = (npg > thr).astype(np.uint8) * 255
    bw_img = Image.fromarray(bw, mode="L")

    inv_bw_img = ImageOps.invert(bw_img)

    # Otra variante: equalize
    eq = ImageOps.equalize(imgL).filter(ImageFilter.UnsharpMask(radius=2, percent=160, threshold=3))

    return [
        ("base", base),
        ("bw", bw_img),
        ("inv_bw", inv_bw_img),
        ("eq", eq),
    ]

def _tess_data(img: Image.Image, lang: str, psm: int, whitelist: str) -> Dict[str, Any]:
    config = f'--oem 1 --psm {psm} -c tessedit_char_whitelist="{whitelist}"'
    data = pytesseract.image_to_data(img, lang=lang, config=config, output_type=pytesseract.Output.DICT)

    tokens = []
    confs = []
    n = len(data.get("text", []))
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        # limpia basura
        txt_u = txt.upper()
        txt_u = re.sub(r"[^A-Z0-9]", "", txt_u)
        if not txt_u:
            continue
        tokens.append(txt_u)
        try:
            c = float(data["conf"][i])
            if c >= 0:
                confs.append(c)
        except Exception:
            pass

    text = " ".join(tokens).strip()
    avg_conf = float(sum(confs) / len(confs)) if confs else 0.0

    # score: confianza + bonus por ratio alfanumérico
    alnum_len = sum(len(t) for t in tokens)
    raw_len = max(1, len(text))
    ratio = alnum_len / raw_len
    score = avg_conf + (20.0 * ratio)

    return {
        "text": text,
        "tokens": tokens,
        "avg_conf": avg_conf,
        "score": score,
        "psm": psm,
        "lang": lang,
    }

def ocr_image_bytes(image_bytes: bytes, lang: str = "spa+eng", profile: str = "key") -> Dict[str, Any]:
    t0 = time.time()

    img = Image.open(io.BytesIO(image_bytes))
    variants = _preprocess_variants(img)

    # Perfil "key": códigos tipo TE8I, JMA -> SOLO alfanumérico
    if profile == "key":
        # evita que meta signos españoles como "¿"
        lang_use = "eng"
        whitelist = ALNUM
        psms = [7, 6, 8, 11]  # línea, bloque, palabra, sparse
    else:
        # genérico: menos restrictivo
        lang_use = lang or "spa+eng"
        whitelist = ALNUM  # puedes ampliar luego si quieres
        psms = [6, 11, 3]

    best = None
    tried = []

    for vname, vimg in variants:
        for psm in psms:
            try:
                r = _tess_data(vimg, lang_use, psm, whitelist)
                r["variant"] = vname
                tried.append(r)
                if (best is None) or (r["score"] > best["score"]):
                    best = r
            except Exception as e:
                tried.append({"variant": vname, "psm": psm, "err": str(e)})

    out = best or {"text": "", "tokens": [], "avg_conf": 0.0, "score": 0.0}

    dt = time.time() - t0
    # logs útiles en Cloud Run
    print(f"[OCR] bytes={len(image_bytes)} profile={profile} best_variant={out.get('variant')} psm={out.get('psm')} avg_conf={out.get('avg_conf'):.1f} text='{out.get('text','')[:80]}' dt={dt:.3f}s", flush=True)

    return {
        "ok": True,
        "text": out.get("text", ""),
        "avg_conf": float(out.get("avg_conf", 0.0)),
        "tokens": out.get("tokens", []),
        "token_count": int(len(out.get("tokens", []))),
        "meta": {
            "profile": profile,
            "best": {k: out.get(k) for k in ["variant", "psm", "lang", "score"]},
        },
    }
