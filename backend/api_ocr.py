from fastapi import APIRouter, UploadFile, File, Header
try:
    from .modules.ocr_dual import is_workshop_authorized, ocr_placeholder
except ImportError:
    from modules.ocr_dual import is_workshop_authorized, ocr_placeholder

router = APIRouter(prefix="/api", tags=["ocr"])

@router.post("/ocr")
async def ocr(front: UploadFile = File(...), x_workshop_token: str | None = Header(default=None)):
    b = await front.read()
    out = ocr_placeholder(b)

    if is_workshop_authorized(x_workshop_token):
        # autorizado: devuelve workshop_view (aunque ahora esté placeholder)
        return {"ok": True, **out, "authorized": True}

    # no autorizado: NO devolver detalle
    return {"ok": True, "client_view": out["client_view"], "authorized": False}
