"""
BLOQUE 6: Auditoría mínima sin fotos ni secretos.
- Escribe a archivo local .audit_logs/*.jsonl (gitignored)
- NO guarda: fotos, base64, password, payloads sensibles, workshop token completo, api key completa
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

_log = logging.getLogger(__name__)

_AUDIT_ENABLED = None
_AUDIT_DIR = None


def _reset_for_tests() -> None:
    """Resetea caché (solo para tests)."""
    global _AUDIT_ENABLED, _AUDIT_DIR
    _AUDIT_ENABLED = None
    _AUDIT_DIR = None


def _audit_enabled() -> bool:
    global _AUDIT_ENABLED
    if _AUDIT_ENABLED is None:
        _AUDIT_ENABLED = os.getenv("AUDIT_ENABLED", "false").lower() in ("1", "true", "yes")
    return _AUDIT_ENABLED


def _audit_dir() -> str:
    global _AUDIT_DIR
    if _AUDIT_DIR is None:
        base = os.getenv("AUDIT_LOCAL_DIR", "").strip()
        if not base:
            base = os.path.join(os.path.dirname(__file__), ".audit_logs")
        os.makedirs(base, exist_ok=True)
        _AUDIT_DIR = base
    return _AUDIT_DIR


def _sanitize(value: Any) -> Any:
    """No guardar secretos. Recursivo para dicts."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return str(value)


def _ip_resumida(ip: str) -> str:
    """Mascara IP para privacidad: 192.168.1.100 -> 192.168.x.x"""
    if not ip or "." not in ip:
        return ip or ""
    parts = ip.split(".")
    if len(parts) >= 4:
        return f"{parts[0]}.{parts[1]}.x.x"
    return ip


def _api_key_hash_parcial(api_key: Optional[str]) -> str:
    """Hash parcial de API key para auditoría (6 chars)."""
    if not api_key or not api_key.strip():
        return ""
    import hashlib
    h = hashlib.sha256(api_key.encode()).hexdigest()
    return f"ak_{h[:6]}"


def write_audit(record: Dict[str, Any]) -> None:
    """
    Escribe un registro de auditoría en .audit_logs/YYYY-MM-DD.jsonl.
    El record debe contener solo campos permitidos (sin fotos, base64, password).
    """
    if not _audit_enabled():
        return
    record = _sanitize(dict(record))
    record.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    date_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = os.path.join(_audit_dir(), f"{date_prefix}.jsonl")
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as e:
        _log.warning("No se pudo escribir audit log: %s", e)


def audit_analyze(
    request_id: str,
    endpoint: str,
    status_code: int,
    role: Optional[str] = None,
    ip: Optional[str] = None,
    api_key: Optional[str] = None,
    top1: Optional[str] = None,
    confidence: Optional[float] = None,
    policy_action: Optional[str] = None,
) -> None:
    record = {
        "action": "analyze",
        "request_id": request_id,
        "endpoint": endpoint,
        "status_code": status_code,
        "role": role or "cliente",
        "client": _api_key_hash_parcial(api_key) or _ip_resumida(ip or ""),
    }
    if top1 is not None:
        record["top1"] = top1
    if confidence is not None:
        record["confidence"] = confidence
    if policy_action:
        record["policy_action"] = policy_action
    write_audit(record)


def audit_feedback(
    request_id: str,
    endpoint: str,
    status_code: int,
    role: Optional[str] = None,
    ip: Optional[str] = None,
    api_key: Optional[str] = None,
    top1: Optional[str] = None,
    policy_action: Optional[str] = None,
    deduped: bool = False,
) -> None:
    record = {
        "action": "feedback",
        "request_id": request_id,
        "endpoint": endpoint,
        "status_code": status_code,
        "role": role or "cliente",
        "client": _api_key_hash_parcial(api_key) or _ip_resumida(ip or ""),
        "deduped": deduped,
    }
    if top1 is not None:
        record["top1"] = top1
    if policy_action:
        record["policy_action"] = policy_action
    write_audit(record)


def audit_login(
    request_id: str,
    endpoint: str,
    status_code: int,
    result: str,  # "success" | "invalid_credentials" | "not_configured"
    ip: Optional[str] = None,
) -> None:
    """Login audit: NUNCA guardar password."""
    record = {
        "action": "login",
        "request_id": request_id,
        "endpoint": endpoint,
        "status_code": status_code,
        "result": result,
        "client": _ip_resumida(ip or ""),
    }
    write_audit(record)
