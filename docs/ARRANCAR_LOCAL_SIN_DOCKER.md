# ScanKey — Arrancar local sin Docker (Windows)

Sin Docker, sin WSL, sin tocar BIOS. Comandos listos para copiar/pegar en PowerShell.

---

## 1. Diagnóstico real del repo

### Carpetas

| Carpeta | Rol | Entrypoint |
|---------|-----|------------|
| `gateway/` | API principal (proxy al motor, auth, CORS, audit) | `gateway/main.py` → `APP` |
| `motor/` | Motor de análisis de llaves (ONNX o mock) | `motor/main.py` → `app` |
| `backend/` | OCR auxiliar — no necesario para analyze-key | — |
| `common/` | Módulos compartidos (catalog_match, policy_engine, etc.) | — |
| `ui-studio/` | Frontend React/Vite | `npm run dev:web` |

### Puertos

| Servicio | Puerto | URL base |
|----------|--------|----------|
| Motor | 8081 (o 8083 si 8081/8082 ocupados) | http://localhost:8081 |
| Gateway | 8080 (o 8084 si 8080 ocupado) | http://localhost:8080 |
| UI | 5173 | http://localhost:5173 |

### Endpoints relevantes

- `/health` — Motor (8081) y Gateway (8080)
- `/motor/health` — Gateway proxy → Motor (requiere `x-api-key`)
- `/api/analyze-key` — POST con FormData (front, back/imagenes)

---

## 2. Variables de entorno locales

### Motor (Terminal 1)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `PYTHONPATH` | Ruta raíz del repo | Para importar `common` |
| `SCN_MOCK_ENGINE` | `1` | Modo mock sin modelo ONNX |

### Gateway (Terminal 2)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `PYTHONPATH` | Ruta raíz del repo | Para importar `common` |
| `MOTOR_URL` | `http://localhost:8081` | URL del motor |
| `API_KEYS` | `local-dev-key` | API key permitida |
| `SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED` | `false` | Evitar Google ID token en local |

### UI (Terminal 3)

Archivo `ui-studio/.env.local`:

```
VITE_GATEWAY_BASE_URL=http://localhost:8080
VITE_API_KEY=local-dev-key
```

---

## 3. Preparar entorno (una vez)

Desde `C:\Users\guill\Desktop\scankey-v1a1`:

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r motor\requirements.txt -r gateway\requirements.txt
```

---

## 4. Comandos por terminal

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
uvicorn main:APP --host 0.0.0.0 --port 8080
```

### Terminal 3 — UI (puerto 5173)

Asegúrate de tener `ui-studio/.env.local` con `VITE_GATEWAY_BASE_URL` y `VITE_API_KEY`.

```powershell
cd C:\Users\guill\Desktop\scankey-v1a1
npm.cmd -C ui-studio run dev:web
```

La web estará en: **http://localhost:5173**

---

## 5. Orden de arranque

1. **Terminal 1**: Motor (8081) — primero
2. **Terminal 2**: Gateway (8080) — cuando el motor esté arriba
3. **Terminal 3**: `npm.cmd -C ui-studio run dev:web`

---

## 6. Validación

### /health

```powershell
# Motor
Invoke-WebRequest -Uri "http://localhost:8081/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Gateway
Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Gateway → Motor (proxy)
Invoke-WebRequest -Uri "http://localhost:8080/motor/health" -Headers @{"x-api-key"="local-dev-key"} -UseBasicParsing | Select-Object -ExpandProperty Content
```

### /api/analyze-key (smoke test con imagen)

```powershell
$img = "C:\Users\guill\Desktop\scankey-v1a1\ui-studio\scripts\fixtures\test.png"
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$body = "--$boundary$LF" + "Content-Disposition: form-data; name=`"front`"; filename=`"test.png`"$LF" + "Content-Type: image/png$LF$LF" + [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString([System.IO.File]::ReadAllBytes($img)) + "$LF--$boundary--$LF"
Invoke-WebRequest -Uri "http://localhost:8080/api/analyze-key" -Method POST -Headers @{"x-api-key"="local-dev-key"} -ContentType "multipart/form-data; boundary=$boundary" -Body $body -UseBasicParsing | Select-Object -ExpandProperty Content
```

Si responde JSON con `results` y `debug.model_version: "scankey-mock-local"` → OK.

---

## 7. Mock vs motor real

| Modo | Variable | Comportamiento |
|------|----------|----------------|
| **Mock** | `SCN_MOCK_ENGINE=1` | Respuestas simuladas sin modelo ONNX. Sirve para validar cableado, UI y flujo. |
| **Motor real** | `SCN_MOCK_ENGINE` no definida o vacía | Requiere modelo ONNX en `MODEL_PATH` (por defecto `/tmp/modelo_llaves.onnx`). |

### Cómo saber si está en mock

- En la respuesta de `/api/analyze-key`: `debug.model_version === "scankey-mock-local"`
- En `/health` del motor: `model_ready: false` con `SCN_MOCK_ENGINE=1` es normal

### Siguiente paso para motor real

1. Obtener el modelo ONNX (ej. `modelo_llaves.onnx`) y colocarlo en una ruta accesible.
2. Definir `MODEL_PATH` con esa ruta (en Windows, ej. `C:\ruta\modelo_llaves.onnx`).
3. **No** definir `SCN_MOCK_ENGINE` o ponerla en `0`/`false`.
4. Arrancar el motor. Verás `model_ready: true` en `/health` cuando cargue.

---

## 8. Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `ModuleNotFoundError: No module named 'common'` | `PYTHONPATH` no incluye la raíz | Asegúrate de `$env:PYTHONPATH = "C:\Users\guill\Desktop\scankey-v1a1"` antes de arrancar motor/gateway |
| Gateway 502/504 al llamar motor | Motor no arrancado o MOTOR_URL incorrecto | Verifica que el motor esté en 8081 y `MOTOR_URL=http://localhost:8081` |
| 401 en analyze-key | API key no coincide | `API_KEYS=local-dev-key` en gateway y `VITE_API_KEY=local-dev-key` en ui-studio/.env.local |
| Gateway falla por ID token | Google auth en local | `SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED=false` |
| CORS desde la UI | Origen no permitido | Por defecto `ALLOWED_ORIGINS=*`; si cambias, incluye `http://localhost:5173` |

---

## 9. Riesgos y bloqueos pendientes

- **Motor real**: requiere modelo ONNX; si no lo tienes, usa mock.
- **GCS/feedback**: el gateway puede intentar escribir en Google Cloud Storage; en local puede fallar silenciosamente si no hay credenciales. No bloquea analyze-key.
- **Workshop login**: opcional; `WORKSHOP_LOGIN_EMAIL`, `WORKSHOP_LOGIN_PASSWORD`, `WORKSHOP_TOKEN` solo si usas modo taller.
