#!/usr/bin/env python3
import argparse, json, os, re, shutil, sys
from collections import defaultdict
from pathlib import Path

SUPPORTED_EXT_DEFAULT = "jpg,jpeg,png,webp,heic,heif"

REPO_ROOT = Path(__file__).resolve().parents[2]
LABELS_FILE_DEFAULT = REPO_ROOT / "megafactory/labels/RES100_V1.labels.json"
DEFAULT_INBOX = Path(os.path.expanduser("~/WORK/scankey/train_inbox/READY"))
DEFAULT_DATASET_ROOT = Path(os.path.expanduser("~/WORK/scankey/datasets/v2_res100_v1"))

SIDE_RE = re.compile(r"^(?P<label>.+?)[_-](?P<side>[AB])$", re.IGNORECASE)

def load_labels(p: Path):
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("labels.json debe ser una lista JSON")
    # canonical set (mayúsculas)
    return {str(x).strip().upper() for x in data if str(x).strip()}

def safe_dest_path(dest_dir: Path, filename: str) -> Path:
    # evita overwrite: si existe, añade sufijo _dupNN
    dest_dir.mkdir(parents=True, exist_ok=True)
    cand = dest_dir / filename
    if not cand.exists():
        return cand
    stem = cand.stem
    suf = cand.suffix
    for i in range(1, 10_000):
        alt = dest_dir / f"{stem}_dup{i:04d}{suf}"
        if not alt.exists():
            return alt
    raise RuntimeError(f"Demasiados duplicados para {cand}")

def infer_label_side(file_path: Path, explicit_side: str | None, valid_labels: set[str]):
    base = file_path.stem.strip()
    m = SIDE_RE.match(base)
    if m:
        lab = m.group("label").strip().upper()
        side = m.group("side").strip().upper()
        return lab, side

    # si no hay _A/_B: usamos --side si existe
    if explicit_side:
        side = explicit_side.upper()
        # 1) si el padre es label válido, úsalo (inbox/<LABEL>/foto.jpg)
        parent = file_path.parent.name.strip().upper()
        if parent in valid_labels:
            return parent, side
        # 2) si el nombre del archivo coincide con label
        if base.upper() in valid_labels:
            return base.upper(), side
        # 3) último recurso: el base como label (se validará luego)
        return base.upper(), side

    return None, None

def parse_args():
    ap = argparse.ArgumentParser(description="Importador RES100_V1 (serreta+dimple).")
    ap.add_argument("--inbox", default=str(DEFAULT_INBOX), help="Origen (default READY).")
    ap.add_argument("--dataset-root", default=str(DEFAULT_DATASET_ROOT), help="Destino dataset root.")
    ap.add_argument("--labels", default=str(LABELS_FILE_DEFAULT), help="labels.json RES100_V1.")
    ap.add_argument("--ext", default=SUPPORTED_EXT_DEFAULT, help="Ext permitidas csv (sin puntos).")
    ap.add_argument("--min-per-side", type=int, default=0, help="Solo para marcar estado en resumen.")
    ap.add_argument("--side", choices=["A","B"], help="Fuerza lado si el filename no trae _A/_B.")

    g = ap.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="Simula (default si no pones --move/--copy).")
    g.add_argument("--move", action="store_true", help="Mueve archivos al dataset.")
    g.add_argument("--copy", action="store_true", help="Copia archivos al dataset.")
    return ap.parse_args()

def main():
    args = parse_args()

    inbox = Path(os.path.expanduser(args.inbox))
    dataset_root = Path(os.path.expanduser(args.dataset_root))
    labels_path = Path(os.path.expanduser(args.labels))

    valid_ext = {f".{e.strip().lower()}" for e in args.ext.split(",") if e.strip()}
    valid_labels = load_labels(labels_path)

    # default dry-run si no se pide acción
    do_move = bool(args.move)
    do_copy = bool(args.copy)
    dry_run = bool(args.dry_run) or (not do_move and not do_copy)

    action = "DRY-RUN"
    if do_copy: action = "COPY"
    if do_move: action = "MOVE"

    print(f"action={action} inbox={inbox} dataset_root={dataset_root}")
    print(f"labels={labels_path} labels_count={len(valid_labels)} ext={sorted(valid_ext)}")

    if not inbox.exists():
        print(f"ERROR: inbox no existe: {inbox}", file=sys.stderr)
        return 2

    processed = 0
    skipped = 0
    errors = []
    touched = set()
    counts = defaultdict(lambda: {"A": 0, "B": 0})

    for fp in inbox.rglob("*"):
        if not fp.is_file():
            continue
        if fp.suffix.lower() not in valid_ext:
            skipped += 1
            continue

        label, side = infer_label_side(fp, args.side, valid_labels)
        if not label or not side:
            skipped += 1
            errors.append(f"SKIP {fp.name}: no pude inferir label/lado (usa _A/_B o --side)")
            continue

        if label not in valid_labels:
            skipped += 1
            errors.append(f"SKIP {fp.name}: label '{label}' no está en RES100_V1")
            continue

        dest_dir = dataset_root / label / side
        dest_path = safe_dest_path(dest_dir, fp.name)

        touched.add(label)
        counts[label][side] += 1
        processed += 1

        if dry_run:
            continue

        try:
            if do_copy:
                shutil.copy2(fp, dest_path)
            elif do_move:
                shutil.move(fp, dest_path)
        except Exception as e:
            errors.append(f"ERR {fp.name} -> {dest_path}: {e}")

    print("\n--- SUMMARY ---")
    print(f"processed={processed} skipped={skipped} touched_labels={len(touched)}")
    for lab in sorted(touched):
        a = counts[lab]["A"]; b = counts[lab]["B"]
        status = "OK" if (a >= args.min_per_side and b >= args.min_per_side) else "LOW"
        print(f"{lab}: A={a} B={b} status={status}")

    if errors:
        print("\n--- ISSUES (first 50) ---")
        for e in errors[:50]:
            print(e)
        if len(errors) > 50:
            print(f"... +{len(errors)-50} más")
        return 1

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
