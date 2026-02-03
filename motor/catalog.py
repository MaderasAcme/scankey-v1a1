"""
Catalog module (minimal stub) to avoid Cloud Run boot failure.
This file exists to satisfy: `import catalog as _catalog`.

If later we implement real catalog functionality, extend this module.
"""
from __future__ import annotations

try:
    from fastapi import APIRouter
except Exception:
    APIRouter = None  # type: ignore

router = APIRouter(prefix="/catalog", tags=["catalog"]) if APIRouter else None

if router:
    @router.get("/ping")
    def ping():
        return {"ok": True}

def register(app):
    """Attach routes to a FastAPI app if possible."""
    try:
        if router:
            app.include_router(router)
    except Exception:
        pass

# Common aliases (por si main usa otro nombre)
register_routes = register
mount = register
attach = register
init = lambda *a, **k: None
