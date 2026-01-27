import json, os

_LABELS = None

def _load_labels():
    paths = [
        os.getenv("LABELS_PATH", "/app/labels.json"),
        "labels.json",
        "/app/labels.json",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    data = data.get("labels") or data.get("classes") or data.get("names") or []
                if isinstance(data, list) and data:
                    return [str(x) for x in data]
            except Exception:
                pass
    return []

def labels():
    global _LABELS
    if _LABELS is None:
        _LABELS = _load_labels()
        print(f"LABELS_LOADED={len(_LABELS)}")
    return _LABELS

def idx_to_label(idx: int) -> str:
    labs = labels()
    return labs[idx] if 0 <= idx < len(labs) else f"class_{idx}"
