
import logging
import sys
import json
import time

# Lead Engineer - Operational Logging Configuration

class JsonFormatter(logging.Formatter):
    """
    Formatea logs en JSON plano para Cloud Logging.
    Evita spamear objetos pesados.
    """
    def format(self, record):
        log_record = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        
        # Añadir campos extra si se pasan vía extra={"field": "value"}
        if hasattr(record, "extra") and isinstance(record.extra, dict):
            for key, value in record.extra.items():
                log_record[key] = value
                
        # Inyectar campos de observabilidad estándar si están en el record
        obs_fields = ["request_id", "input_id", "latency_ms", "status_code", "model_version", "top_confidence"]
        for field in obs_fields:
            if hasattr(record, field):
                log_record[field] = getattr(record, field)
                
        return json.dumps(log_record)

logger = logging.getLogger("scankey")

def setup_logging():
    # Limpiar handlers previos
    if logger.handlers:
        for handler in logger.handlers:
            logger.removeHandler(handler)
            
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    
    # Silenciar ruidos de uvicorn en producción
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.ERROR)
