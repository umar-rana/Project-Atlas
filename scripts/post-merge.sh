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

# Retry prisma migrate deploy up to 6 times to handle transient Neon advisory
# lock timeouts (pg_advisory_lock contention on the pooler connection).
# Uses exponential backoff: 10s, 20s, 30s, 40s, 50s between attempts.
MAX_RETRIES=6
ATTEMPT=0
SUCCESS=false

while [ "$ATTEMPT" -lt "$MAX_RETRIES" ]; do
  OUTPUT=$(npx prisma migrate deploy 2>&1)
  EXIT_CODE=$?
  echo "$OUTPUT"

  if [ "$EXIT_CODE" -eq 0 ]; then
    SUCCESS=true
    break
  fi

  # If the only issue is the advisory lock timeout AND there are no pending
  # migrations, treat it as a success (schema is already up to date).
  if echo "$OUTPUT" | grep -q "No pending migrations to apply"; then
    echo "No pending migrations — schema is up to date." >&2
    SUCCESS=true
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
    break
  fi

  WAIT=$((ATTEMPT * 10))
  echo "prisma migrate deploy failed (attempt $ATTEMPT/$MAX_RETRIES), retrying in ${WAIT}s..." >&2
  sleep "$WAIT"
done

if [ "$SUCCESS" != "true" ]; then
  echo "ERROR: prisma migrate deploy failed after $MAX_RETRIES attempts." >&2
  exit 1
fi
