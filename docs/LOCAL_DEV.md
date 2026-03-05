# Desarrollo local — ScanKey

El desarrollo diario se hace 100% en local (Windows/WSL). Cloud Shell solo para operaciones GCP.

## Requisitos

- **Node LTS** (18+)
- **Python 3.11**
- **Docker Desktop** (opcional, recomendado para Opción A)

## Opción A: Docker Compose (recomendada)

### Levantar
```bash
docker compose up -d --build
# o desde raíz: npm run stack:up
```

O usar scripts:
```bash
./scripts/dev_up.sh       # Bash (Linux/macOS/WSL)
./scripts/dev_up.ps1      # PowerShell (Windows)
```

### Apagar
```bash
docker compose down
# o: npm run stack:down  /  ./scripts/dev_down.sh  /  ./scripts/dev_down.ps1
```

### Health
```bash
curl http://localhost:8080/health   # Gateway
curl http://localhost:8081/health   # Motor
# o: ./scripts/dev_health.sh  /  ./scripts/dev_health.ps1
```

### UI
```bash
cd ui-studio && npm i && npm run dev
```

## Opción B: Sin Docker

### Gateway (puerto 8080)
```bash
cd gateway
python -m venv .venv
.venv/Scripts/activate   # Windows
# source .venv/bin/activate   # Linux/macOS
pip install -r requirements.txt
uvicorn main:APP --host 0.0.0.0 --port 8080
```

Variables: `MOTOR_URL=http://localhost:8081`, `API_KEYS=local-dev-key`, `SCN_LOCAL_DEV=1`, `SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED=false`.

### Motor (puerto 8081)
```bash
cd scankey-v1a1
python -m venv .venv
.venv/Scripts/activate   # Windows
# source .venv/bin/activate   # Linux/macOS
pip install -r motor/requirements.txt
# Windows PowerShell:
$env:PYTHONPATH="."; $env:PORT="8081"; $env:SCN_MOCK_ENGINE="1"; python -m uvicorn motor.main:app --host 0.0.0.0 --port 8081
# Linux/macOS:
# PYTHONPATH=. PORT=8081 SCN_MOCK_ENGINE=1 python -m uvicorn motor.main:app --host 0.0.0.0 --port 8081
```
*(Desde raíz del repo; `PYTHONPATH` incluye raíz para `common`.)*

### UI
```bash
cd ui-studio && npm i && npm run dev
```

## QA

```bash
# Suite completa (contract, secrets, smoke SKIP si backend off, pages, no-ts)
npm -C ui-studio run qa:all

# Smoke (requiere stack levantado) — usa RUN_SMOKE=1 para forzar
RUN_SMOKE=1 npm -C ui-studio run qa:smoke
```

**Nota Windows:** `qa:smoke`, `qa:secrets`, `qa:pages` usan scripts Bash. En Windows usa **WSL** o **Git Bash** para ejecutarlos.

## Cloud Shell solo para

- `gcloud run deploy` (gateway, motor)
- Set env vars en Cloud Run
- Ver logs: `gcloud run services logs tail scankey-gateway`
- Operaciones con buckets (GCS)
- **Sin credenciales en repo**: nunca commitear tokens, keys ni `credentials.json`

## Seguridad

- **`.env.local`** está en `.gitignore` — úsalo para variables locales.
- **Nunca commitear** tokens, API keys, `credentials.json`, recovery codes.
- `.env.example` es plantilla sin secretos; copia a `.env.local` y rellena.
