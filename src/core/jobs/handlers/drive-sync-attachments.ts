import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { pushStorageFileToDrive } from "@/core/drive/sync";
import { refreshDriveTokenIfNeeded } from "@/core/drive/client";

const log = createLogger({ module: "jobs/drive-sync-attachments" });

export interface DriveSyncAttachmentsResult {
  synced: number;
  errors: number;
  skipped: number;
}

const BATCH_SIZE = 50;

/**
 * Maximum consecutive failures for a single attachment before it is skipped
 * permanently (cursor advances past it) to prevent queue starvation.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Cursor format: "<updated_at ISO string>|<id>"
 *
 * We use a compound cursor (updated_at + id) so we can page through
 * attachments that were updated since the last run without missing any.
 * Storing the id as a tie-breaker ensures deterministic ordering even when
 * multiple attachments share the same updated_at timestamp.
 *
 * On each run we fetch the next BATCH_SIZE attachments ordered by
 * (updated_at ASC, id ASC) where (updated_at, id) > cursor.  If any
 * attachment in the batch fails to push we stop immediately — the cursor
 * is only advanced up to (but not including) the failed item, so failed
 * attachments are retried on the next run.
 *
 * Starvation prevention: if the same attachment fails MAX_CONSECUTIVE_FAILURES
 * times in a row the cursor is advanced past it (the attachment is skipped and
 * logged as dead-lettered).
 */

interface ParsedCursor {
  updatedAt: Date;
  id: string;
}

interface SyncMeta {
  failedId?: string;
  failCount?: number;
}

function parseCursor(raw: string | null | undefined): ParsedCursor | null {
  if (!raw) return null;
  const sep = raw.lastIndexOf("|");
  if (sep === -1) return null;
  const dateStr = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  const d = new Date(dateStr);
  if (isNaN(d.getTime()) || !id) return null;
  return { updatedAt: d, id };
}

function encodeCursor(updatedAt: Date, id: string): string {
  return `${updatedAt.toISOString()}|${id}`;
}

function parseMeta(raw: unknown): SyncMeta {
  if (!raw || typeof raw !== "object") return {};
  const m = raw as Record<string, unknown>;
  return {
    failedId: typeof m.failedId === "string" ? m.failedId : undefined,
    failCount: typeof m.failCount === "number" ? m.failCount : undefined,
  };
}

export async function handleDriveSyncAttachments(): Promise<DriveSyncAttachmentsResult> {
  log.info("drive-sync-attachments: starting");

  const configs = await db.driveConfig.findMany({
    where: { folder_attachments: { not: null } },
    select: {
      user_id: true,
      folder_attachments: true,
    },
  });

  if (configs.length === 0) {
    log.info("drive-sync-attachments: no users with Drive attachments folder configured");
    return { synced: 0, errors: 0, skipped: 0 };
  }

  let totalSynced = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const config of configs) {
    const userId = config.user_id;
    const attachmentsFolderId = config.folder_attachments!;

    const hasToken = await db.integrationToken.findUnique({
      where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
      select: { id: true },
    });

    if (!hasToken) {
      log.warn({ userId }, "drive-sync-attachments: user has DriveConfig but no Drive token — skipping");
      continue;
    }

    try {
      await refreshDriveTokenIfNeeded(userId);
    } catch (refreshErr) {
      log.error({ userId, err: refreshErr }, "drive-sync-attachments: token refresh failed — skipping user");
      totalErrors++;
      continue;
    }

    const syncState = await db.syncState.findUnique({
      where: {
        user_id_provider_resource_type: {
          user_id: userId,
          provider: "google_drive",
          resource_type: "attachments",
        },
      },
    });

    const cursor = parseCursor(syncState?.cursor);
    const meta = parseMeta(syncState?.meta);

    // Fetch the next batch ordered by (updated_at ASC, id ASC).
    // When a cursor exists, skip everything at or before it using the compound
    // key (updated_at, id) > (cursor.updatedAt, cursor.id).
    const attachments = await db.attachment.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        ...(cursor
          ? {
              OR: [
                { updated_at: { gt: cursor.updatedAt } },
                { updated_at: cursor.updatedAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ updated_at: "asc" }, { id: "asc" }],
      take: BATCH_SIZE,
      select: {
        id: true,
        filename: true,
        content_type: true,
        storage_path: true,
        updated_at: true,
      },
    });

    if (attachments.length === 0) {
      log.info({ userId }, "drive-sync-attachments: no new/updated attachments to sync for user");
      await db.syncState.upsert({
        where: {
          user_id_provider_resource_type: {
            user_id: userId,
            provider: "google_drive",
            resource_type: "attachments",
          },
        },
        create: {
          id: newId(),
          user_id: userId,
          provider: "google_drive",
          resource_type: "attachments",
          last_synced: new Date(),
          cursor: syncState?.cursor ?? null,
          meta: meta as object,
        },
        update: { last_synced: new Date() },
      });
      continue;
    }

    log.info({ userId, count: attachments.length }, "drive-sync-attachments: pushing attachments to Drive");

    let userSynced = 0;
    let userErrors = 0;
    let userSkipped = 0;
    let newCursor = syncState?.cursor ?? null;
    let newMeta: SyncMeta = { ...meta };

    for (const attachment of attachments) {
      // Check whether this attachment has been failing repeatedly.
      // If it has hit the max failure threshold, skip it and advance the
      // cursor past it so subsequent attachments are not starved.
      if (meta.failedId === attachment.id && (meta.failCount ?? 0) >= MAX_CONSECUTIVE_FAILURES) {
        log.warn(
          { userId, attachmentId: attachment.id, failCount: meta.failCount },
          "drive-sync-attachments: attachment exceeded max consecutive failures — skipping permanently",
        );
        newCursor = encodeCursor(attachment.updated_at, attachment.id);
        newMeta = {}; // Reset failure tracking after skip
        userSkipped++;
        continue;
      }

      try {
        await pushStorageFileToDrive({
          userId,
          storagePath: attachment.storage_path,
          driveParentId: attachmentsFolderId,
          filename: attachment.filename,
          mimeType: attachment.content_type,
        });

        newCursor = encodeCursor(attachment.updated_at, attachment.id);
        newMeta = {}; // Clear failure state on success
        userSynced++;

        log.debug(
          { userId, attachmentId: attachment.id, filename: attachment.filename },
          "drive-sync-attachments: pushed attachment to Drive",
        );
      } catch (err) {
        // Track consecutive failures on this specific attachment so we can
        // detect and skip permanent failures.  Stop the batch immediately so
        // the cursor is not advanced past this item — it will be retried.
        const isRepeatedFailure = meta.failedId === attachment.id;
        const newFailCount = isRepeatedFailure ? (meta.failCount ?? 0) + 1 : 1;

        newMeta = { failedId: attachment.id, failCount: newFailCount };

        log.error(
          { userId, attachmentId: attachment.id, failCount: newFailCount, err },
          "drive-sync-attachments: error pushing attachment — stopping batch",
        );
        userErrors++;
        break;
      }
    }

    await db.syncState.upsert({
      where: {
        user_id_provider_resource_type: {
          user_id: userId,
          provider: "google_drive",
          resource_type: "attachments",
        },
      },
      create: {
        id: newId(),
        user_id: userId,
        provider: "google_drive",
        resource_type: "attachments",
        last_synced: new Date(),
        cursor: newCursor,
        meta: newMeta as object,
      },
      update: {
        last_synced: new Date(),
        cursor: newCursor,
        meta: newMeta as object,
      },
    });

    totalSynced += userSynced;
    totalErrors += userErrors;
    totalSkipped += userSkipped;

    log.info(
      { userId, synced: userSynced, errors: userErrors, skipped: userSkipped },
      "drive-sync-attachments: finished user",
    );
  }

  log.info({ totalSynced, totalErrors, totalSkipped }, "drive-sync-attachments: complete");
  return { synced: totalSynced, errors: totalErrors, skipped: totalSkipped };
}
