# Health check de gateway y motor
Write-Host "=== Gateway (8080) ==="
try { (Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get) | ConvertTo-Json } catch { Write-Host "FAIL" }
Write-Host ""
Write-Host "=== Motor (8081) ==="
try { (Invoke-RestMethod -Uri "http://localhost:8081/health" -Method Get) | ConvertTo-Json } catch { Write-Host "FAIL" }
