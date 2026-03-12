# ScanKey local — Comandos actuales (puertos usados hoy)

**Motivo:** 8081, 8082 y 8080 estaban ocupados. Se usó 8083 (motor) y 8084 (gateway).

---

## ui-studio/.env.local (ya creado)

```
VITE_GATEWAY_BASE_URL=http://localhost:8084
VITE_API_KEY=local-dev-key
```

---

## Terminal 1 — Motor (puerto 8083)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "C:\Users\guill\Desktop\scankey-v1a1"
$env:SCN_MOCK_ENGINE = "1"
python -m uvicorn motor.main:app --host 0.0.0.0 --port 8083
```

---

## Terminal 2 — Gateway (puerto 8084)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "C:\Users\guill\Desktop\scankey-v1a1"
$env:MOTOR_URL = "http://localhost:8083"
$env:API_KEYS = "local-dev-key"
$env:SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED = "false"
cd gateway
python -m uvicorn main:APP --host 0.0.0.0 --port 8084
```

---

## Terminal 3 — UI (puerto 5173)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
npm.cmd -C ui-studio run dev:web
```

---

## Validación

```powershell
# Motor
Invoke-WebRequest -Uri "http://localhost:8083/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Gateway
Invoke-WebRequest -Uri "http://localhost:8084/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Analyze (smoke test)
curl.exe -s -X POST "http://localhost:8084/api/analyze-key" -H "x-api-key: local-dev-key" -F "front=@C:\Users\guill\Desktop\scankey-v1a1\ui-studio\scripts\fixtures\test.png"
```

---

## URLs finales

| Servicio | URL |
|----------|-----|
| Motor /health | http://localhost:8083/health |
| Gateway /health | http://localhost:8084/health |
| UI | http://localhost:5173 |
