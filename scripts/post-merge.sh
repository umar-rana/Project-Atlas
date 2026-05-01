#!/bin/bash
set -e

if [ -f package.json ]; then
  npm install --no-audit --no-fund
fi

npx prisma generate

# Resolve the best available database URL for migrations.
# Secrets stored via the Replit UI may be wrapped in single quotes — strip them.
strip_quotes() {
  local val="$1"
  val="${val#\'}"
  val="${val%\'}"
  echo "$val"
}

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
