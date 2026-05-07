import "server-only";
import { db } from "@/core/db";
import { storage } from "@/core/storage";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/attachment-cleanup" });

const DELETED_ATTACHMENT_GRACE_HOURS = 48;

export interface AttachmentCleanupResult {
  attachments: number;
  orphans: number;
  errors: number;
}

export async function handleAttachmentCleanup(): Promise<AttachmentCleanupResult> {
  const cutoff = new Date(Date.now() - DELETED_ATTACHMENT_GRACE_HOURS * 60 * 60 * 1000);
  log.info({ cutoff }, "attachment-cleanup: starting");

  let attachments = 0;
  let orphans = 0;
  let errors = 0;

  // ── Phase 1: Delete storage objects for soft-deleted attachment records ──────
  let deletedAttachments: { id: string; storage_path: string; thumbnail_path: string | null }[] = [];
  try {
    deletedAttachments = await db.attachment.findMany({
      where: { deleted_at: { lt: cutoff, not: null } },
      select: { id: true, storage_path: true, thumbnail_path: true },
    });
  } catch (err) {
    log.error({ err }, "attachment-cleanup: failed to query soft-deleted attachments");
    errors++;
  }

  for (const att of deletedAttachments) {
    try {
      await storage.delete(att.storage_path);
      if (att.thumbnail_path) {
        await storage.delete(att.thumbnail_path);
      }
      attachments++;
    } catch (err) {
      log.warn({ err, storagePath: att.storage_path }, "attachment-cleanup: failed to delete storage object");
      errors++;
    }
  }

  log.debug({ attachments, errors }, "attachment-cleanup: phase 1 complete (soft-deleted storage objects)");

  // ── Phase 2: Sweep R2 for orphaned export/import keys with no DB record ──────
  // We list keys under the users/ prefix, filter to export/import paths,
  // then check for any that have no matching db.attachment record.
  // Age-based filtering is not applied here (storage.list has no metadata);
  // the import-cleanup job handles TTL for tracked exports. This sweep only
  // catches truly untracked orphan objects.
  try {
    const allKeys = await storage.list("users/");
    const exportImportKeys = allKeys.filter(
      (k) => k.includes("/exports/") || k.includes("/imports/"),
    );

    if (exportImportKeys.length > 0) {
      const knownPaths = await db.attachment.findMany({
        where: { storage_path: { in: exportImportKeys } },
        select: { storage_path: true },
      });
      const knownSet = new Set(knownPaths.map((a) => a.storage_path));

      for (const key of exportImportKeys) {
        if (!knownSet.has(key)) {
          try {
            await storage.delete(key);
            orphans++;
            log.debug({ key }, "attachment-cleanup: deleted orphan storage key");
          } catch (err) {
            log.warn({ err, key }, "attachment-cleanup: failed to delete orphan key");
            errors++;
          }
        }
      }
    }
  } catch (err) {
    log.warn({ err }, "attachment-cleanup: phase 2 (orphan sweep) failed — skipping");
    errors++;
  }

  log.info({ attachments, orphans, errors }, "attachment-cleanup: completed");
  return { attachments, orphans, errors };
}
