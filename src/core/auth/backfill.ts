import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import { verifyIsOrphan, reattachOrphanData, flagForRecoveryNotification } from "./orphan-recovery";

const log = createLogger({ module: "auth/backfill" });

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
