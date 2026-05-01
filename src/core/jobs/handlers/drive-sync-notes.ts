import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/drive-sync-notes" });

export async function handleDriveSyncNotes(): Promise<void> {
  log.info("drive-sync-notes: not yet implemented");
}
