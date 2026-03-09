"""GCS helpers — put/get JSON, put/get bytes, find_job_path."""
import json
import hashlib
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from .config import KEY_BUCKET, JOB_PREFIX, SCN_LOCAL_DEV

try:
    from google.cloud import storage
except ImportError:
    storage = None

_gcs = None
if not SCN_LOCAL_DEV and storage:
    try:
        _gcs = storage.Client()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("GCS client init failed (local dev?): %s", e)


def date_prefix(dt: datetime) -> str:
    return f"{dt.year:04d}/{dt.month:02d}/{dt.day:02d}"


def gcs_ok() -> bool:
    return _gcs is not None


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def gcs_put_json(bucket: str, path: str, obj: Dict[str, Any]):
    if not _gcs:
        raise RuntimeError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    blob.upload_from_string(
        json.dumps(obj, ensure_ascii=False).encode("utf-8"),
        content_type="application/json; charset=utf-8",
    )


def gcs_get_json(bucket: str, path: str) -> Dict[str, Any]:
    if not _gcs:
        raise FileNotFoundError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    return json.loads(blob.download_as_bytes().decode("utf-8"))


def gcs_put_bytes(bucket: str, path: str, data: bytes, content_type: str = "image/jpeg"):
    if not _gcs:
        raise RuntimeError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    blob.upload_from_string(data, content_type=content_type)


def gcs_get_bytes(bucket: str, path: str) -> bytes:
    if not _gcs:
        raise FileNotFoundError("GCS no disponible (modo local)")
    b = _gcs.bucket(bucket)
    blob = b.blob(path)
    if not blob.exists():
        raise FileNotFoundError(path)
    return blob.download_as_bytes()


def find_job_path(bucket: str, job_id: str, job_prefix: str, lookback_days: int = 14) -> str:
    if not _gcs:
        raise FileNotFoundError("GCS no disponible (modo local)")
    now = datetime.now(timezone.utc)
    b = _gcs.bucket(bucket)
    for i in range(lookback_days + 1):
        dp = date_prefix(now - timedelta(days=i))
        p = f"{job_prefix}/{dp}/{job_id}.json"
        if b.blob(p).exists():
            return p
    raise FileNotFoundError(job_id)
