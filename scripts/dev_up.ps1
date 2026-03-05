# Levantar stack local (gateway + motor)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
docker compose -f docker-compose.local.yml up -d --build
