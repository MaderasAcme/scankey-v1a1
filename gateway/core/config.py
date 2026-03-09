"""Config — lectura de env vars, flags, constantes."""
import os
from typing import Set

APP_VERSION = "0.5.0"
SCHEMA_VERSION = "2026-02-17"
POLICY_VERSION = "v1"

MOTOR_URL = (os.getenv("MOTOR_URL") or "").rstrip("/")
API_KEYS_RAW = os.getenv("API_KEYS", "")
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "*")
TIMEOUT = float(os.getenv("TIMEOUT", "15"))

SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED = os.getenv("SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED", "true").lower() == "true"
MOTOR_AUTH_HEADER = os.getenv("MOTOR_AUTH_HEADER", "Authorization")

KEY_BUCKET = os.getenv("KEY_BUCKET", "scankey-dc007-keys")
KEY_PREFIX = os.getenv("KEY_PREFIX", "ingest").strip("/")
JOB_PREFIX = os.getenv("JOB_PREFIX", "jobs").strip("/")
FEEDBACK_PREFIX = os.getenv("FEEDBACK_PREFIX", "feedback").strip("/")
IDEMPOTENCY_KEYS_PREFIX = os.getenv("IDEMPOTENCY_KEYS_PREFIX", "idempotency_keys").strip("/")
IDEMPOTENCY_TTL_SECONDS = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "86400"))

SCN_FEATURE_QUALITY_GATE_ACTIVE = os.getenv("SCN_FEATURE_QUALITY_GATE_ACTIVE", "false").lower() in ("1", "true", "yes")
SCN_FEATURE_POLICY_ENGINE_ACTIVE = os.getenv("SCN_FEATURE_POLICY_ENGINE_ACTIVE", "false").lower() in ("1", "true", "yes")

MAX_PAYLOAD_MB = float(os.getenv("SCN_MAX_PAYLOAD_MB", "10"))
MAX_PAYLOAD_BYTES = int(MAX_PAYLOAD_MB * 1024 * 1024)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_IMAGE_DIM = int(os.getenv("SCN_MAX_IMAGE_DIM", "8192"))

WORKSHOP_LOGIN_EMAIL = (os.getenv("WORKSHOP_LOGIN_EMAIL") or "").strip()
WORKSHOP_LOGIN_PASSWORD = (os.getenv("WORKSHOP_LOGIN_PASSWORD") or "").strip()
WORKSHOP_TOKEN = (os.getenv("WORKSHOP_TOKEN") or "").strip()

SCN_LOCAL_DEV = os.getenv("SCN_LOCAL_DEV", "").lower() in ("1", "true", "yes")


def parse_api_keys(raw: str) -> Set[str]:
    parts = []
    for chunk in (raw or "").replace("\n", ";").replace(",", ";").split(";"):
        s = chunk.strip()
        if s:
            parts.append(s)
    return set(parts)
