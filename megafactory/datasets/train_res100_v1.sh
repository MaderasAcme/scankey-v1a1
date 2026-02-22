#!/usr/bin/env bash
set -Eeuo pipefail

echo "--- RES100_V1 TRAIN ---"

# 1) Valida 30/30 (si falla, aborta)
python3 megafactory/datasets/validate_res100_v1.py --min-per-side 30
echo "OK: dataset validado 30/30"

# 2) Llama trainer (placeholder por ahora)
python3 -m megafactory.train.train_res100_v1
