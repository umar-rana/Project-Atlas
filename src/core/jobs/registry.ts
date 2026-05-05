import { handleDriveSyncNotes } from "./handlers/drive-sync-notes";
import { handleDriveSyncTables } from "./handlers/drive-sync-tables";
import { handleDriveSyncAttachments } from "./handlers/drive-sync-attachments";
import { handleSessionCleanup } from "./handlers/session-cleanup";
import { handleTrashRetention } from "./handlers/trash-retention";
import { handleAttachmentCleanup } from "./handlers/attachment-cleanup";
import { handleImportCleanup } from "./handlers/import-cleanup-job";

export interface JobDefinition {
  name: string;
  cron: string;
  description: string;
  handler: () => Promise<unknown>;
}

export const JOB_REGISTRY: JobDefinition[] = [
  {
    name: "drive-sync-notes",
    cron: "0 * * * *",
    description: "Sync notes to Google Drive hourly",
    handler: handleDriveSyncNotes,
  },
  {
    name: "import-cleanup",
    cron: "0 6 * * *",
    description: "Daily cleanup of expired PDF exports from object storage at 06:00 UTC",
    handler: handleImportCleanup,
  },
  {
    name: "drive-sync-tables",
    cron: "0 * * * *",
    description: "Sync tables to Google Drive hourly (exports JSON schema + CSV for each table)",
    handler: handleDriveSyncTables,
  },
  {
    name: "drive-sync-attachments",
    cron: "0 * * * *",
    description: "Sync new attachments to Google Drive hourly",
    handler: handleDriveSyncAttachments,
  },
  {
    name: "session-cleanup",
    cron: "0 3 * * *",
    description: "Nightly cleanup of expired sessions at 03:00 UTC",
    handler: handleSessionCleanup,
  },
  {
    name: "trash-retention",
    cron: "0 4 * * *",
    description: "Nightly purge of soft-deleted records past retention window at 04:00 UTC",
    handler: handleTrashRetention,
  },
  {
    name: "attachment-cleanup",
    cron: "0 5 * * *",
    description: "Nightly cleanup of orphaned attachments from object storage at 05:00 UTC",
    handler: handleAttachmentCleanup,
  },
];
