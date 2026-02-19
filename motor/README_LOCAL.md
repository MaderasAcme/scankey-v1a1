# ScanKey Motor Local Development Guide

This document outlines how to run the ScanKey Motor service locally using Docker, focusing on the development setup.

## 1. Prerequisites

*   Docker installed and running.
*   `jq` for pretty-printing JSON responses (optional, but recommended for smoke test).

## 2. Running Locally

The `motor` service is designed to run in a Docker container.

### A) Model Mounting

The model (e.g., `modelo_llaves.onnx`) and its associated `labels.json` are expected to be available at `/tmp/modelo_llaves.onnx` and `/tmp/labels.json` inside the container.

For local development, you should mount these files from your host machine into the Docker container.

**Example Docker run command (conceptual):**

```bash
docker run -d -p 8080:8080 
  -v /path/to/your/local/model/modelo_llaves.onnx:/tmp/modelo_llaves.onnx 
  -v /path/to/your/local/model/labels.json:/tmp/labels.json 
  scankey-motor-local:latest
```

**Using the `smoke_motor_local.sh` script:**

The `scripts/smoke_motor_local.sh` script automates the build and run process for a basic health check. If you want to use it with a local model, you'll need to modify the script to include the `-v` mounts.

Alternatively, you can place your model files directly inside the `motor` directory during `docker build`, but this is generally not recommended for local development as it bloats the image.

### B) Environment Variables

The following environment variables might be relevant for local setup (though some are more critical for production deployments):

*   `PORT`: The port the Gunicorn server will listen on (default: `8080`).
*   `GUNICORN_WORKERS`: Number of Gunicorn worker processes (default: `1`).
*   `GUNICORN_TIMEOUT`: Worker timeout in seconds (default: `900`).
*   `GUNICORN_GRACEFUL_TIMEOUT`: Graceful worker shutdown timeout (default: `900`).
*   `MODEL_PATH`: (inside container) Path to the ONNX model file (default: `/tmp/modelo_llaves.onnx`).
*   `LABELS_PATH`: (inside container) Path to the labels JSON file (default: `labels.json` relative to `main.py`).
*   `GCS_BUCKET`: (Optional) Google Cloud Storage bucket for storing samples/feedback.
*   `INSCRIPTIONS_BUCKET`: (Optional) GCS bucket for inscriptions index and events.

You can pass these using the `-e` flag to `docker run`:

```bash
docker run -d -p 8080:8080 
  -e GCS_BUCKET="your-dev-bucket" 
  -v /path/to/model/modelo_llaves.onnx:/tmp/modelo_llaves.onnx 
  scankey-motor-local:latest
```

## 3. Troubleshooting

### Connection reset / IPv6 / `curl -4`

Sometimes, when `curl`ing a locally running Docker container, you might encounter issues related to IPv6 or connection resets, especially on some Linux distributions or Docker network configurations.

**Symptoms:**
*   `curl: (56) Recv failure: Connection reset by peer`
*   `curl: (7) Couldn't connect to server`

**Solution:**
Force `curl` to use IPv4 by adding the `-4` flag. This is already included in the `scripts/smoke_motor_local.sh` script.

**Example:**
```bash
curl -4 http://127.0.0.1:8080/health
```

Ensure that your Docker container is indeed binding to `0.0.0.0` (all interfaces) and that your firewall is not blocking access to `8080` if you're not using `127.0.0.1`.
