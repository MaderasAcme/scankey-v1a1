from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
try:
    from .api_ocr import router as ocr_router
except ImportError:
    from api_ocr import router as ocr_router
from fastapi.responses import JSONResponse
import numpy as np
import cv2

try:
    from . import ocr_engine
except ImportError:
    import ocr_engine
# OCR opcional: no dejes que un cambio en OCR tumbe el backend en Cloud Run
run_ocr = getattr(ocr_engine, "run_ocr", None)
if run_ocr is None:
    def run_ocr(*args, **kwargs):
        return {"text": "", "confidence": 0.0, "enabled": False}


app = FastAPI(title="ScanKey OCR Backend", version="v1")


# --- CORS (web/app) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://scankeyapp.com",
        "https://www.scankeyapp.com",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
# --- /CORS ---

app.include_router(ocr_router)

@app.get("/health")
def health():
  return {"ok": True, "ready": True, "service": "scankey-ocr-backend"}

@app.post("/api/ocr")
async def api_ocr(
  image: UploadFile = File(...),
  lang: str = Form("spa+eng"),
):
  raw = await image.read()
  arr = np.frombuffer(raw, np.uint8)
  img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
  if img is None:
    return JSONResponse({"ok": False, "error": "imagen inválida"}, status_code=400)

  out = run_ocr(img, lang=lang)

  # Post-proceso: extrae tokens y los cruza con el catálogo JMA (refs)
  try:
    try:
      from . import catalog_match
    except Exception:
      import catalog_match
    cat = catalog_match.match_text(out.get("text",""))
    out.update(cat)
    out["catalog_hint"] = {"best_ref": cat.get("best_ref"), "best_ref_canon": cat.get("best_ref_canon"), "unique_hits": [x.get("display") for x in (cat.get("catalog_hits_unique") or [])]}
  except Exception as e:
    # Nunca tumbes el endpoint por el catálogo
    out["catalog_error"] = str(e)

  return {"ok": True, **out}
