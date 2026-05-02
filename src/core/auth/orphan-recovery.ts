// IMPORTANT: When adding a new table with a user_id column, update reattachOrphanData below
// to include that table in the reattachment transaction.

import { db, newId } from "@/core/db";
import { withDeleted } from "@/core/db/soft-delete";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";
import type { Prisma, User } from "@prisma/client";

const log = createLogger({ module: "orphan-recovery" });

const ORPHAN_INACTIVITY_DAYS = 30;

interface ClerkUserProfile {
  id: string;
  emailAddresses: Array<{ emailAddress: string; verification?: { status: string } | null }>;
}

export interface RecoveryCounts {
  tasks: number;
  projects: number;
  notes: number;
  captures: number;
  attachments: number;
  tags: number;
  contexts: number;
  links: number;
  tables: number;
  emailCaptures: number;
  workLogs: number;
}

export interface RecoverySummary {
  counts: RecoveryCounts;
  recoveredAt: string;
  orphanIds: string[];
}

export async function verifyIsOrphan(user: User): Promise<boolean> {
  // Apply the 30-day auth inactivity check to ALL candidates, including
  // soft-deleted ones. A recently-active soft-deleted account should NOT be
  // automatically treated as an orphan — it may have been archived by an
  // operator mid-session. True orphans (including placeholder-clerk_id rows
  // created by the remediation script) will have no recent auth events.
  const cutoff = new Date(Date.now() - ORPHAN_INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  const recentAuthEvent = await db.auditLog.findFirst({
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
      created_at: { gte: cutoff },
    },
    select: { id: true },
  });
  if (recentAuthEvent) return false;

  const [taskCount, projectCount, noteCount] = await Promise.all([
    db.task.count({ where: { user_id: user.id } }),
    db.project.count({ where: { user_id: user.id } }),
    db.note.count({ where: { user_id: user.id } }),
  ]);

  return taskCount > 0 || projectCount > 0 || noteCount > 0;
}

export async function reattachOrphanData(
  canonicalUser: User,
  orphans: User[],
): Promise<{ counts: RecoveryCounts; orphanIds: string[] }> {
  const totals: RecoveryCounts = {
    tasks: 0,
    projects: 0,
    notes: 0,
    captures: 0,
    attachments: 0,
    tags: 0,
    contexts: 0,
    links: 0,
    tables: 0,
    emailCaptures: 0,
    workLogs: 0,
  };
  const orphanIds: string[] = [];

  for (const orphan of orphans) {
    log.info(
      { orphan_id: orphan.id, canonical_id: canonicalUser.id },
      "Reattaching orphan data",
    );
    orphanIds.push(orphan.id);

    await db.$transaction(async (tx) => {
      const [tasks, projects, notes, captures, attachments, tags, contexts, links, tables, emailCaptures, workLogs] =
        await Promise.all([
          tx.task.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.project.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.note.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.capture.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.attachment.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.tag.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.context.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.link.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.table.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.emailCapture.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
          tx.taskWorkLog.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        ]);

      await Promise.all([
        tx.projectFolder.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.notesFolder.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.tablesFolder.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.checklistItem.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.captureParseLog.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.person.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.aICallLog.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        tx.auditLog.updateMany({ where: { user_id: orphan.id }, data: { user_id: canonicalUser.id } }),
        // IntegrationToken: @@unique([user_id, provider]) — drop orphan rows where canonical
        // already has the same provider, then migrate the rest.
        tx.$executeRaw`
          DELETE FROM "IntegrationToken"
          WHERE user_id = ${orphan.id}::uuid
            AND provider IN (
              SELECT provider FROM "IntegrationToken" WHERE user_id = ${canonicalUser.id}::uuid
            )`,
        // SyncState: @@unique([user_id, provider, resource_type]) — same pattern.
        tx.$executeRaw`
          DELETE FROM "SyncState"
          WHERE user_id = ${orphan.id}::uuid
            AND (provider, resource_type) IN (
              SELECT provider, resource_type FROM "SyncState" WHERE user_id = ${canonicalUser.id}::uuid
            )`,
        // RateLimitTracker: @@unique([user_id, provider, window_start]) — delete collisions.
        tx.$executeRaw`
          DELETE FROM "RateLimitTracker"
          WHERE user_id = ${orphan.id}::uuid
            AND (provider, window_start) IN (
              SELECT provider, window_start FROM "RateLimitTracker" WHERE user_id = ${canonicalUser.id}::uuid
            )`,
        // DriveConfig: 1:1 unique on user_id — only migrate if canonical has no config.
        tx.$executeRaw`
          UPDATE "DriveConfig"
          SET user_id = ${canonicalUser.id}::uuid
          WHERE user_id = ${orphan.id}::uuid
            AND NOT EXISTS (SELECT 1 FROM "DriveConfig" WHERE user_id = ${canonicalUser.id}::uuid)`,
      ]);

      // After collision rows are removed, migrate the remaining unique-constrained rows.
      await Promise.all([
        tx.$executeRaw`UPDATE "IntegrationToken" SET user_id = ${canonicalUser.id}::uuid WHERE user_id = ${orphan.id}::uuid`,
        tx.$executeRaw`UPDATE "SyncState" SET user_id = ${canonicalUser.id}::uuid WHERE user_id = ${orphan.id}::uuid`,
        tx.$executeRaw`UPDATE "RateLimitTracker" SET user_id = ${canonicalUser.id}::uuid WHERE user_id = ${orphan.id}::uuid`,
      ]);

      await tx.user.update({
        where: { id: orphan.id },
        data: { deleted_at: new Date() },
      });

      totals.tasks += tasks.count;
      totals.projects += projects.count;
      totals.notes += notes.count;
      totals.captures += captures.count;
      totals.attachments += attachments.count;
      totals.tags += tags.count;
      totals.contexts += contexts.count;
      totals.links += links.count;
      totals.tables += tables.count;
      totals.emailCaptures += emailCaptures.count;
      totals.workLogs += workLogs.count;
    });

    await logActivity({
      user_id: canonicalUser.id,
      entity_type: "AuthEvent",
      entity_id: canonicalUser.id,
      action: "auth:resolved_by_orphan_recovery",
      meta: {
        orphan_id: orphan.id,
        orphan_email: orphan.email,
        recovered: {
          tasks: totals.tasks,
          projects: totals.projects,
          notes: totals.notes,
        },
      },
    });
  }

  return { counts: totals, orphanIds };
}

const AUTH_RESOLUTION_ACTIONS = [
  "auth:resolved_by_clerk_id",
  "auth:resolved_by_email_fallback",
  "auth:resolved_by_orphan_recovery",
  "auth:created_new_user",
] as const;

/**
 * Returns true if this is the user's first-ever sign-in session.
 *
 * Two conditions must BOTH be true:
 *   1. The user's account was created very recently (within 10 minutes of now),
 *      meaning they could not have accumulated meaningful prior sessions.
 *   2. They have ≤1 auth resolution event in the audit log (the one just written).
 *
 * Combining both prevents suppression for long-time users whose historical
 * sign-ins predate the audit-event system (they will have an old created_at
 * even if they have 0 audit events), while still suppressing for truly new
 * accounts during backfill or recovery operations.
 */
async function isFirstSignIn(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { created_at: true },
  });
  if (!user) return false;

  const ageMs = Date.now() - user.created_at.getTime();
  const RECENT_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  if (ageMs > RECENT_THRESHOLD_MS) {
    // Account is not brand-new: do not suppress (existing users deserve the banner)
    return false;
  }

  const count = await db.auditLog.count({
    where: {
      user_id: userId,
      action: { in: [...AUTH_RESOLUTION_ACTIONS] },
    },
  });
  return count <= 1;
}

export async function flagForRecoveryNotification(
  userId: string,
  counts: RecoveryCounts,
  orphanIds: string[],
): Promise<void> {
  const hasContent = Object.values(counts).some((c) => c > 0);
  if (!hasContent) return;

  // Suppress notification if this is the user's first-ever sign-in
  // (no prior session context means the banner would be confusing).
  if (await isFirstSignIn(userId)) {
    log.info({ user_id: userId }, "Suppressing recovery notification — first-ever sign-in");
    return;
  }

  const summary: RecoverySummary = {
    counts,
    recoveredAt: new Date().toISOString(),
    orphanIds,
  };

  await db.user.update({
    where: { id: userId },
    data: {
      recovery_notification_pending: true,
      last_recovery_summary: summary as unknown as import("@prisma/client").Prisma.InputJsonValue,
      last_recovery_dismissed_at: null,
    },
  });
}

export async function attemptOrphanRecovery(
  currentUser: User,
  clerkUser: ClerkUserProfile,
): Promise<void> {
  try {
    const verifiedEmails = clerkUser.emailAddresses
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.toLowerCase())
      .filter(Boolean);

    if (verifiedEmails.length === 0) return;

    // Case-insensitive email match: Clerk may return emails in different case
    // from what was originally stored; mode: "insensitive" guards against misses.
    //
    // Soft-deleted accounts ARE included as orphan candidates: they may hold
    // data from a user who originally signed up with a different Clerk identity.
    // The remediation script assigns placeholder clerk_ids WITHOUT soft-deleting
    // precisely to keep these accounts visible here for recovery.
    // withDeleted() bypasses the Prisma soft-delete middleware so that rows
    // with deleted_at IS NOT NULL are included in the scan.
    const candidates = await db.user.findMany({
      where: withDeleted<Prisma.UserWhereInput>({
        email: { in: verifiedEmails, mode: "insensitive" },
        id: { not: currentUser.id },
      }),
    });

    if (candidates.length === 0) return;

    const orphans: User[] = [];
    for (const candidate of candidates) {
      const isOrphan = await verifyIsOrphan(candidate);
      if (isOrphan) orphans.push(candidate);
    }

    if (orphans.length === 0) return;

    log.info(
      { canonical_id: currentUser.id, orphan_count: orphans.length },
      "Starting orphan recovery",
    );

    const { counts, orphanIds } = await reattachOrphanData(currentUser, orphans);
    await flagForRecoveryNotification(currentUser.id, counts, orphanIds);
  } catch (err) {
    log.error({ err, user_id: currentUser.id }, "Orphan recovery failed — non-fatal, continuing");
  }
}
