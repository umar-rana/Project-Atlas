import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/trash-retention" });

export async function handleTrashRetention(): Promise<void> {
  log.info("trash-retention: not yet implemented");
}
