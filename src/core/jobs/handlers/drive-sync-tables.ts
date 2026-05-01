import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/drive-sync-tables" });

export async function handleDriveSyncTables(): Promise<void> {
  log.info("drive-sync-tables: not yet implemented");
}
