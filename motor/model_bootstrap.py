import os
import shutil
import subprocess

# En Cloud Shell: usa gsutil SIEMPRE (es lo que funciona).
# En Cloud Run: gsutil normalmente no existe -> usarías google-cloud-storage (pero aquí no lo necesitamos).
# Si algún día lo quieres para Cloud Run, te lo adapto luego, pero ahora cerramos el bug.

def _size_ok(p: str) -> bool:
    return os.path.exists(p) and os.path.getsize(p) > 0

def _atomic_gsutil_cp(gcs_uri: str, dst_path: str):
    # Cloud Run runtime no trae gsutil. Descargamos desde GCS con SDK.
    import os
    from google.cloud import storage

    if not gcs_uri or not gcs_uri.startswith("gs://"):
        raise RuntimeError(f"MODEL_GCS_URI inválida: {gcs_uri}")

    # parse gs://bucket/obj
    rest = gcs_uri[5:]
    if "/" not in rest:
        raise RuntimeError(f"GCS URI incompleta: {gcs_uri}")
    bucket_name, blob_name = rest.split("/", 1)

    os.makedirs(os.path.dirname(dst_path) or ".", exist_ok=True)
    tmp_path = dst_path + f".tmp.{os.getpid()}"

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    # descarga atómica
    blob.download_to_filename(tmp_path)
    os.replace(tmp_path, dst_path)
def ensure_model():
    model_path = (os.getenv("MODEL_PATH", "/tmp/modelo_llaves.onnx") or "").strip()
    gcs_uri = (os.getenv("MODEL_GCS_URI", "") or "").strip()
    gcs_data_uri = (os.getenv("MODEL_DATA_GCS_URI", "") or "").strip()

    labels_gcs_uri = (os.getenv("LABELS_GCS_URI", "") or "").strip()
    labels_path = (os.getenv("LABELS_PATH", "/tmp/labels.json") or "").strip()

    if not model_path:
        raise RuntimeError("MODEL_PATH vacío")
    if not gcs_uri.startswith("gs://"):
        raise RuntimeError(f"MODEL_GCS_URI inválida: {gcs_uri}")

    data_path = model_path + ".data"

    # Descargar modelo si falta
    if not _size_ok(model_path):
        _atomic_gsutil_cp(gcs_uri, model_path)

    # Descargar .data si falta
    if gcs_data_uri:
        if not _size_ok(data_path):
            _atomic_gsutil_cp(gcs_data_uri, data_path)

    # Descargar labels si se proporciona URI
    if labels_gcs_uri:
        if not labels_path:
            raise RuntimeError("LABELS_PATH vacío")
        if not labels_gcs_uri.startswith("gs://"):
            raise RuntimeError(f"LABELS_GCS_URI inválida: {labels_gcs_uri}")
        if not _size_ok(labels_path):
            _atomic_gsutil_cp(labels_gcs_uri, labels_path)

    return model_path
