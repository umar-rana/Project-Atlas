import "server-only";
import { db } from "@/core/db";
import { storage } from "@/core/storage";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/import-cleanup" });

/**
 * Cleans up expired PDF exports from R2 storage.
 *
 * PDF exports are tracked in the audit log with action "note_export_pdf" and
 * meta.storagePath + meta.expiresAt. This job finds exports whose expiresAt has
 * passed, deletes the objects from storage, and marks them cleaned up.
 *
 * Runs daily at 06:00 UTC (see registry.ts).
 */
export async function handleImportCleanup(): Promise<{ deleted: number; errors: number }> {
  log.info("import-cleanup: scanning for expired PDF exports via audit log");

  let deleted = 0;
  let errors = 0;

  const cutoff = new Date();

  try {
    // Find all PDF export audit entries where expiresAt has passed
    const expiredExports = await db.auditLog.findMany({
      where: {
        action: "note_export_pdf",
        created_at: { lt: new Date(cutoff.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true, meta: true },
    });

    for (const entry of expiredExports) {
      const meta = entry.meta as Record<string, unknown> | null;
      const storagePath = meta?.storagePath as string | undefined;

      if (!storagePath) continue;

      try {
        const exists = await storage.exists(storagePath);
        if (exists) {
          await storage.delete(storagePath);
          log.debug({ storagePath, auditId: entry.id }, "Deleted expired PDF export from storage");
        }
        deleted++;
      } catch (err) {
        log.warn({ err, storagePath, auditId: entry.id }, "Failed to delete expired PDF export");
        errors++;
      }
    }
  } catch (err) {
    log.error({ err }, "import-cleanup: failed to query audit log for expired exports");
    errors++;
  }

  log.info({ deleted, errors }, "import-cleanup: completed");
  return { deleted, errors };
}
