/**
 * Pre-migration remediation script for clerk_id NOT NULL hardening.
 *
 * Run this BEFORE applying migration 20260502200000_auth_hardening_and_recovery:
 *   npx tsx scripts/migrate-clerk-id-nulls.ts --dry-run  (preview)
 *   npx tsx scripts/migrate-clerk-id-nulls.ts            (apply)
 *
 * What this script does:
 *   1. Reports ALL users (live and soft-deleted) with null clerk_id.
 *   2. Assigns "orphaned_<id>" placeholder clerk_id to every null row so
 *      the NOT NULL constraint can be applied without data loss.
 *
 * NOTE: Accounts are NOT soft-deleted by this script. They remain visible
 * to orphan recovery so that any associated data can be reclaimed when a
 * matching user signs in. Operators may manually soft-delete an account via
 * the admin console only after confirming it has no data worth recovering.
 *
 * Also reports duplicate clerk_id values (non-null) that must be resolved
 * manually before the migration can proceed.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const label = isDryRun ? "[DRY RUN] " : "";
  console.log(`${label}Scanning for null clerk_id rows (all users, including soft-deleted)...`);

  // Check ALL rows — including soft-deleted — because NOT NULL applies to every row.
  const nullRows = await db.$queryRaw<Array<{ id: string; email: string; deleted_at: string | null }>>`
    SELECT id::text, email, deleted_at::text FROM "User"
    WHERE clerk_id IS NULL
    ORDER BY created_at
  `;

  // Report duplicate clerk_ids among live users
  const dupRows = await db.$queryRaw<Array<{ clerk_id: string; count: string }>>`
    SELECT clerk_id, COUNT(*)::text AS count
    FROM "User"
    WHERE clerk_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY clerk_id
    HAVING COUNT(*) > 1
  `;

  if (dupRows.length > 0) {
    console.warn(`\nWARNING: ${dupRows.length} duplicate clerk_id value(s) among live users:`);
    for (const row of dupRows) {
      console.warn(`  clerk_id=${row.clerk_id}  count=${row.count}`);
    }
    console.warn("  These must be resolved manually (unique constraint conflict).");
  }

  if (nullRows.length === 0) {
    console.log(dupRows.length === 0
      ? "✓ No issues found. Migration is safe to apply."
      : "✓ No null clerk_id rows. Resolve duplicates above before migrating.");
    return;
  }

  console.log(`\nFound ${nullRows.length} user(s) with null clerk_id:`);
  for (const row of nullRows) {
    const state = row.deleted_at ? `soft-deleted at ${row.deleted_at}` : "live";
    console.log(`  id=${row.id}  email=${row.email}  state=${state}`);
  }
  console.log("\nThese accounts will receive a placeholder clerk_id so NOT NULL can be enforced.");
  console.log("They are NOT soft-deleted — orphan recovery can still reclaim their data.");

  if (isDryRun) {
    console.log("\n[DRY RUN] No changes made. Remove --dry-run to apply.");
    return;
  }

  console.log("\nApplying remediation...");

  await db.$transaction(async (tx) => {
    for (const row of nullRows) {
      await tx.$executeRaw`
        UPDATE "User"
        SET clerk_id = ${"orphaned_" + row.id}
        WHERE id = ${row.id}::uuid
          AND clerk_id IS NULL
      `;
      console.log(`  ✓ Assigned placeholder clerk_id to user ${row.id} (${row.email})`);
    }
  });

  console.log(`\n✓ Remediation complete. ${nullRows.length} user(s) updated.`);
  console.log("  You may now run: npx prisma migrate deploy");
}

main()
  .catch((err) => {
    console.error("Remediation failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
