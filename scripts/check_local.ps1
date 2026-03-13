# ScanKey - Verificación local reproducible (motor + gateway + analyze-key)
# Uso: .\scripts\check_local.ps1
# Requiere: motor (8081) y gateway (8080) en marcha
# Exit: 0 si OK, 1 si falla

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$MotorHealth = "http://localhost:8081/health"
$GatewayHealth = "http://localhost:8080/health"
$AnalyzeUrl = "http://localhost:8080/api/analyze-key"
$TestImage = Join-Path $Root "ui-studio\scripts\fixtures\test.png"

$Failed = $false

# 1. Motor health
try {
    $r = Invoke-WebRequest -Uri $MotorHealth -UseBasicParsing -TimeoutSec 5
    $j = $r.Content | ConvertFrom-Json
    if ($j.ok -eq $true) {
        Write-Host "MOTOR OK"
    } else {
        Write-Host "MOTOR FAIL: health ok=$($j.ok)"
        $Failed = $true
    }
} catch {
    Write-Host "MOTOR FAIL: $($_.Exception.Message)"
    $Failed = $true
}

# 2. Gateway health
try {
    $r = Invoke-WebRequest -Uri $GatewayHealth -UseBasicParsing -TimeoutSec 5
    $j = $r.Content | ConvertFrom-Json
    if ($j.ok -eq $true) {
        Write-Host "GATEWAY OK"
    } else {
        Write-Host "GATEWAY FAIL: health ok=$($j.ok)"
        $Failed = $true
    }
} catch {
    Write-Host "GATEWAY FAIL: $($_.Exception.Message)"
    $Failed = $true
}

# 3. Analyze-key POST
if (-not (Test-Path $TestImage)) {
    Write-Host "ANALYZE FAIL: imagen no encontrada: $TestImage"
    $Failed = $true
} else {
    try {
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        $fileBytes = [System.IO.File]::ReadAllBytes($TestImage)
        $body = "--$boundary$LF" +
            "Content-Disposition: form-data; name=`"front`"; filename=`"test.png`"$LF" +
            "Content-Type: image/png$LF$LF" +
            [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileBytes) +
            "$LF--$boundary--$LF"
        $r = Invoke-WebRequest -Uri $AnalyzeUrl -Method POST -Headers @{"x-api-key"="local-dev-key"} `
            -ContentType "multipart/form-data; boundary=$boundary" -Body $body -UseBasicParsing -TimeoutSec 30
        $json = $r.Content
        $j = $json | ConvertFrom-Json
        $hasResults = $j.results -is [Array] -and $j.results.Count -ge 1
        $modelVer = if ($j.debug) { $j.debug.model_version } else { $null }
        if ($hasResults -and $modelVer) {
            if ($null -ne $j.PSObject.Properties["ok"] -and $j.ok -eq $false) {
                Write-Host "ANALYZE FAIL: ok=false en respuesta"
                $Failed = $true
            } else {
                Write-Host "ANALYZE OK"
            }
        } else {
            Write-Host "ANALYZE FAIL: respuesta sin results o debug.model_version (model_version=$modelVer)"
            $Failed = $true
        }
    } catch {
        Write-Host "ANALYZE FAIL: $($_.Exception.Message)"
        $Failed = $true
    }
}

if ($Failed) { exit 1 }
exit 0
