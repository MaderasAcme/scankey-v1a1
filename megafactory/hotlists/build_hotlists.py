import json, subprocess, argparse
from collections import Counter, defaultdict
from pathlib import Path

def norm(x: str) -> str:
    return (x or "").strip().upper()

def sh(cmd: str):
    # ejecuta bash -lc para poder usar gsutil cómodo
    p = subprocess.run(["bash","-lc", cmd], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return p.returncode, p.stdout, p.stderr

def dump(counter: Counter, n: int):
    return [{"ref": r, "count": c} for r,c in counter.most_common(n)]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--prefix", default="samples")
    ap.add_argument("--out_prefix", default="hotlists")
    ap.add_argument("--catalog", default="backend/resources/catalog/jma_catalog_refs_canon.clean.json")
    ap.add_argument("--topn", type=int, default=200)
    args = ap.parse_args()

    # catálogo canon válido
    cat_path = Path(args.catalog)
    if not cat_path.exists():
        raise SystemExit(f"ERROR: no existe catálogo: {cat_path}")
    catalog = set(json.load(open(cat_path, "r", encoding="utf-8")))

    # 1) lista feedbacks (y FILTRA SOLO gs://)
    pat = f"gs://{args.bucket}/{args.prefix}/*.feedback.json"
    _, out, _ = sh(f"gsutil ls '{pat}' 2>/dev/null || true")
    lines = [l.strip() for l in out.splitlines() if l.strip().startswith("gs://")]

    if not lines:
        print("FILES=0 (no hay feedback)")
        return

    Path("/tmp/fb.list").write_text("\n".join(lines) + "\n", encoding="utf-8")


    print("FILES=", len(lines))
# 2) descarga local (solo feedbacks listados; rápido y silencioso)
    tmp = Path("/tmp/fb_hotlists")
    if tmp.exists():
        sh(f"rm -rf '{tmp}'")
    tmp.mkdir(parents=True, exist_ok=True)

    # copia SOLO los feedbacks (sin bajar imágenes)
    sh("gsutil -q -m cp -I /tmp/fb_hotlists/ < /tmp/fb.list 2>/dev/null || true")



    # 3) sube a GCS
    dest = f"gs://{args.bucket}/{args.out_prefix}"
    sh(f"gsutil -m cp /tmp/hotlists_out/*.json '{dest}/' || true")
    print("UPLOADED_TO:", dest)

if __name__ == "__main__":
    main()
