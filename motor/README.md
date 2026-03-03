# ScanKey Motor (Cloud Run)

Servicio FastAPI para inferencia con ONNX.

## Ejecución Local

Puedes ejecutar el servicio Motor de forma local usando Docker, lo cual simula mejor el entorno de Cloud Run.

### 1. Construir la Imagen Docker

Primero, construye la imagen Docker del servicio Motor desde la raíz del proyecto:

```bash
docker build -t scankey-motor -f motor/Dockerfile motor/
```

### 2. Ejecutar la Imagen Docker

Tienes dos modos para ejecutar el servicio:

#### Modo A: Bootstrap desde Google Cloud Storage (GCS)

En este modo, el modelo y las etiquetas se descargan de GCS al iniciar el contenedor. Esto es lo más parecido a cómo funciona en Cloud Run.

**Variables de Entorno Obligatorias:**
- `MODEL_GCS_URI`: URI de GCS para el archivo `.onnx` del modelo (ej. `gs://your-bucket/path/to/model.onnx`).
- `MODEL_GCS_DATA_URI`: URI de GCS para el archivo `.onnx.data` (si aplica, ej. `gs://your-bucket/path/to/model.onnx.data`).
- `LABELS_GCS_URI`: URI de GCS para el archivo `labels.json` (ej. `gs://your-bucket/path/to/labels.json`).
- `GCP_PROJECT`: ID de tu proyecto de Google Cloud.

**Ejemplo (usando `docker run` directamente):**
```bash
docker run -d --name motor-gcs-test \
  -p 8080:8080 \
  -e PORT=8080 \
  -e GCP_PROJECT="your-gcp-project-id" \
  -e MODEL_GCS_URI="gs://your-bucket/path/to/model.onnx" \
  -e MODEL_GCS_DATA_URI="gs://your-bucket/path/to/model.onnx.data" \
  -e LABELS_GCS_URI="gs://your-bucket/path/to/labels.json" \
  scankey-motor
```

**Ejemplo (usando `scripts/smoke_test_motor.sh`):**
Asegúrate de que las variables de entorno `GCP_PROJECT`, `MODEL_GCS_URI`, `MODEL_GCS_DATA_URI`, `LABELS_GCS_URI` estén configuradas en tu shell o pásalas como parte del comando `docker run` si ejecutas el script.

```bash
# Exportar las variables de entorno necesarias (ejemplo)
export GCP_PROJECT="your-gcp-project-id"
export MODEL_GCS_URI="gs://your-bucket/path/to/model.onnx"
export MODEL_GCS_DATA_URI="gs://your-bucket/path/to/model.onnx.data"
export LABELS_GCS_URI="gs://your-bucket/path/to/labels.json"

./scripts/smoke_test_motor.sh -m gcs
```

#### Modo B: Montar Modelos Locales

En este modo, el modelo y las etiquetas se montan directamente desde tu sistema de archivos local al contenedor.

**Preparación:**
1.  Asegúrate de tener los archivos `modelo_llaves.onnx`, `modelo_llaves.onnx.data` y `labels.json` en una carpeta local, por ejemplo, `/tmp/motor_models`.
    ```bash
    mkdir -p /tmp/motor_models
    # Copia tus archivos de modelo y etiquetas aquí
    cp /ruta/a/tu/modelo/modelo_llaves.onnx /tmp/motor_models/
    cp /ruta/a/tu/modelo/modelo_llaves.onnx.data /tmp/motor_models/
    cp /ruta/a/tu/labels.json /tmp/motor_models/labels.json
    ```

**Variables de Entorno Obligatorias (si no usas los defaults):**
- `MODEL_PATH`: Ruta dentro del contenedor al archivo `.onnx` (default: `/tmp/modelo_llaves.onnx`).
- `MODEL_DATA_DST`: Ruta dentro del contenedor al archivo `.onnx.data` (default: `/tmp/modelo_llaves.onnx.data`).
- `LABELS_PATH`: Ruta dentro del contenedor al archivo `labels.json` (default: `/app/labels.json`).

**Ejemplo (usando `docker run` directamente):**
```bash
# Asegúrate de que /tmp/scankey_model_v1 contenga modelo_llaves.onnx, modelo_llaves.onnx.data, y labels.json
mkdir -p /tmp/scankey_model_v1
# Descarga o copia tus archivos aquí, por ejemplo:
# gsutil cp gs://your-bucket/path/to/modelo_llaves.onnx /tmp/scankey_model_v1/
# gsutil cp gs://your-bucket/path/to/modelo_llaves.onnx.data /tmp/scankey_model_v1/
# gsutil cp gs://your-bucket/path/to/labels.json /tmp/scankey_model_v1/labels.json

docker run -d --name motor-local-test \
  -p 8080:8080 \
  -e PORT=8080 \
  -e MODEL_PATH="/mnt/models/modelo_llaves.onnx" \
  -e MODEL_DATA_DST="/mnt/models/modelo_llaves.onnx.data" \
  -e LABELS_DST="/mnt/models/labels.json" \
  -v /tmp/scankey_model_v1:/mnt/models \
  scankey-motor
```
Nota: En este modo, se montan tus archivos locales en `/mnt/models` dentro del contenedor. Las variables de entorno `MODEL_PATH`, `MODEL_DATA_DST` y `LABELS_DST` deben apuntar a la ubicación de los archivos dentro de este volumen montado.

**Ejemplo (usando `scripts/smoke_test_motor.sh`):**
```bash
# Asegúrate de que esta carpeta contenga modelo_llaves.onnx, modelo_llaves.onnx.data, labels.json
export MODEL_DIR="/tmp/scankey_model_v1"
./scripts/smoke_test_motor.sh mount
```

### 3. Verificar el Servicio

Después de ejecutar el contenedor, puedes verificar su estado con el endpoint `/health`.

```bash
curl -4 http://localhost:8080/health
```

Deberías obtener una respuesta JSON similar a esta:
```json
{
  "ok": true,
  "uptime_s": 123.45,
  "model_ready": true,
  "model_loading": false,
  "labels_count": 100,
  "model_path": "/tmp/modelo_llaves.onnx",
  "error": null
}
```

## Variables de Entorno

Una lista de variables de entorno importantes que el servicio Motor utiliza:

| Variable | Descripción | Predeterminado |
|---|---|---|
| `PORT` | Puerto en el que el servidor Gunicorn escuchará. | `8080` |
| `GUNICORN_WORKERS` | Número de procesos worker de Gunicorn. | `1` |
| `GUNICORN_TIMEOUT` | Tiempo máximo en segundos para que un worker procese una solicitud. | `900` |
| `GUNICORN_GRACEFUL_TIMEOUT` | Tiempo en segundos para un apagado "gracioso" de los workers. | `900` |
| `MODEL_GCS_URI` | URI de GCS del archivo `.onnx` del modelo. | |
| `MODEL_GCS_DATA_URI` | URI de GCS del archivo `.onnx.data` (si aplica). | |
| `LABELS_GCS_URI` | URI de GCS del archivo `labels.json`. | |
| `MODEL_PATH` | Ruta local (dentro del contenedor) al archivo `.onnx`. | `/tmp/modelo_llaves.onnx` |
| `MODEL_DATA_DST` | Ruta local (dentro del contenedor) al archivo `.onnx.data`. | `/tmp/modelo_llaves.onnx.data` |
| `LABELS_DST` | Ruta local (dentro del contenedor) al archivo `labels.json`. | `/app/labels.json` |
| `GCP_PROJECT` | ID del proyecto de Google Cloud, necesario para la autenticación de GCS. | |
| `BOOTSTRAP_HTTP_TIMEOUT` | Tiempo de espera en segundos para descargas HTTP de modelos. | `900` |
| `BOOTSTRAP_MODEL_MIN_BYTES` | Tamaño mínimo en bytes del modelo ONNX para considerarse válido. | `100000` |
| `BOOTSTRAP_DATA_MIN_BYTES` | Tamaño mínimo en bytes del archivo de datos ONNX para considerarse válido. | `1000000` |
| `BOOTSTRAP_LABELS_MIN_BYTES` | Tamaño mínimo en bytes del archivo de etiquetas JSON para considerarse válido. | `2` |
| `STORAGE_PROBABILITY` | Probabilidad (0.0-1.0) de almacenar muestras en GCS. | `0.75` |
| `GCS_BUCKET` | Nombre del bucket de GCS para almacenar muestras y metadatos. | |
| `GCS_SAMPLES_PREFIX` | Prefijo de GCS para las muestras almacenadas. | `samples` |
| `STORE_ONLY_IF_MODO_TALLER` | `1` para almacenar muestras solo si `modo` es "taller". | `0` |
| `STORE_DUAL_KEYS` | `1` para almacenar copias en `keys/YYYY/MM/DD/...`. | `1` |
| `INSCRIPTIONS_BUCKET` | Bucket de GCS para almacenar eventos de inscripción. | |
| `ENABLE_CURATED_BY_REF` | `1` para habilitar copias curadas por referencia en GCS. | `1` |
| `GCS_BY_REF_BUCKET` | Bucket de GCS para copias curadas por referencia. | (igual que `GCS_BUCKET`) |
| `GCS_BY_REF_PREFIX` | Prefijo de GCS para copias curadas por referencia. | `by_ref` |
| `MAX_SAMPLES_PER_REF_SIDE` | Número máximo de muestras por referencia y lado. | `30` |
| `CURATED_STORE_ONLY_IF_MODO_TALLER` | `1` para curar solo si `modo` es "taller". | `1` |
| `SCN_REF_DB_PATH` | Ruta a la base de datos de referencias ricas. | |
| `SCN_CATALOG_CANON` | Ruta de anulación para el archivo de canon del catálogo. | |

## API Endpoints

- `/health`: Retorna el estado de salud del servicio, incluyendo si el modelo está listo.
- `/ready`: Retorna 200 OK si el modelo está cargado y listo para inferencia, 503 de lo contrario.
- `/api/analyze-key`: Endpoint principal para el análisis de imágenes de llaves.
- `/api/feedback`: Endpoint para enviar feedback y curar resultados.
- `/api/inscription-suggest`: Sugerencias de inscripción basadas en el índice.
- `/api/catalog/version`: Retorna la versión del catálogo (si está habilitado).
- `/api/catalog/{ref}`: Retorna información detallada para una referencia del catálogo.
- `/debug/routes`: Lista de rutas de la API (solo para diagnóstico).
- `/debug/model-files`: Estado de los archivos del modelo (solo para diagnóstico).
- `/debug/env`: Variables de entorno clave (solo para diagnóstico).
- `/debug/bootstrap-now`: Fuerza la descarga del modelo y etiquetas (solo para diagnóstico).