"""
Adaptador mock: delega en gateway/normalize (normalización oficial).
Solo añade processing_time_ms y model_version a debug.
Sin duplicar lógica de negocio.
"""
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any

# Path para importar normalización oficial (gateway)
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_GATEWAY_DIR = _REPO_ROOT / "gateway"
for p in (_REPO_ROOT, _GATEWAY_DIR):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)

from normalize import normalize_contract  # noqa: E402


def normalize_engine_output(raw: Dict[str, Any], input_id: str, proc_time: int) -> Dict[str, Any]:
    """
    Wrapper mock: aplica normalización oficial (gateway) y añade campos de procesamiento.
    Contrato idéntico al backend real.
    """
    payload = dict(raw or {})
    payload["input_id"] = input_id
    payload["timestamp"] = payload.get("timestamp") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = normalize_contract(payload)
    out["debug"]["processing_time_ms"] = proc_time
    out["debug"]["model_version"] = "scankey-v2-prod"
    return out
