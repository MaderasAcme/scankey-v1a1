#!/usr/bin/env python3
import argparse, json, os, random, time
from pathlib import Path

def _require(pkg):
    try:
        __import__(pkg)
        return True
    except Exception:
        return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=os.path.expanduser("~/WORK/scankey/datasets/v2"),
                    help="Root: v2/<LABEL>/{A,B}/*.jpg")
    ap.add_argument("--out-dir", default="out_v2", help="Output dir")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch", type=int, default=24)
    ap.add_argument("--img", type=int, default=224)
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    if not _require("torch") or not _require("torchvision"):
        raise SystemExit("Falta torch/torchvision. Instala: pip install torch torchvision")

    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
    from torchvision import transforms, models
    from PIL import Image

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    root = Path(args.data_root)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Scan dataset: v2/<LABEL>/{A,B}/images...
    samples = []
    labels = []
    for lab_dir in sorted([p for p in root.iterdir() if p.is_dir()]):
        lab = lab_dir.name.upper()
        for side in ("A", "B"):
            side_dir = lab_dir / side
            if not side_dir.exists():
                continue
            for img in side_dir.rglob("*"):
                if img.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                    samples.append((str(img), lab))
        if lab not in labels:
            labels.append(lab)

    if not samples or len(labels) < 2:
        raise SystemExit(f"Dataset insuficiente. samples={len(samples)} labels={len(labels)}. Necesitas >=2 labels.")

    label2idx = {l:i for i,l in enumerate(labels)}

    # Train/val split
    random.shuffle(samples)
    n = len(samples)
    n_val = max(1, int(0.15 * n))
    val_samples = samples[:n_val]
    tr_samples = samples[n_val:]

    tfm_train = transforms.Compose([
        transforms.Resize((args.img, args.img)),
        transforms.RandomHorizontalFlip(p=0.3),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.10, hue=0.02),
        transforms.ToTensor(),
    ])
    tfm_val = transforms.Compose([
        transforms.Resize((args.img, args.img)),
        transforms.ToTensor(),
    ])

    class KeyDS(Dataset):
        def __init__(self, pairs, tfm):
            self.pairs = pairs
            self.tfm = tfm
        def __len__(self): return len(self.pairs)
        def __getitem__(self, i):
            p, lab = self.pairs[i]
            img = Image.open(p).convert("RGB")
            x = self.tfm(img)
            y = label2idx[lab]
            return x, y

    tr = DataLoader(KeyDS(tr_samples, tfm_train), batch_size=args.batch, shuffle=True, num_workers=2)
    va = DataLoader(KeyDS(val_samples, tfm_val), batch_size=args.batch, shuffle=False, num_workers=2)

    # Model: mobilenet_v3_small finetune head
    m = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    m.classifier[-1] = nn.Linear(m.classifier[-1].in_features, len(labels))

    device = "cuda" if torch.cuda.is_available() else "cpu"
    m = m.to(device)

    opt = torch.optim.AdamW(m.parameters(), lr=3e-4, weight_decay=1e-2)
    loss_fn = nn.CrossEntropyLoss()

    def eval_loop():
        m.eval()
        ok = 0
        tot = 0
        with torch.no_grad():
            for x,y in va:
                x,y = x.to(device), y.to(device)
                logits = m(x)
                pred = logits.argmax(dim=1)
                ok += (pred == y).sum().item()
                tot += y.numel()
        return ok / max(1, tot)

    best = 0.0
    best_path = out / "model.pt"
    t0 = time.time()

    for ep in range(1, args.epochs + 1):
        m.train()
        for x,y in tr:
            x,y = x.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            logits = m(x)
            loss = loss_fn(logits, y)
            loss.backward()
            opt.step()

        acc = eval_loop()
        if acc >= best:
            best = acc
            torch.save({"state_dict": m.state_dict(), "labels": labels, "img": args.img}, best_path)
        print(f"epoch {ep}/{args.epochs} val_acc={acc:.4f} best={best:.4f}")

    # Write labels.json (orden estable)
    (out / "labels.json").write_text(json.dumps(labels, ensure_ascii=False) + "\n", encoding="utf-8")
    (out / "metrics_train.json").write_text(json.dumps({
        "labels_count": len(labels),
        "samples_total": n,
        "samples_train": len(tr_samples),
        "samples_val": len(val_samples),
        "best_val_acc": best,
        "img": args.img,
        "device": device,
        "seconds": round(time.time() - t0, 2),
    }, indent=2) + "\n", encoding="utf-8")

    print(f"OK: saved {best_path} + labels.json in {out}")

if __name__ == "__main__":
    main()
