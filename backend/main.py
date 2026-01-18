from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
import numpy as np
import cv2

from ocr_engine import run_ocr

app = FastAPI(title="ScanKey OCR Backend", version="v1")

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
