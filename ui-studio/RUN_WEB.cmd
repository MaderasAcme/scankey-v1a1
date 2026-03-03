@echo off
cd /d "%~dp0"

echo [RUN_WEB] Matando cualquier proceso en puerto 5173...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :5173 ^| findstr LISTENING') do (
  taskkill /PID %%a /F 2>nul
)

echo [RUN_WEB] Instalando dependencias...
call npm install --no-audit --no-fund

echo [RUN_WEB] Iniciando Vite en http://localhost:5173
call npm run dev:web
