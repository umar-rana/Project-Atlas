import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/attachment-cleanup" });

export async function handleAttachmentCleanup(): Promise<void> {
  log.info("attachment-cleanup: not yet implemented");
}
