#!/usr/bin/env python3
import argparse, json, os
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True, help="out_v2/model.pt")
    ap.add_argument("--out-dir", required=True, help="out dir")
    ap.add_argument("--opset", type=int, default=17)
    args = ap.parse_args()

    try:
        import torch
        import torch.nn as nn
        from torchvision import models
    except Exception:
        raise SystemExit("Falta torch/torchvision. Instala: pip install torch torchvision")

    ckpt = torch.load(args.ckpt, map_location="cpu")
    labels = ckpt.get("labels") or []
    img = int(ckpt.get("img") or 224)

    m = models.mobilenet_v3_small(weights=None)
    m.classifier[-1] = nn.Linear(m.classifier[-1].in_features, len(labels))
    m.load_state_dict(ckpt["state_dict"])
    m.eval()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    onnx_path = out / "modelo_llaves.onnx"
    dummy = torch.randn(1, 3, img, img)

    torch.onnx.export(
        m,
        dummy,
        str(onnx_path),
        opset_version=args.opset,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    )

    (out / "labels.json").write_text(json.dumps(labels, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK: wrote {onnx_path} and labels.json (labels_count={len(labels)})")

if __name__ == "__main__":
    main()
