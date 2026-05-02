/**
 * clerk_id NOT NULL hardening
 *
 * clerk_id must be non-nullable on the User table. This module provides:
 *
 *   enforceClerkIdNonNull()   — runtime health check (read-only diagnostic)
 *   diagnoseClerkIdPlaceholders() — finds rows assigned placeholder prefixes
 *
 * PRE-MIGRATION REMEDIATION:
 *   Before running the 20260502200000_auth_hardening_and_recovery migration,
 *   execute: npx tsx scripts/migrate-clerk-id-nulls.ts
 *
 *   That script will:
 *     1. Report ALL users (live and soft-deleted) with null clerk_id
 *     2. Assign "orphaned_<id>" placeholder so the NOT NULL constraint can be applied
 *
 *   Accounts are NOT soft-deleted — they remain visible to orphan recovery so that
 *   any associated data can be reclaimed when a matching user signs in. Operators
 *   may manually soft-delete an account via the admin console only after confirming
 *   it has no data worth recovering.
 */

import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "auth/clerk-id-hardening" });

export interface HardeningResult {
  clean: boolean;
  nullRowCount: number;
  nullRowIds: string[];
  message: string;
}

/**
 * Preflight health check — verifies no live users have null clerk_id.
 * Read-only; does NOT mutate data.
 * Call this at startup to detect regressions early.
 */
export async function enforceClerkIdNonNull(): Promise<HardeningResult> {
  const nullRows = await db.$queryRaw<Array<{ id: string; email: string }>>`
    SELECT id::text, email FROM "User"
    WHERE clerk_id IS NULL AND deleted_at IS NULL
  `;

  if (nullRows.length > 0) {
    const ids = nullRows.map((r) => r.id);
    log.error(
      { null_clerk_id_count: nullRows.length, user_ids: ids },
      "ALERT: Live users with null clerk_id detected. " +
        "Run: npx tsx scripts/migrate-clerk-id-nulls.ts to remediate, " +
        "then re-run migration 20260502200000_auth_hardening_and_recovery.",
    );
    return {
      clean: false,
      nullRowCount: nullRows.length,
      nullRowIds: ids,
      message:
        `Preflight failed: ${nullRows.length} live user(s) have null clerk_id. ` +
        "Run the remediation script before applying the migration.",
    };
  }

  log.info("clerk_id preflight passed — all live users have a non-null clerk_id.");
  return {
    clean: true,
    nullRowCount: 0,
    nullRowIds: [],
    message: "Preflight passed. Safe to apply NOT NULL migration.",
  };
}

/**
 * Finds users whose clerk_id was assigned a placeholder prefix during remediation.
 * These users have no real Clerk identity and should be reviewed.
 */
export async function diagnoseClerkIdPlaceholders(): Promise<{
  liveCount: number;
  deletedCount: number;
  liveUsers: Array<{ id: string; email: string; clerk_id: string }>;
}> {
  const liveUsers = await db.$queryRaw<Array<{ id: string; email: string; clerk_id: string }>>`
    SELECT id::text, email, clerk_id FROM "User"
    WHERE (clerk_id LIKE 'orphaned_%' OR clerk_id LIKE 'reassigned_%')
      AND deleted_at IS NULL
  `;
  const deletedRows = await db.$queryRaw<Array<{ count: string }>>`
    SELECT COUNT(*)::text AS count FROM "User"
    WHERE (clerk_id LIKE 'orphaned_%' OR clerk_id LIKE 'reassigned_%')
      AND deleted_at IS NOT NULL
  `;
  const deletedCount = parseInt(deletedRows[0]?.count ?? "0", 10);
  log.info(
    { live_placeholder_count: liveUsers.length, deleted_placeholder_count: deletedCount },
    "clerk_id placeholder diagnostic complete",
  );
  return { liveCount: liveUsers.length, deletedCount, liveUsers };
}
