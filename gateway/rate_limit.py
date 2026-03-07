"""
BLOQUE 6: Rate limit básico en memoria.
- Por API key si existe, si no por IP
- Límites por endpoint configurables por ENV
"""
import hashlib
import os
import time
from typing import Tuple

# endpoint -> (identificador -> [timestamps])
_stores: dict[str, dict[str, list[float]]] = {}


def _get_client_ip(req) -> str:
    """Obtiene IP del cliente. Soporta X-Forwarded-For si está detrás de proxy."""
    forwarded = (req.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    if req.client:
        return req.client.host or "127.0.0.1"
    return "127.0.0.1"


def get_identifier(req) -> str:
    """Identificador para rate limit: hash de API key si existe, si no IP."""
    api_key = (req.headers.get("x-api-key") or "").strip()
    if api_key:
        h = hashlib.sha256(api_key.encode()).hexdigest()[:16]
        return f"key:{h}"
    return f"ip:{_get_client_ip(req)}"


def _get_limit_and_window(endpoint: str) -> Tuple[int, int]:
    """Devuelve (limit, window_seconds) según endpoint y ENV."""
    defaults = {
        "analyze": (int(os.getenv("RATE_LIMIT_MAX_ANALYZE", "30")), int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))),
        "feedback": (int(os.getenv("RATE_LIMIT_MAX_FEEDBACK", "60")), int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))),
        "login": (int(os.getenv("RATE_LIMIT_MAX_LOGIN", "10")), int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))),
    }
    return defaults.get(endpoint, (30, 60))


def check_rate_limit(identifier: str, endpoint: str) -> Tuple[bool, int, int, int]:
    """
    Comprueba si el identificador excede el límite.
    Retorna (is_limited, limit, remaining, retry_after_seconds).
    Si is_limited=True, remaining=0 y retry_after indica segundos hasta reset.
    """
    limit, window = _get_limit_and_window(endpoint)
    now = time.time()

    if endpoint not in _stores:
        _stores[endpoint] = {}
    store = _stores[endpoint]

    # Limpiar timestamps fuera de ventana
    store[identifier] = [t for t in store.get(identifier, []) if now - t < window]
    timestamps = store[identifier]

    if len(timestamps) >= limit:
        # Calcular retry_after (segundos hasta que expire el más antiguo)
        oldest = min(timestamps)
        retry_after = max(0, int(window - (now - oldest)))
        return True, limit, 0, retry_after

    timestamps.append(now)
    remaining = max(0, limit - len(timestamps))
    return False, limit, remaining, 0


def is_enabled() -> bool:
    """Indica si el rate limit está habilitado por ENV."""
    return os.getenv("RATE_LIMIT_ENABLED", "false").lower() in ("1", "true", "yes")


def reset_stores() -> None:
    """Vacía los stores (solo para tests)."""
    global _stores
    _stores.clear()
