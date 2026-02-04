import os, json, tempfile, urllib.parse, urllib.request, logging
from pathlib import Path

log = logging.getLogger("scankey.bootstrap")

LOCK_PATH = "/tmp/scankey_bootstrap.lock"

MODEL_DST  = os.getenv("MODEL_DST", "/tmp/modelo_llaves.onnx")
DATA_DST   = os.getenv("MODEL_DATA_DST", "/tmp/modelo_llaves.onnx.data")
LABELS_DST = os.getenv("LABELS_DST", "/tmp/labels.json")

HTTP_TIMEOUT = int(os.getenv("BOOTSTRAP_HTTP_TIMEOUT", "900"))
MODEL_MIN_BYTES = int(os.getenv("BOOTSTRAP_MODEL_MIN_BYTES", "100000"))
DATA_MIN_BYTES  = int(os.getenv("BOOTSTRAP_DATA_MIN_BYTES", "1000000"))
LABELS_MIN_BYTES= int(os.getenv("BOOTSTRAP_LABELS_MIN_BYTES", "2"))


def _parse_gs(uri: str):
    if not uri or not uri.startswith("gs://"):
        raise ValueError(f"bad gs uri: {uri}")
    rest = uri[5:]
    bucket, _, name = rest.partition("/")
    if not bucket or not name:
        raise ValueError(f"bad gs uri: {uri}")
    return bucket, name

def _ensure_parent(p: str):
    Path(p).parent.mkdir(parents=True, exist_ok=True)

def _need(p: str, min_bytes: int) -> bool:
    pp = Path(p)
    return (not pp.exists()) or (pp.stat().st_size < min_bytes)

def _metadata_access_token() -> str:
    req = urllib.request.Request(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        payload = json.loads(r.read().decode("utf-8"))
    return payload["access_token"]

def _download_http_gcs(bucket: str, name: str, dst: str):
    token = _metadata_access_token()
    obj = urllib.parse.quote(name, safe="")
    url = f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{obj}?alt=media"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

    _ensure_parent(dst)
    tmp_dir = str(Path(dst).parent)

    log.warning(f"BOOTSTRAP http_start dst={dst} url={url}")
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        with tempfile.NamedTemporaryFile(delete=False, dir=tmp_dir, prefix=".tmp_", suffix=".part") as f:
            tmp_path = f.name
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

    os.replace(tmp_path, dst)
    log.warning(f"BOOTSTRAP http_done dst={dst} bytes={Path(dst).stat().st_size}")

def _download_gcs(uri: str, dst: str):
    bucket, name = _parse_gs(uri)
    log.warning(f"BOOTSTRAP dl_start uri={uri} dst={dst}")

    # Intento 1: SDK (si está instalado)
    try:
        from google.cloud import storage
        client = storage.Client()
        blob = client.bucket(bucket).blob(name)

        _ensure_parent(dst)
        tmp_dir = str(Path(dst).parent)
        with tempfile.NamedTemporaryFile(delete=False, dir=tmp_dir, prefix=".tmp_", suffix=".part") as f:
            tmp_path = f.name

        blob.download_to_filename(tmp_path)
        os.replace(tmp_path, dst)
        log.warning(f"BOOTSTRAP dl_done sdk dst={dst} bytes={Path(dst).stat().st_size}")
        return
    except Exception as e:
        log.warning(f"BOOTSTRAP dl_sdk_failed uri={uri} err={type(e).__name__}:{e}")

    # Intento 2: HTTP + token metadata
    _download_http_gcs(bucket, name, dst)

def ensure_model() -> bool:
    model_uri  = os.getenv("MODEL_GCS_URI") or os.getenv("MODEL_GCS")
    data_uri   = os.getenv("MODEL_GCS_DATA_URI") or os.getenv("MODEL_DATA_GCS_URI")
    labels_uri = os.getenv("LABELS_GCS_URI") or os.getenv("LABELS_GCS")

    log.warning(f"BOOTSTRAP enter model_uri={model_uri} data_uri={data_uri} labels_uri={labels_uri}")

    if not model_uri:
        log.warning("BOOTSTRAP missing MODEL_GCS_URI/MODEL_GCS -> skip")
        return False

    import fcntl
    with open(LOCK_PATH, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)

        if _need(MODEL_DST, MODEL_MIN_BYTES):
            _download_gcs(model_uri, MODEL_DST)

        if data_uri and _need(DATA_DST, DATA_MIN_BYTES):
            _download_gcs(data_uri, DATA_DST)

        if labels_uri and _need(LABELS_DST, LABELS_MIN_BYTES):
            _download_gcs(labels_uri, LABELS_DST)

    ok = Path(MODEL_DST).exists() and (not data_uri or Path(DATA_DST).exists())
    log.warning(f"BOOTSTRAP exit ok={ok} model_exists={Path(MODEL_DST).exists()} data_exists={Path(DATA_DST).exists()} labels_exists={Path(LABELS_DST).exists()}")
    return ok
