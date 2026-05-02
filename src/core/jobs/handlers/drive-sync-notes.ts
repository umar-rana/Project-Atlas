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

const log = createLogger({ module: "jobs/drive-sync-notes" });

export interface DriveSyncNotesResult {
  synced: number;
  deleted: number;
  errors: number;
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

    const [activeNotes, deletedNotes] = await Promise.all([
      db.note.findMany({
        where: { user_id: userId, deleted_at: null },
        select: {
          id: true,
          title: true,
          purpose: true,
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
        await deleteNoteFile(userId, note.drive_file_id!);
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

    for (const note of activeNotes) {
      try {
        const purposeName = purposeFolderName(note.purpose);
        const filename = generateNoteFilename(note.created_at, note.title, usedFilenames);
        const content = generateNoteFrontmatter({
          id: note.id,
          title: note.title,
          purpose: note.purpose,
          project_name: note.project?.title ?? null,
          created_at: note.created_at,
          updated_at: note.updated_at,
          body_markdown: note.body_markdown,
        });

        const purposeFolderId = await ensureNotesPurposeFolder(
          userId,
          notesFolderId,
          purposeName,
          sharedDriveId,
          folderCache,
        );

        let driveFileId: string;

        if (note.drive_file_id) {
          const currentParentId = await getNoteFileParentId(userId, note.drive_file_id);
          const purposeChanged = currentParentId !== null && currentParentId !== purposeFolderId;

          if (purposeChanged) {
            try {
              await deleteNoteFile(userId, note.drive_file_id);
            } catch (delErr) {
              log.warn(
                { userId, noteId: note.id, fileId: note.drive_file_id, err: delErr },
                "drive-sync-notes: failed to delete old Drive file on purpose change — recreating anyway",
              );
            }
            driveFileId = await createNoteFile(userId, filename, content, purposeFolderId);
            log.debug({ userId, noteId: note.id, filename }, "drive-sync-notes: recreated note in Drive (purpose change)");
          } else {
            driveFileId = await updateNoteFile(userId, note.drive_file_id, filename, content);
            log.debug({ userId, noteId: note.id, filename }, "drive-sync-notes: updated note in Drive");
          }
        } else {
          driveFileId = await createNoteFile(userId, filename, content, purposeFolderId);
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
        log.error({ userId, noteId: note.id, err }, "drive-sync-notes: error syncing note");
        await db.note.update({
          where: { id: note.id },
          data: { drive_sync_error: message },
        }).catch(() => {});
        totalErrors++;
      }
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
