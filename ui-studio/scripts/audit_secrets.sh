#!/bin/bash

# Lead Engineer - Security Audit Script
# Detecta patrones comunes de secretos y credenciales.

echo "🔍 Iniciando auditoría de seguridad en el código fuente..."

PATTERNS=(
    "BEGIN PRIVATE KEY"
    "private_key"
    "refresh_token"
    "AIza"         # Google API Keys
    "ghp_"         # GitHub Personal Access Tokens
    "recovery code"
    "client_secret"
    "passwd"
)

FOUND=0

for pattern in "${PATTERNS[@]}"; do
    # Buscamos ignorando node_modules y el propio script de auditoría
    grep -rEi "$pattern" . --exclude-dir=node_modules --exclude=audit_secrets.sh --exclude=README.md
    if [ $? -eq 0 ]; then
        echo "❌ ¡ALERTA! Se encontró el patrón: '$pattern'"
        FOUND=1
    fi
done

if [ $FOUND -eq 1 ]; then
    echo "🚨 Auditoría fallida. Se detectaron posibles secretos. Revisa el código antes de subir."
    exit 1
else
    echo "✅ No se detectaron patrones sensibles conocidos."
    exit 0
fi
