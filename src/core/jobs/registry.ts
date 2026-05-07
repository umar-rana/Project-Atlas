import { handleDriveSyncNotes } from "./handlers/drive-sync-notes";
import { handleDriveSyncTables } from "./handlers/drive-sync-tables";
import { handleDriveSyncAttachments } from "./handlers/drive-sync-attachments";
import { handleTrashRetention } from "./handlers/trash-retention";
import { handleAttachmentCleanup } from "./handlers/attachment-cleanup";
import { handleImportCleanup } from "./handlers/import-cleanup-job";
import { handleProcessedCapturesCleanup } from "./handlers/processed-captures-cleanup";
import { handleJobRecordsCleanup } from "./handlers/job-records-cleanup";
import { handleGoogleCalendarSync } from "./handlers/google-calendar-sync";

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
    name: "import-cleanup",
    cron: "0 6 * * *",
    description: "Daily cleanup of expired PDF exports from object storage at 06:00 UTC",
    handler: handleImportCleanup,
  },
  {
    name: "trash-retention",
    cron: "0 4 * * *",
    description:
      "Nightly hard-delete of soft-deleted records past the 30-day retention window at 04:00 UTC",
    handler: handleTrashRetention,
  },
  {
    name: "attachment-cleanup",
    cron: "0 5 * * *",
    description:
      "Nightly cleanup of storage objects for deleted attachments and untracked orphan files at 05:00 UTC",
    handler: handleAttachmentCleanup,
  },
  {
    name: "processed-captures-cleanup",
    cron: "30 3 * * 0",
    description: "Weekly purge of processed inbox captures older than 90 days (Sunday 03:30 UTC)",
    handler: handleProcessedCapturesCleanup,
  },
  {
    name: "job-records-cleanup",
    cron: "0 4 * * 0",
    description:
      "Weekly pruning of job audit log entries, keeping the 100 most recent per job (Sunday 04:00 UTC)",
    handler: handleJobRecordsCleanup,
  },
  {
    name: "google-calendar-sync",
    cron: "30 2 * * *",
    description: "Daily sync of Google Calendar events at 02:30 UTC",
    handler: handleGoogleCalendarSync,
  },
];
