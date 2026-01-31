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

    print("FILES=", len(lines))

    # 2) descarga local (rsync robusto, sin WARN cp)
    tmp = Path("/tmp/fb_hotlists")
    if tmp.exists():
        sh(f"rm -rf '{tmp}'")
    tmp.mkdir(parents=True, exist_ok=True)
    # trae solo feedbacks
    sh(f"gsutil -m rsync -r \"gs://{args.bucket}/{args.prefix}\" /tmp/fb_hotlists >/dev/null 2>&1 || true")
    if err.strip():
        print("WARN(gsutil cp):", err.strip()[:300])

    paths = list(Path("/tmp/fb_hotlists").glob("*.feedback.json"))
    if not paths:
        print("FILES_LOCAL=0 (no se descargó nada)")
        return

    overall = Counter()
    by_country = defaultdict(Counter)
    by_city = defaultdict(Counter)
    by_taller = defaultdict(Counter)

    ok=bad_json=bad_cat=0

    for fp in paths:
        try:
            d = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            bad_json += 1
            continue

        ref = norm(d.get("ref_final") or d.get("ref_best") or "")
        if not ref:
            continue
        if ref not in catalog:
            bad_cat += 1
            continue

        ctx = d.get("ctx") or {}
        country = norm(d.get("country") or ctx.get("country") or "XX")
        city = norm(d.get("city") or ctx.get("city") or "")
        taller = norm(d.get("taller_id") or ctx.get("taller_id") or "")

        overall[ref] += 1
        by_country[country][ref] += 1
        if city:
            by_city[f"{country}:{city}"][ref] += 1
        if taller:
            by_taller[taller][ref] += 1
        ok += 1

    out_dir = Path("/tmp/hotlists_out")
    (out_dir/"global.json").write_text(json.dumps(dump(overall, args.topn), ensure_ascii=False), encoding="utf-8")

    for cc, cnt in by_country.items():
        (out_dir/f"{cc}.json").write_text(json.dumps(dump(cnt, args.topn), ensure_ascii=False), encoding="utf-8")

    for key, cnt in by_city.items():
        safe = key.replace(":","_")
        (out_dir/f"{safe}.json").write_text(json.dumps(dump(cnt, args.topn), ensure_ascii=False), encoding="utf-8")

    print(f"STATS ok={ok} bad_json={bad_json} filtered_not_in_catalog={bad_cat}")
    print("WROTE:", len(list(out_dir.glob("*.json"))), "files")

    # 3) sube a GCS
    dest = f"gs://{args.bucket}/{args.out_prefix}"
    sh(f"gsutil -m cp /tmp/hotlists_out/*.json '{dest}/' || true")
    print("UPLOADED_TO:", dest)

if __name__ == "__main__":
    main()
