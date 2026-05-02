import { handleDriveSyncNotes } from "./handlers/drive-sync-notes";
import { handleDriveSyncTables } from "./handlers/drive-sync-tables";
import { handleSessionCleanup } from "./handlers/session-cleanup";
import { handleTrashRetention } from "./handlers/trash-retention";
import { handleAttachmentCleanup } from "./handlers/attachment-cleanup";

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
    name: "drive-sync-tables",
    cron: "0 2 * * *",
    description: "Sync database tables to Google Drive nightly at 02:00 UTC (no-op placeholder)",
    handler: handleDriveSyncTables,
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
