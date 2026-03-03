
import time
from collections import defaultdict

# Lead Engineer - Simple In-Memory Rate Limit

# IP -> [timestamps]
_request_history = defaultdict(list)

def is_rate_limited(ip: str, limit: int = 10, window: int = 60) -> bool:
    """
    Retorna True si la IP ha excedido el límite de peticiones en la ventana de tiempo.
    """
    now = time.time()
    # Limpiar historial antiguo
    _request_history[ip] = [t for t in _request_history[ip] if now - t < window]
    
    if len(_request_history[ip]) >= limit:
        return True
    
    _request_history[ip].append(now)
    return False
