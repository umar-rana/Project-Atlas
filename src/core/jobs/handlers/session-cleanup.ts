import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/session-cleanup" });

export async function handleSessionCleanup(): Promise<void> {
  log.info("session-cleanup: not yet implemented");
}
