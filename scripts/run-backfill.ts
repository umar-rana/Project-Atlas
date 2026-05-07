/**
 * Standalone orphan-recovery backfill script.
 *
 * Run with:
 *   npx tsx scripts/run-backfill.ts
 *   npx tsx scripts/run-backfill.ts --dry-run   (preview only — no DB writes)
 *
 * What this script does (in order):
 *   1. Resolves User rows with `orphaned_` placeholder clerk_ids by querying
 *      the Clerk API and re-assigning the real clerk_id when a match is found.
 *   2. Verifies the `umar@rana.pk` account: checks Clerk, creates or restores a
 *      DB row as appropriate, and writes an audit entry either way.
 *   3. Reports the status of the duplicate-email orphan-recovery backfill.
 *      The actual data merge runs server-side via runBackfillOrphanRecovery()
 *      at app startup. Start the application after running this script to
 *      trigger that merge.
 *
 * Prerequisites:
 *   - CLERK_SECRET_KEY must be set (in .env.local or the environment)
 *   - DATABASE_URL must be set
 *
 * The script is fully idempotent — safe to run multiple times.
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local BEFORE importing anything that reads env vars
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  console.log(`[env] Loaded ${envPath}`);
}

const isDryRun = process.argv.includes("--dry-run");
if (isDryRun) {
  console.warn("[dry-run] Preview mode — no DB writes or Clerk mutations.\n");
}

// ---------------------------------------------------------------------------
// Validate required env vars
// ---------------------------------------------------------------------------
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY) {
  console.error(
    "ERROR: CLERK_SECRET_KEY is not set.\n" +
    "  Export it in your shell or add it to .env.local before running this script.\n" +
    "  Example: CLERK_SECRET_KEY=sk_live_... npx tsx scripts/run-backfill.ts",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Imports (after env is confirmed available)
// ---------------------------------------------------------------------------
import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";

const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
const db = new PrismaClient();

function newId(): string {
  return uuidv7();
}

// ---------------------------------------------------------------------------
// Audit log helper (lightweight, no server-only dependency)
// ---------------------------------------------------------------------------
async function writeAuditEntry(params: {
  user_id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (isDryRun) return;
  try {
    await db.$executeRaw`
      INSERT INTO "AuditLog" (id, user_id, entity_type, entity_id, action, meta, created_at)
      VALUES (
        ${newId()}::uuid,
        ${params.user_id ?? null}::uuid,
        ${params.entity_type},
        ${params.entity_id},
        ${params.action},
        ${JSON.stringify(params.meta ?? {})}::jsonb,
        NOW()
      )
    `;
  } catch (err) {
    console.error("[audit] Failed to write audit entry:", err);
  }
}

// ---------------------------------------------------------------------------
// Step 1: Resolve `orphaned_` placeholder clerk_ids via Clerk API
// ---------------------------------------------------------------------------
console.log("=".repeat(60));
console.log("STEP 1: Resolve orphaned_ placeholder clerk_ids via Clerk API");
console.log("=".repeat(60));

const orphanedUsers = await db.$queryRaw<
  Array<{ id: string; email: string; clerk_id: string; deleted_at: string | null }>
>`
  SELECT id::text, email, clerk_id, deleted_at::text
  FROM "User"
  WHERE clerk_id LIKE 'orphaned_%'
  ORDER BY created_at ASC
`;

console.log(`Found ${orphanedUsers.length} user(s) with orphaned_ placeholder clerk_id.`);

const step1 = { scanned: 0, resolved: 0, not_found: 0, errors: [] as string[] };

for (const row of orphanedUsers) {
  step1.scanned++;
  try {
    const result = await clerk.users.getUserList({ emailAddress: [row.email] });
    if (result.totalCount === 0 || !result.data[0]) {
      console.log(`  ${row.email} → no Clerk account found`);
      step1.not_found++;
      continue;
    }

    const clerkUser = result.data[0];
    console.log(`  ${row.email} → Clerk account found (${clerkUser.id})`);

    if (!isDryRun) {
      await db.$executeRaw`
        UPDATE "User"
        SET clerk_id    = ${clerkUser.id},
            deleted_at  = NULL,
            updated_at  = NOW()
        WHERE id = ${row.id}::uuid
          AND clerk_id = ${row.clerk_id}
      `;
      await writeAuditEntry({
        user_id: row.id,
        entity_type: "AuthEvent",
        entity_id: row.id,
        action: "auth:resolved_by_clerk_id",
        meta: {
          clerk_id: clerkUser.id,
          previous_placeholder: row.clerk_id,
          email: row.email,
          note: "clerk_id placeholder resolved by run-backfill script",
        },
      });
      console.log(`    ✓ Updated DB row — real clerk_id assigned`);
    } else {
      console.log(`    [dry-run] Would update DB row with clerk_id=${clerkUser.id}`);
    }
    step1.resolved++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    step1.errors.push(`${row.email}: ${msg}`);
    console.error(`  ERROR processing ${row.email}:`, msg);
  }
}

if (!isDryRun) {
  await writeAuditEntry({
    entity_type: "AuthEvent",
    entity_id: newId(),
    action: "backfill_resolve_orphaned_clerk_ids_completed",
    meta: step1,
  });
}
console.log("Step 1 summary:", step1);

// ---------------------------------------------------------------------------
// Step 2: Verify / create the umar@rana.pk account
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log("STEP 2: Verify umar@rana.pk account");
console.log("=".repeat(60));

const TARGET_EMAIL = "umar@rana.pk";

const clerkResult = await clerk.users.getUserList({ emailAddress: [TARGET_EMAIL] });
const targetClerkUser = clerkResult.data[0] ?? null;

if (!targetClerkUser) {
  console.log(`No Clerk account found for ${TARGET_EMAIL}.`);
  console.log(
    "This user has never signed up via Clerk, or used a different email.\n" +
    "No DB row can be meaningfully created without a real Clerk ID.\n" +
    "Writing forensic audit entry.",
  );
  await writeAuditEntry({
    entity_type: "AuthEvent",
    entity_id: newId(),
    action: "auth:failed",
    meta: {
      email: TARGET_EMAIL,
      reason: "no_clerk_account_found",
      note:
        "Verified by run-backfill script on " +
        new Date().toISOString() +
        " — no Clerk account exists for this email address.",
      investigated_by: "scripts/run-backfill.ts",
    },
  });
  if (isDryRun) console.log("[dry-run] Would write auth:failed audit entry.");
  else console.log("Audit entry written: auth:failed (no_clerk_account_found)");
} else {
  console.log(`Clerk account found for ${TARGET_EMAIL}:`);
  console.log(`  clerk_id : ${targetClerkUser.id}`);
  const fullName = [targetClerkUser.firstName, targetClerkUser.lastName]
    .filter(Boolean)
    .join(" ") || null;
  console.log(`  name     : ${fullName ?? "(none)"}`);

  // Check DB for existing row by clerk_id or email (including soft-deleted)
  const existingRows = await db.$queryRaw<Array<{ id: string; deleted_at: string | null; clerk_id: string }>>`
    SELECT id::text, deleted_at::text, clerk_id
    FROM "User"
    WHERE clerk_id = ${targetClerkUser.id}
       OR email ILIKE ${TARGET_EMAIL}
    LIMIT 1
  `;
  const existingRow = existingRows[0] ?? null;

  if (existingRow) {
    const state = existingRow.deleted_at ? "soft-deleted" : "live";
    console.log(`Existing DB row found (id=${existingRow.id}, state=${state}).`);
    if (!isDryRun) {
      await db.$executeRaw`
        UPDATE "User"
        SET clerk_id   = ${targetClerkUser.id},
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = ${existingRow.id}::uuid
      `;
      await writeAuditEntry({
        user_id: existingRow.id,
        entity_type: "AuthEvent",
        entity_id: existingRow.id,
        action: "auth:resolved_by_clerk_id",
        meta: {
          clerk_id: targetClerkUser.id,
          email: TARGET_EMAIL,
          previous_state: state,
          note: "Confirmed and restored by run-backfill script",
          investigated_by: "scripts/run-backfill.ts",
        },
      });
      console.log(`✓ Updated DB row — clerk_id set to ${targetClerkUser.id}, deleted_at cleared.`);
    } else {
      console.log(`[dry-run] Would update DB row ${existingRow.id} with real clerk_id.`);
    }
  } else {
    console.log(`No DB row found for ${TARGET_EMAIL}. Creating placeholder so orphan recovery can run on next sign-in.`);
    const userId = newId();
    if (!isDryRun) {
      await db.$executeRaw`
        INSERT INTO "User" (
          id, clerk_id, email, name,
          timezone, date_format, time_format, week_start, theme,
          created_at, updated_at
        )
        VALUES (
          ${userId}::uuid,
          ${targetClerkUser.id},
          ${TARGET_EMAIL},
          ${fullName},
          'UTC', 'DD/MM/YYYY', '24h', 'monday', 'dark',
          NOW(), NOW()
        )
        ON CONFLICT (email) DO UPDATE
          SET clerk_id   = EXCLUDED.clerk_id,
              deleted_at = NULL,
              updated_at  = NOW()
      `;
      await writeAuditEntry({
        user_id: userId,
        entity_type: "AuthEvent",
        entity_id: userId,
        action: "auth:created_new_user",
        meta: {
          clerk_id: targetClerkUser.id,
          email: TARGET_EMAIL,
          note: "Row created by run-backfill script — real Clerk account exists, user can now sign in",
          investigated_by: "scripts/run-backfill.ts",
        },
      });
      console.log(`✓ Created DB row for ${TARGET_EMAIL} (id=${userId}).`);
    } else {
      console.log(`[dry-run] Would create DB row for ${TARGET_EMAIL} with clerk_id=${targetClerkUser.id}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3: Report duplicate-email group status (informational only)
//
// IMPORTANT: The actual duplicate-email orphan-recovery merge logic lives in
// src/core/auth/backfill.ts (runBackfillOrphanRecovery). This script does NOT
// run that logic because it depends on server-only Prisma middleware that is
// unavailable outside the Next.js runtime.
//
// This step only reports the current state. To run the full merge, start the
// application — runBackfillOrphanRecovery() runs at server startup and writes
// a `backfill_orphan_recovery_completed` audit entry when done.
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log("STEP 3: Duplicate-email group status (informational)");
console.log("=".repeat(60));

const completedEntry = await db.auditLog.findFirst({
  where: { action: "backfill_orphan_recovery_completed" },
  select: { id: true, created_at: true },
});

if (completedEntry) {
  console.log(
    `Server-side orphan-recovery backfill already completed at ` +
    `${completedEntry.created_at.toISOString()} — nothing more to do.`,
  );
} else {
  // Count duplicate email groups to give operators a picture of scope
  const allUsers = await db.$queryRaw<Array<{ email: string; cnt: string }>>`
    SELECT LOWER(email) AS email, COUNT(*)::text AS cnt
    FROM "User"
    WHERE deleted_at IS NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;

  if (allUsers.length === 0) {
    console.log("No duplicate-email groups found — orphan recovery is not needed.");
    console.log(
      "Note: the server-side backfill has not written its completion marker yet.\n" +
      "Start the application; runBackfillOrphanRecovery() will run and confirm this.",
    );
  } else {
    console.log(`${allUsers.length} duplicate-email group(s) detected:`);
    for (const row of allUsers) {
      console.log(`  ${row.email} — ${row.cnt} rows`);
    }
    console.log(
      "\nACTION REQUIRED: Start the application to trigger the server-side orphan-recovery\n" +
      "backfill (src/core/auth/backfill.ts). It will merge ghost accounts into each\n" +
      "canonical account and write a backfill_orphan_recovery_completed audit entry.",
    );
  }
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log("Backfill script complete.");
console.log("=".repeat(60));

await db.$disconnect();
process.exit(0);
