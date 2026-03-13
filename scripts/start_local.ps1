# ScanKey - Arrancar stack local sin Docker (motor + gateway + UI)
# Uso: .\scripts\start_local.ps1
# Abre 3 ventanas: motor (8081), gateway (8080), UI (5173)
# Requiere: .venv activable, ui-studio/.env.local con VITE_GATEWAY_BASE_URL y VITE_API_KEY

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$VenvActivate = Join-Path $Root ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $VenvActivate)) {
    Write-Error "No existe .venv. Ejecuta: python -m venv .venv && pip install -r motor/requirements.txt -r gateway/requirements.txt"
}

# Crear .env.local en UI si no existe
$UiEnvLocal = Join-Path $Root "ui-studio\.env.local"
if (-not (Test-Path $UiEnvLocal)) {
    @"
VITE_GATEWAY_BASE_URL=http://localhost:8080
VITE_API_KEY=local-dev-key
"@ | Set-Content -Path $UiEnvLocal -Encoding utf8
    Write-Host "Creado ui-studio/.env.local"
}

# Terminal 1 - Motor
$MotorCmd = @"
Set-Location '$Root'
& '$VenvActivate'
`$env:PYTHONPATH = '$Root'
`$env:SCN_MOCK_ENGINE = '1'
python -m uvicorn motor.main:app --host 0.0.0.0 --port 8081
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $MotorCmd

Start-Sleep -Seconds 2

# Terminal 2 - Gateway
$GatewayDir = Join-Path $Root "gateway"
$GatewayCmd = @"
Set-Location '$Root'
& '$VenvActivate'
`$env:PYTHONPATH = '$Root'
`$env:MOTOR_URL = 'http://localhost:8081'
`$env:API_KEYS = 'local-dev-key'
`$env:SCN_FEATURE_GATEWAY_IDTOKEN_PROXY_ENABLED = 'false'
Set-Location '$GatewayDir'
python -m uvicorn main:APP --host 0.0.0.0 --port 8080
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $GatewayCmd

Start-Sleep -Seconds 2

# Terminal 3 - UI
$UiCmd = @"
Set-Location '$Root'
npm.cmd -C ui-studio run dev:web
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $UiCmd

Write-Host ""
Write-Host "Stack local iniciado. 3 ventanas abiertas:"
Write-Host "  Motor:   http://localhost:8081/health"
Write-Host "  Gateway: http://localhost:8080/health"
Write-Host "  UI:      http://localhost:5173"
Write-Host ""
Write-Host "Smoke test: curl.exe -s -X POST `"http://localhost:8080/api/analyze-key`" -H `"x-api-key: local-dev-key`" -F `"front=@$Root\ui-studio\scripts\fixtures\test.png`""
