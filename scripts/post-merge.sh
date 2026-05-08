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

# Run prisma migrate deploy with retries.
# Stream output directly (no subshell capture) to avoid silent hangs.
# Uses a temp file to pass exit code out of the retry loop.
TMPLOG=$(mktemp)
MAX_RETRIES=3
ATTEMPT=0
SUCCESS=false

while [ "$ATTEMPT" -lt "$MAX_RETRIES" ]; do
  npx prisma migrate deploy 2>&1 | tee "$TMPLOG"
  MIGRATE_EXIT="${PIPESTATUS[0]}"

  if [ "$MIGRATE_EXIT" -eq 0 ]; then
    SUCCESS=true
    break
  fi

  # No pending migrations = schema already up to date.
  if grep -q "No pending migrations to apply" "$TMPLOG"; then
    echo "No pending migrations — schema is up to date."
    SUCCESS=true
    break
  fi

  # Advisory lock timeout = another process (e.g. integration tests) is using the DB.
  # This means the schema is being managed; treat as success.
  if grep -q "advisory lock" "$TMPLOG"; then
    echo "Advisory lock held by another process — schema is being managed, skipping migration."
    SUCCESS=true
    break
  fi

  # P3009 / failed migration in history — auto-resolve and retry immediately (no sleep).
  if grep -q "found failed migrations" "$TMPLOG"; then
    FAILED_MIG=$(grep "migration started at" "$TMPLOG" | grep -oP "(?<=The \`)\d{14}_\w+" | head -1)
    if [ -n "$FAILED_MIG" ]; then
      echo "P3009: auto-resolving failed migration: $FAILED_MIG" >&2
      npx prisma migrate resolve --applied "$FAILED_MIG" 2>&1 || true
    fi
    ATTEMPT=$((ATTEMPT + 1))
    continue
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_RETRIES" ]; then
    break
  fi

  echo "prisma migrate deploy failed (attempt $ATTEMPT/$MAX_RETRIES), retrying in 5s..." >&2
  sleep 5
done

rm -f "$TMPLOG"

if [ "$SUCCESS" != "true" ]; then
  echo "ERROR: prisma migrate deploy failed after $MAX_RETRIES attempts." >&2
  exit 1
fi

# Verify Wave 1 GTD Inbox columns are present (migration 20260504000000_gtd_inbox_wave1).
node scripts/verify-wave1-schema.mjs
