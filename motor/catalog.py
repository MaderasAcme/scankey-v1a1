"""
Shim para Cloud Run.
main.py hace: import catalog as _catalog
Este archivo DEBE existir como /app/catalog.py dentro del contenedor.
"""
import json
import os

LABELS_PATH = os.getenv("LABELS_PATH", "/app/labels.json")

def _load_labels():
    try:
        with open(LABELS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and "labels" in data:
            return list(data["labels"])
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []

LABELS = _load_labels()

# Mínimo viable: catálogo por referencia
CATALOG = {lab: {"ref": lab} for lab in LABELS}

def get(ref, default=None):
    return CATALOG.get(ref, default)

def list_refs():
    return list(CATALOG.keys())
