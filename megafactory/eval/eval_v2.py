#!/usr/bin/env python3
import argparse, json, os
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=os.path.expanduser("~/WORK/scankey/datasets/v2"))
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--out", default="metrics_eval.json")
    ap.add_argument("--img", type=int, default=224)
    ap.add_argument("--limit", type=int, default=0, help="0 = sin límite")
    args = ap.parse_args()

    try:
        import numpy as np
        import onnxruntime as ort
        from PIL import Image
    except Exception:
        raise SystemExit("Falta numpy/onnxruntime/pillow. Instala: pip install numpy onnxruntime pillow")

    labels = json.loads(Path(args.labels).read_text(encoding="utf-8"))
    label2idx = {l:i for i,l in enumerate(labels)}

    # Scan dataset
    root = Path(args.data_root)
    samples = []
    for lab_dir in sorted([p for p in root.iterdir() if p.is_dir()]):
        lab = lab_dir.name.upper()
        if lab not in label2idx:
            continue
        for side in ("A","B"):
            side_dir = lab_dir / side
            if not side_dir.exists():
                continue
            for img in side_dir.rglob("*"):
                if img.suffix.lower() in (".jpg",".jpeg",".png",".webp"):
                    samples.append((str(img), lab))
    if args.limit and len(samples) > args.limit:
        samples = samples[:args.limit]

    sess = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    outn = sess.get_outputs()[0].name

    def preprocess(p):
        im = Image.open(p).convert("RGB").resize((args.img,args.img))
        x = (np.asarray(im).astype("float32") / 255.0)
        x = np.transpose(x, (2,0,1))[None, ...]
        return x

    conf = [[0 for _ in labels] for __ in labels]
    ok = 0
    tot = 0

    for p, lab in samples:
        x = preprocess(p)
        y = label2idx[lab]
        logits = sess.run([outn], {inp: x})[0]
        pred = int(np.argmax(logits, axis=1)[0])
        conf[y][pred] += 1
        ok += (pred == y)
        tot += 1

    acc = float(ok) / max(1, tot)
    payload = {"samples": tot, "labels_count": len(labels), "accuracy": acc, "confusion": conf, "labels": labels}
    Path(args.out).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"OK: acc={acc:.4f} wrote {args.out}")

if __name__ == "__main__":
    main()
