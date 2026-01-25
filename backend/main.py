from fastapi import FastAPI, UploadFile, File, Form
try:
    from .api_ocr import router as ocr_router
except ImportError:
    from api_ocr import router as ocr_router
from fastapi.responses import JSONResponse
import numpy as np
import cv2

import ocr_engine

# OCR opcional: no dejes que un cambio en OCR tumbe el backend en Cloud Run
run_ocr = getattr(ocr_engine, "run_ocr", None)
if run_ocr is None:
    def run_ocr(*args, **kwargs):
        return {"text": "", "confidence": 0.0, "enabled": False}


app = FastAPI(title="ScanKey OCR Backend", version="v1")


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
  return {"ok": True, **out}
