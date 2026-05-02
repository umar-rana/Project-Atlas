import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import { generateNoteFilename, generateNoteFrontmatter, purposeFolderName } from "@/core/notes/filename";
import {
  createFolderCache,
  ensureNotesPurposeFolder,
  createNoteFile,
  updateNoteFile,
  deleteNoteFile,
  getNoteFileParentId,
} from "@/core/notes/drive-sync";
import { refreshDriveTokenIfNeeded } from "@/core/drive/client";
import { tiptapToMarkdown } from "@/core/editor/markdown-export";

const log = createLogger({ module: "jobs/drive-sync-notes" });

export interface DriveSyncNotesResult {
  synced: number;
  deleted: number;
  errors: number;
}

const QUOTA_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"]);

/**
 * Returns true when the error looks like a Google Drive quota / rate-limit
 * error.  Checks both the top-level shape that googleapis surfaces directly
 * on the thrown Error object and the nested response body shape that comes
 * back as `err.response.data.error.errors[*].reason` for HTTP-layer errors.
 */
function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;

  // 1. Top-level HTTP status code (googleapis may set these directly)
  const topCode = e["code"];
  if (topCode === 429) return true;

  // 2. Nested response shape: { response: { status, data: { error: { errors: [{ reason }] } } } }
  const response = e["response"];
  if (response && typeof response === "object") {
    const res = response as Record<string, unknown>;
    const status = res["status"];
    if (status === 429) return true;
    if (status === 403) {
      const data = res["data"];
      if (data && typeof data === "object") {
        const errorBody = (data as Record<string, unknown>)["error"];
        if (errorBody && typeof errorBody === "object") {
          const errors = (errorBody as Record<string, unknown>)["errors"];
          if (Array.isArray(errors)) {
            if (errors.some(
              (item: unknown) =>
                typeof item === "object" &&
                item !== null &&
                QUOTA_REASONS.has(String((item as Record<string, unknown>)["reason"] ?? "")),
            )) {
              return true;
            }
          }
        }
      }
    }
  }

  // 3. Top-level 403 with errors array (some googleapis versions hoist this)
  if (topCode === 403) {
    const errors = e["errors"];
    if (Array.isArray(errors)) {
      if (errors.some(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          QUOTA_REASONS.has(String((item as Record<string, unknown>)["reason"] ?? "")),
      )) {
        return true;
      }
    }
    const message = typeof e["message"] === "string" ? e["message"].toLowerCase() : "";
    if (message.includes("ratelimit") || message.includes("quota") || message.includes("rate limit")) {
      return true;
    }
  }

  return false;
}

/**
 * Execute a Drive API call with a simple bounded retry for quota / transient
 * rate-limit errors.  Retries up to `maxAttempts - 1` times with exponential
 * backoff (1 s, then 2 s).  Non-quota errors are rethrown immediately without
 * waiting.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isQuotaError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      log.warn(
        { attempt, maxAttempts, delayMs },
        "drive-sync-notes: quota/rate-limit hit — backing off before retry",
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export async function handleDriveSyncNotes(): Promise<DriveSyncNotesResult> {
  log.info("drive-sync-notes: starting");

  const configs = await db.driveConfig.findMany({
    where: { folder_notes: { not: null } },
    select: {
      user_id: true,
      folder_notes: true,
      shared_drive_id: true,
    },
  });

  if (configs.length === 0) {
    log.info("drive-sync-notes: no users with Drive notes folder configured");
    return { synced: 0, deleted: 0, errors: 0 };
  }

  let totalSynced = 0;
  let totalDeleted = 0;
  let totalErrors = 0;

  for (const config of configs) {
    const userId = config.user_id;
    const notesFolderId = config.folder_notes!;
    const sharedDriveId = config.shared_drive_id ?? undefined;

    const folderCache = createFolderCache();

    const hasToken = await db.integrationToken.findUnique({
      where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
      select: { id: true },
    });

    if (!hasToken) {
      log.warn({ userId }, "drive-sync-notes: user has DriveConfig but no token — skipping");
      continue;
    }

    // Proactively refresh the token before starting this user's sync so that
    // a near-expired or just-expired token is renewed up-front.  A failure here
    // means the entire user run is skipped with a clear error rather than
    // failing silently on every individual note.
    try {
      await refreshDriveTokenIfNeeded(userId);
    } catch (refreshErr) {
      const message = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
      log.error({ userId, err: refreshErr }, "drive-sync-notes: token refresh failed — skipping user");
      totalErrors++;
      // Store the auth error on the user's notes so it surfaces in the UI,
      // but don't abort the whole job for other users.
      await db.note.updateMany({
        where: { user_id: userId, deleted_at: null },
        data: { drive_sync_error: `Auth: ${message}` },
      }).catch(() => {});
      continue;
    }

    const [activeNotes, deletedNotes] = await Promise.all([
      db.note.findMany({
        where: { user_id: userId, deleted_at: null },
        select: {
          id: true,
          title: true,
          purpose: true,
          body_json: true,
          body_markdown: true,
          drive_file_id: true,
          created_at: true,
          updated_at: true,
          project: { select: { title: true } },
        },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      }),
      db.note.findMany({
        where: {
          user_id: userId,
          deleted_at: { not: null },
          drive_file_id: { not: null },
        },
        select: {
          id: true,
          drive_file_id: true,
        },
      }),
    ]);

    for (const note of deletedNotes) {
      try {
        await withRetry(() => deleteNoteFile(userId, note.drive_file_id!));
        await db.note.update({
          where: { id: note.id },
          data: { drive_file_id: null, drive_synced_at: new Date(), drive_sync_error: null },
        });
        totalDeleted++;
        log.info({ userId, noteId: note.id }, "drive-sync-notes: deleted Drive file for soft-deleted note");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ userId, noteId: note.id, err }, "drive-sync-notes: error deleting Drive file");
        await db.note.update({
          where: { id: note.id },
          data: { drive_sync_error: message },
        }).catch(() => {});
        totalErrors++;
      }
    }

    const usedFilenames = new Set<string>();
    let quotaExceeded = false;

    for (const note of activeNotes) {
      if (quotaExceeded) {
        totalErrors++;
        continue;
      }

      try {
        const purposeName = purposeFolderName(note.purpose);
        const filename = generateNoteFilename(note.created_at, note.title, usedFilenames);

        // Use stored body_markdown when available; fall back to converting
        // body_json on-the-fly for notes created before markdown export was
        // added or where the editor did not persist body_markdown.
        const resolvedMarkdown =
          note.body_markdown && note.body_markdown.trim().length > 0
            ? note.body_markdown
            : tiptapToMarkdown(note.body_json || "{}");

        const content = generateNoteFrontmatter({
          id: note.id,
          title: note.title,
          purpose: note.purpose,
          project_name: note.project?.title ?? null,
          created_at: note.created_at,
          updated_at: note.updated_at,
          body_markdown: resolvedMarkdown,
        });

        const purposeFolderId = await withRetry(() =>
          ensureNotesPurposeFolder(
            userId,
            notesFolderId,
            purposeName,
            sharedDriveId,
            folderCache,
          ),
        );

        let driveFileId: string;

        if (note.drive_file_id) {
          const currentParentId = await withRetry(() =>
            getNoteFileParentId(userId, note.drive_file_id!),
          );
          const purposeChanged = currentParentId !== null && currentParentId !== purposeFolderId;

          if (purposeChanged) {
            try {
              await withRetry(() => deleteNoteFile(userId, note.drive_file_id!));
            } catch (delErr) {
              log.warn(
                { userId, noteId: note.id, fileId: note.drive_file_id, err: delErr },
                "drive-sync-notes: failed to delete old Drive file on purpose change — recreating anyway",
              );
            }
            driveFileId = await withRetry(() =>
              createNoteFile(userId, filename, content, purposeFolderId),
            );
            log.debug({ userId, noteId: note.id, filename }, "drive-sync-notes: recreated note in Drive (purpose change)");
          } else {
            driveFileId = await withRetry(() =>
              updateNoteFile(userId, note.drive_file_id!, filename, content),
            );
            log.debug({ userId, noteId: note.id, filename }, "drive-sync-notes: updated note in Drive");
          }
        } else {
          driveFileId = await withRetry(() =>
            createNoteFile(userId, filename, content, purposeFolderId),
          );
          log.debug({ userId, noteId: note.id, filename }, "drive-sync-notes: created note in Drive");
        }

        await db.note.update({
          where: { id: note.id },
          data: {
            drive_file_id: driveFileId,
            drive_synced_at: new Date(),
            drive_sync_error: null,
          },
        });

        totalSynced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // After withRetry exhausted its attempts, any remaining quota error
        // means we should stop this user's pass — hammering the API further
        // will only deepen the quota problem.
        if (isQuotaError(err)) {
          log.warn(
            { userId, noteId: note.id, err },
            "drive-sync-notes: Drive quota/rate-limit still failing after retries — stopping sync for this user",
          );
          await db.note.update({
            where: { id: note.id },
            data: { drive_sync_error: "Drive API quota exceeded — sync will retry next hour" },
          }).catch(() => {});
          quotaExceeded = true;
          totalErrors++;
          continue;
        }

        log.error({ userId, noteId: note.id, err }, "drive-sync-notes: error syncing note");
        await db.note.update({
          where: { id: note.id },
          data: { drive_sync_error: message },
        }).catch(() => {});
        totalErrors++;
      }
    }

    if (quotaExceeded) {
      log.warn(
        { userId, synced: totalSynced, errors: totalErrors },
        "drive-sync-notes: stopped early for user due to quota limit — remaining notes will sync next hour",
      );
    }

    log.info(
      { userId, synced: totalSynced, deleted: totalDeleted, errors: totalErrors },
      "drive-sync-notes: finished user",
    );
  }

  log.info(
    { synced: totalSynced, deleted: totalDeleted, errors: totalErrors },
    "drive-sync-notes: complete",
  );

  return { synced: totalSynced, deleted: totalDeleted, errors: totalErrors };
}
