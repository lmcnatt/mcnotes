#!/bin/sh
set -e

# Default data directory (overridable via DATA_DIR env).
: "${DATA_DIR:=/data}"
mkdir -p "$DATA_DIR"

# Generate and persist a strong JWT secret on first run if one was not supplied.
# This keeps sessions valid across container restarts without requiring the user
# to manage a secret manually. Provide JWT_SECRET explicitly to override.
if [ -z "$JWT_SECRET" ]; then
  SECRET_FILE="$DATA_DIR/.jwt_secret"
  if [ ! -f "$SECRET_FILE" ]; then
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" > "$SECRET_FILE"
    echo "[entrypoint] Generated a new JWT secret at $SECRET_FILE"
  fi
  JWT_SECRET="$(cat "$SECRET_FILE")"
  export JWT_SECRET
fi

# Hand off to the Next.js standalone server.
exec node server.js
