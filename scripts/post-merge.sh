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

# Retry prisma migrate deploy up to 3 times to handle transient Neon advisory
# lock timeouts (pg_advisory_lock contention on the pooler connection).
MAX_RETRIES=3
ATTEMPT=0
until npx prisma migrate deploy; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: prisma migrate deploy failed after $MAX_RETRIES attempts." >&2
    exit 1
  fi
  echo "prisma migrate deploy failed (attempt $ATTEMPT/$MAX_RETRIES), retrying in 10s..." >&2
  sleep 10
done
