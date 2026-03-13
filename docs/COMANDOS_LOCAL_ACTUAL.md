# ScanKey local — Comandos actuales (puertos estándar)

**Puertos:** Motor 8081, Gateway 8080, UI 5173.

---

## Opción 1: Script único (recomendado)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
.\scripts\start_local.ps1
```

Abre 3 ventanas (motor, gateway, UI). Crea `ui-studio/.env.local` si no existe. Tras ~10 s, ejecuta `.\scripts\check_local.ps1` para verificar.

---

## Opción 2: Manual (3 terminales)

### ui-studio/.env.local

```
VITE_GATEWAY_BASE_URL=http://localhost:8080
VITE_API_KEY=local-dev-key
```

### Terminal 1 — Motor (puerto 8081)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "C:\Users\guill\Desktop\scankey-v1a1"
$env:SCN_MOCK_ENGINE = "1"
python -m uvicorn motor.main:app --host 0.0.0.0 --port 8081
```

### Terminal 2 — Gateway (puerto 8080)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH = "C:\Users\guill\Desktop\scankey-v1a1"
$env:MOTOR_URL = "http://localhost:8081"
$env:API_KEYS = "local-dev-key"
$env:SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED = "false"
cd gateway
python -m uvicorn main:APP --host 0.0.0.0 --port 8080
```

### Terminal 3 — UI (puerto 5173)

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
npm.cmd -C ui-studio run dev:web
```

---

## Verificación (un comando)

```powershell
.\scripts\check_local.ps1
```

Comprueba motor, gateway y analyze-key. Exit 0 si todo OK.

## Validación manual

```powershell
# Motor
Invoke-WebRequest -Uri "http://localhost:8081/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Gateway
Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Smoke analyze-key
curl.exe -s -X POST "http://localhost:8080/api/analyze-key" -H "x-api-key: local-dev-key" -F "front=@C:\Users\guill\Desktop\scankey-v1a1\ui-studio\scripts\fixtures\test.png"
```

---

## URLs

| Servicio | URL |
|----------|-----|
| Motor /health | http://localhost:8081/health |
| Gateway /health | http://localhost:8080/health |
| UI | http://localhost:5173 |

---

## Puertos ocupados

Si 8081 o 8080 están ocupados, cambia puertos en las variables y en `ui-studio/.env.local` (VITE_GATEWAY_BASE_URL debe apuntar al gateway).
