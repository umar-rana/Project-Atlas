import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/processed-captures-cleanup" });

const RETENTION_DAYS = 90;

export interface ProcessedCapturesCleanupResult {
  captures: number;
}

export async function handleProcessedCapturesCleanup(): Promise<ProcessedCapturesCleanupResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  log.info({ cutoff, retentionDays: RETENTION_DAYS }, "processed-captures-cleanup: starting");

  const { count } = await db.capture.deleteMany({
    where: {
      state: "processed",
      processed_at: { lt: cutoff, not: null },
    },
  });

  log.info({ captures: count }, "processed-captures-cleanup: completed");
  return { captures: count };
}
