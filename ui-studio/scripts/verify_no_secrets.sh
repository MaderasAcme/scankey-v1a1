
#!/bin/bash

# Lead Engineer - Secret Scanner
# Busca patrones de secretos conocidos en el repo.

echo "🛡️ Escaneando secretos en el repositorio..."

# Patterns to find. These are regular expressions.
PATTERNS=(
  'access_token":\s*"[A-Za-z0-9\-_=]{20,}"' # Real access tokens (value >= 20 chars)
  'ya29\.[0-9A-Za-z\-_]+'                  # Google OAuth tokens
  'AIza[0-9A-Za-z\-_]{35}'                 # Google API Keys
  'ghp_[0-9A-Za-z]{36}'                    # GitHub Personal Access Token
  'github_pat_[0-9A-Za-z_]{80}'            # GitHub Personal Access Token (new format)
  '-----BEGIN (RSA|DSA|EC|PGP) PRIVATE KEY-----' # Generic Private Keys
  'sk-[a-zA-Z0-9]{32,}'                     # OpenAI, Anthropic, etc. API Keys
  'private_key'                            # Generic private key keyword
  'refresh_token'                          # Refresh tokens
  'recovery code'
  'xoxb-'                                  # Slack Bot Tokens
)

FOUND=0

# Exclude directories and files
EXCLUDE_DIRS=(
  node_modules
  .git
  scripts
  .gemini
  .config
  .cache
  WORK
  __pycache__
  .venv
  dist
  build
)

EXCLUDE_FILES=(
  README.md
  TESTING.md
  WORK_DUMP.sh
  WORK_DUMP_v2.sh
  .bash_history
  .gitignore_global
  .gitignore
  .gitignore_global_scankey
  *.pyc
)

# Build the grep exclude arguments
GREP_EXCLUDE_DIR_ARGS=$(printf -- "--exclude-dir=%s " "${EXCLUDE_DIRS[@]}")
GREP_EXCLUDE_FILE_ARGS=$(printf -- "--exclude=%s " "${EXCLUDE_FILES[@]}")

for p in "${PATTERNS[@]}"; do
  # Use -E for extended regex, -i for case-insensitive, --binary-files=without-match to skip binary files
  RES=$(grep -rEi --binary-files=without-match $GREP_EXCLUDE_DIR_ARGS $GREP_EXCLUDE_FILE_ARGS -- "$p" .)
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
