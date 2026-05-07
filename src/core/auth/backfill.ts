import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import { verifyIsOrphan, reattachOrphanData, flagForRecoveryNotification } from "./orphan-recovery";

const log = createLogger({ module: "auth/backfill" });

interface ClerkClientLike {
  users: {
    getUserList(params: { emailAddress: string[] }): Promise<{
      totalCount: number;
      data: Array<{ id: string; firstName: string | null; lastName: string | null }>;
    }>;
  };
}

export interface OrphanedClerkIdReport {
  scanned: number;
  resolved: number;
  not_found_in_clerk: number;
  errors: string[];
}

/**
 * Resolves User rows that have a placeholder `orphaned_<id>` clerk_id assigned
 * by the migrate-clerk-id-nulls remediation script.
 *
 * For each such row, we query the Clerk API by the user's stored email address.
 * If a real Clerk account exists, the placeholder clerk_id is replaced with the
 * real one so the next sign-in resolves by Clerk ID rather than creating a new
 * empty account.
 *
 * This function is idempotent — rows that have already been resolved will have
 * a non-placeholder clerk_id and will be skipped automatically.
 *
 * @param clerkClient - A Clerk client instance (from @clerk/backend createClerkClient)
 */
export async function resolveOrphanedClerkIds(
  clerkClient: ClerkClientLike,
): Promise<OrphanedClerkIdReport> {
  const report: OrphanedClerkIdReport = {
    scanned: 0,
    resolved: 0,
    not_found_in_clerk: 0,
    errors: [],
  };

  const orphanedUsers = await db.$queryRaw<
    Array<{ id: string; email: string; clerk_id: string; deleted_at: string | null }>
  >`
    SELECT id::text, email, clerk_id, deleted_at::text
    FROM "User"
    WHERE clerk_id LIKE 'orphaned_%'
    ORDER BY created_at ASC
  `;

  if (orphanedUsers.length === 0) {
    log.info("resolveOrphanedClerkIds: no orphaned_ placeholder rows found — nothing to do");
    return report;
  }

  log.info(
    { count: orphanedUsers.length },
    "resolveOrphanedClerkIds: scanning users with orphaned_ placeholder clerk_ids",
  );

  for (const row of orphanedUsers) {
    report.scanned++;
    try {
      const result = await clerkClient.users.getUserList({ emailAddress: [row.email] });
      if (result.totalCount === 0 || !result.data[0]) {
        log.info(
          { user_id: row.id, email: row.email },
          "resolveOrphanedClerkIds: no Clerk account found for email — user remains orphaned",
        );
        report.not_found_in_clerk++;
        continue;
      }

      const clerkUser = result.data[0];
      await db.$executeRaw`
        UPDATE "User"
        SET clerk_id = ${clerkUser.id},
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = ${row.id}::uuid
          AND clerk_id = ${row.clerk_id}
      `;

      await logActivity({
        user_id: row.id,
        entity_type: "AuthEvent",
        entity_id: row.id,
        action: "auth:resolved_by_clerk_id",
        meta: {
          clerk_id: clerkUser.id,
          previous_placeholder: row.clerk_id,
          email: row.email,
          note: "clerk_id placeholder resolved by backfill script",
        },
      });

      log.info(
        { user_id: row.id, email: row.email, real_clerk_id: clerkUser.id },
        "resolveOrphanedClerkIds: resolved placeholder clerk_id to real Clerk account",
      );
      report.resolved++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`user ${row.id} (${row.email}): ${msg}`);
      log.error({ err, user_id: row.id, email: row.email }, "resolveOrphanedClerkIds: error processing row");
    }
  }

  await logActivity({
    entity_type: "AuthEvent",
    entity_id: newId(),
    action: "backfill_resolve_orphaned_clerk_ids_completed",
    meta: report as unknown as Record<string, unknown>,
  });

  log.info(report, "resolveOrphanedClerkIds: completed");
  return report;
}

/**
 * Check whether the auth-hardening migration (20260502200000) has been applied
 * by verifying that the recovery_notification_pending column exists on the User
 * table. If the column is absent the migration has not run yet and the backfill
 * must not proceed (the recovery-notification write would fail).
 *
 * This provides a strong deployment-order guarantee: backfill only executes
 * after the schema is ready, regardless of when the job runner starts.
 */
async function isMigrationApplied(): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name = 'recovery_notification_pending'
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * One-time orphan-recovery backfill.
 *
 * OPERATIONAL NOTE: This function is invoked from the job runner process at
 * startup (see src/jobs/runner.ts). If your environment does not run the job
 * runner (e.g. edge/serverless deployments, read-only replicas), this backfill
 * will NOT execute automatically. In that case, trigger it manually by running:
 *
 *   npx tsx -e "require('./src/core/auth/backfill').runBackfillOrphanRecovery()"
 *
 * after applying the 20260502200000_auth_hardening_and_recovery migration.
 * The function is idempotent and safe to run multiple times.
 */
export async function runBackfillOrphanRecovery(): Promise<void> {
  log.info("Starting one-time backfill orphan recovery scan");

  // Gate on migration being applied — prevents runtime errors if this job
  // runs before the schema migration has been deployed.
  const migrationReady = await isMigrationApplied();
  if (!migrationReady) {
    log.warn(
      "Backfill skipped — auth-hardening migration has not been applied yet. " +
      "Run: npx prisma migrate deploy  then restart the application.",
    );
    return;
  }

  // Idempotency guard — only run once per environment.
  const existingReport = await db.auditLog.findFirst({
    where: { action: "backfill_orphan_recovery_completed" },
    select: { id: true },
  });
  if (existingReport) {
    log.info("Backfill orphan recovery already completed — skipping");
    return;
  }

  const allUsers = await db.user.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: "asc" },
  });

  const byEmail = new Map<string, typeof allUsers>();
  for (const user of allUsers) {
    const key = user.email.toLowerCase().trim();
    const existing = byEmail.get(key) ?? [];
    existing.push(user);
    byEmail.set(key, existing);
  }

  const duplicateGroups = [...byEmail.values()].filter((group) => group.length >= 2);
  log.info({ duplicate_groups: duplicateGroups.length }, "Found duplicate email groups");

  const report = {
    groups_processed: 0,
    orphans_found: 0,
    orphans_recovered: 0,
    total_tasks_recovered: 0,
    total_projects_recovered: 0,
    total_notes_recovered: 0,
    total_captures_recovered: 0,
    total_attachments_recovered: 0,
    total_tags_recovered: 0,
    total_contexts_recovered: 0,
    total_links_recovered: 0,
    total_tables_recovered: 0,
    total_email_captures_recovered: 0,
    total_work_logs_recovered: 0,
    errors: [] as string[],
  };

  for (const group of duplicateGroups) {
    try {
      const authEventsByUser = await Promise.all(
        group.map(async (user) => {
          const latest = await db.auditLog.findFirst({
            where: {
              user_id: user.id,
              action: {
                in: [
                  "auth:resolved_by_clerk_id",
                  "auth:resolved_by_email_fallback",
                  "auth:resolved_by_orphan_recovery",
                  "auth:created_new_user",
                ],
              },
            },
            orderBy: { created_at: "desc" },
            select: { created_at: true },
          });
          return { user, latestAuth: latest?.created_at ?? null };
        }),
      );

      authEventsByUser.sort((a, b) => {
        if (a.latestAuth && b.latestAuth) {
          return b.latestAuth.getTime() - a.latestAuth.getTime();
        }
        if (a.latestAuth) return -1;
        if (b.latestAuth) return 1;
        return b.user.updated_at.getTime() - a.user.updated_at.getTime();
      });

      const first = authEventsByUser[0];
      if (!first) continue;
      const canonical = first.user;
      const nonCanonicals = authEventsByUser.slice(1).map((x) => x.user);

      const orphans = [];
      for (const candidate of nonCanonicals) {
        const isOrphan = await verifyIsOrphan(candidate);
        if (isOrphan) orphans.push(candidate);
      }

      report.groups_processed++;
      report.orphans_found += orphans.length;

      if (orphans.length > 0) {
        const { counts, orphanIds } = await reattachOrphanData(canonical, orphans);
        await flagForRecoveryNotification(canonical.id, counts, orphanIds);

        report.orphans_recovered += orphans.length;
        report.total_tasks_recovered += counts.tasks;
        report.total_projects_recovered += counts.projects;
        report.total_notes_recovered += counts.notes;
        report.total_captures_recovered += counts.captures;
        report.total_attachments_recovered += counts.attachments;
        report.total_tags_recovered += counts.tags;
        report.total_contexts_recovered += counts.contexts;
        report.total_links_recovered += counts.links;
        report.total_tables_recovered += counts.tables;
        report.total_email_captures_recovered += counts.emailCaptures;
        report.total_work_logs_recovered += counts.workLogs;

        log.info(
          { canonical_id: canonical.id, orphans: orphans.map((o) => o.id), counts },
          "Backfill: recovered orphan(s)",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`Group (${group.map((u) => u.id).join(",")}): ${msg}`);
      log.error({ err, group: group.map((u) => u.id) }, "Backfill: error processing group");
    }
  }

  // Only write the completion marker if there were no errors. If some groups
  // failed, allow the backfill to retry on next startup so errors can be
  // resolved without requiring manual intervention.
  if (report.errors.length === 0) {
    await logActivity({
      entity_type: "AuthEvent",
      entity_id: newId(),
      action: "backfill_orphan_recovery_completed",
      meta: report as unknown as Record<string, unknown>,
    });
    log.info(report, "Backfill orphan recovery completed successfully");
  } else {
    // Write a partial-failure audit event so the failure is forensically traceable
    // without suppressing future retries (the completion marker is NOT written).
    await logActivity({
      entity_type: "AuthEvent",
      entity_id: newId(),
      action: "backfill_orphan_recovery_partial_failure",
      meta: report as unknown as Record<string, unknown>,
    });
    log.error(
      report,
      `Backfill orphan recovery completed with ${report.errors.length} error(s) — ` +
      "completion marker NOT written; backfill will retry on next startup.",
    );
  }
}
