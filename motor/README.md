# ScanKey Motor (Cloud Run)

Servicio FastAPI para inferencia con ONNX.

## Run local
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080

## Env
- MODEL_PATH: ruta al .onnx dentro del contenedor (ej: /app/modelo_llaves.onnx)
