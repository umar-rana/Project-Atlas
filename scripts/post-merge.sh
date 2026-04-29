#!/bin/bash
set -e

if [ -f package.json ]; then
  npm install --no-audit --no-fund
fi

# Strip any surrounding single or double quotes that may have been included
# when the secret was stored (e.g. DIRECT_DATABASE_URL="'postgresql://...'").
# Fall back to DATABASE_URL if DIRECT_DATABASE_URL is not configured.
_raw_direct="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
_raw_direct="${_raw_direct#\'}"
_raw_direct="${_raw_direct%\'}"
_raw_direct="${_raw_direct#\"}"
_raw_direct="${_raw_direct%\"}"
export DIRECT_DATABASE_URL="$_raw_direct"

npx prisma generate

# Resolve the best available database URL for migrations.
# Secrets stored via the Replit UI may be wrapped in single quotes — strip them.
strip_quotes() {
  local val="$1"
  val="${val#\'}"
  val="${val%\'}"
  echo "$val"
}

if [ -n "$DIRECT_DATABASE_URL" ]; then
  export DIRECT_DATABASE_URL="$(strip_quotes "$DIRECT_DATABASE_URL")"
fi

if [ -n "$DATABASE_URL_NEON" ]; then
  RESOLVED_URL="$(strip_quotes "$DATABASE_URL_NEON")"
elif [ -n "$DATABASE_URL" ]; then
  RESOLVED_URL="$(strip_quotes "$DATABASE_URL")"
else
  echo "ERROR: No DATABASE_URL or DATABASE_URL_NEON found." >&2
  exit 1
fi

export DATABASE_URL="$RESOLVED_URL"

npx prisma migrate deploy
