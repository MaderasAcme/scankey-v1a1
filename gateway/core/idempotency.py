"""Idempotency — feedback idempotency helpers."""
import json
import os
import time
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any

from .config import (
    IDEMPOTENCY_KEYS_PREFIX,
    IDEMPOTENCY_TTL_SECONDS,
    KEY_BUCKET,
    FEEDBACK_PREFIX,
)
from .gcs_utils import gcs_ok, gcs_put_json, gcs_get_json, date_prefix


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_manual_for_key(payload: Dict[str, Any]) -> Dict[str, str]:
    manual = payload.get("manual_data") or payload.get("manual")
    if not isinstance(manual, dict):
        return {}
    out = {}
    for k, v in sorted(manual.items()):
        if v is None:
            out[k] = ""
        elif isinstance(v, (str, int, float, bool)):
            out[k] = str(v).strip()
        else:
            out[k] = json.dumps(v, sort_keys=True, ensure_ascii=False)
    return out


def compute_feedback_idempotency_key(payload: Dict[str, Any]) -> str:
    dt = datetime.now(timezone.utc)
    date_str = f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}"
    input_id = (payload.get("input_id") or payload.get("job_id") or "").strip()
    selected = (
        payload.get("selected_id")
        or payload.get("selected_id_model_ref")
        or payload.get("id_model_ref")
        or ""
    )
    if not selected and isinstance(payload.get("choice"), dict):
        selected = payload.get("choice", {}).get("id_model_ref") or payload.get("choice", {}).get("selected_id") or ""
    correction = bool(payload.get("correction", False))
    manual_norm = normalize_manual_for_key(payload)
    manual_str = json.dumps(manual_norm, sort_keys=True, ensure_ascii=False)
    chosen_rank = payload.get("chosen_rank") or payload.get("selected_rank")
    rank_str = str(chosen_rank) if chosen_rank is not None else ""
    canonical = f"{input_id}|{selected}|{correction}|{rank_str}|{manual_str}|{date_str}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def idempotency_registry_path(key: str, date_prefix: str) -> str:
    return f"{IDEMPOTENCY_KEYS_PREFIX}/{date_prefix}/{key}.json"


def idempotency_local_dir() -> str:
    base = os.getenv("IDEMPOTENCY_LOCAL_DIR", "").strip() or os.path.join(os.path.dirname(__file__), "..", ".idempotency_keys")
    os.makedirs(base, exist_ok=True)
    return base


def check_idempotency_seen(key: str) -> tuple:
    import logging
    _log = logging.getLogger(__name__)
    dp = date_prefix(datetime.now(timezone.utc))
    if gcs_ok():
        path = idempotency_registry_path(key, dp)
        try:
            rec = gcs_get_json(KEY_BUCKET, path)
        except FileNotFoundError:
            return False, None
    else:
        local_dir = idempotency_local_dir()
        subdir = os.path.join(local_dir, dp.replace("/", os.sep))
        os.makedirs(subdir, exist_ok=True)
        fpath = os.path.join(subdir, f"{key}.json")
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                rec = json.load(f)
        except FileNotFoundError:
            return False, None
        except (json.JSONDecodeError, OSError):
            return False, None
    first_seen = rec.get("first_seen_unix", 0)
    if time.time() - first_seen > IDEMPOTENCY_TTL_SECONDS:
        return False, None
    return True, rec.get("response")


def store_idempotency(key: str, response: Dict[str, Any]) -> None:
    import logging
    _log = logging.getLogger(__name__)
    dp = date_prefix(datetime.now(timezone.utc))
    rec = {"first_seen_unix": int(time.time()), "first_seen_iso": _now_iso(), "response": response}
    if gcs_ok():
        path = idempotency_registry_path(key, dp)
        gcs_put_json(KEY_BUCKET, path, rec)
    else:
        local_dir = idempotency_local_dir()
        subdir = os.path.join(local_dir, dp.replace("/", os.sep))
        os.makedirs(subdir, exist_ok=True)
        fpath = os.path.join(subdir, f"{key}.json")
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False, indent=None)
        except OSError:
            _log.warning("No se pudo guardar idempotency key local: %s", fpath)


def get_feedback_idempotency_key_from_request(req, payload: Dict[str, Any]) -> str:
    header_key = (req.headers.get("Idempotency-Key") or req.headers.get("idempotency-key") or "").strip()
    if header_key and len(header_key) <= 128:
        return header_key
    return compute_feedback_idempotency_key(payload)
