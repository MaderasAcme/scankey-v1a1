# Verifica que Cloudflare NO cachee HTML en scankeyapp.com.
# Requisitos: PowerShell 5.1+ (Invoke-WebRequest)
#
# FAIL si cf-cache-status=HIT en / o /index.html (HTML no debe cachearse).
# OK si BYPASS o MISS en esos recursos.
#
# Alternativa en Windows sin curl: usar WSL o Git Bash con
#   bash scripts/verify_cloudflare_cache.sh

$ErrorActionPreference = "Continue"
$Base = "https://scankeyapp.com"
$Fail = $false

$tests = @(
  @{ Url = "$Base/"; Label = "GET /" }
  @{ Url = "$Base/index.html"; Label = "GET /index.html" }
  @{ Url = "$Base/deploy-ping.txt"; Label = "GET /deploy-ping.txt" }
)

Write-Host "Verificando cache Cloudflare en scankeyapp.com"
Write-Host "Criterio: / y /index.html deben ser BYPASS o MISS (nunca HIT)"

foreach ($t in $tests) {
  Write-Host ""
  Write-Host "=== $($t.Label) ($($t.Url)) ==="
  try {
    $r = Invoke-WebRequest -Uri $t.Url -Method Get -UseBasicParsing -MaximumRedirection 5
    $resp = $r
  } catch {
    $resp = $_.Exception.Response
  }
  if (-not $resp) {
    Write-Host "  Error al conectar"
    continue
  }
  $h = $resp.Headers
  $cf = if ($h["Cf-Cache-Status"]) { $h["Cf-Cache-Status"] } else { "<no presente>" }
  $age = if ($h["Age"]) { $h["Age"] } else { "<no presente>" }
  $server = if ($h["Server"]) { $h["Server"] } else { "<no presente>" }
  Write-Host "  cf-cache-status: $cf"
  Write-Host "  age: $age"
  Write-Host "  server: $server"
  $upper = if ($cf) { $cf.ToString().ToUpper() } else { "" }
  if ($upper -eq "HIT") {
    Write-Host "  -> FAIL (HTML/deploy-ping no debe estar en cache)"
    $Fail = $true
  } else {
    Write-Host "  -> OK"
  }
}

Write-Host ""
if ($Fail) {
  Write-Host "RESULTADO: FAIL - HTML o deploy-ping esta cacheado (cf-cache-status=HIT)"
  Write-Host "Configura Cache Rules: Bypass para /, /index.html y /deploy-ping.txt"
  Write-Host "Ver docs/CLOUDFLARE_CACHE.md"
  exit 1
}

Write-Host "RESULTADO: OK - HTML y deploy-ping no estan en cache"
exit 0
