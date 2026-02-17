
#!/bin/bash

# Lead Engineer - Secret Scanner
# Busca patrones de secretos conocidos en el repo.

echo "🛡️ Escaneando secretos en el repositorio..."

PATTERNS=(
  "BEGIN PRIVATE KEY"
  "private_key"
  "refresh_token"
  "AIza"         # Google API Keys
  "ghp_"         # GitHub Tokens
  "recovery code"
  "sk-ant-"      # Anthropic
  "xoxb-"        # Slack
  "access_token"
)

FOUND=0

for p in "${PATTERNS[@]}"; do
  # Ignoramos node_modules, .git y este propio script
  RES=$(grep -rEi "$p" . --exclude-dir={node_modules,.git,scripts} --exclude={README.md,TESTING.md})
  if [ ! -z "$RES" ]; then
    echo "❌ ERROR: Posible secreto encontrado con el patrón '$p':"
    echo "$RES"
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo "🚨 Escaneo fallido. Por favor, elimina los secretos y rótalos."
  exit 1
else
  echo "✅ No se encontraron patrones de secretos conocidos."
  exit 0
fi
