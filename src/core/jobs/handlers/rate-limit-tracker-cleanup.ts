import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/rate-limit-tracker-cleanup" });

// 7 days. RateLimitTracker rows are per-minute buckets; even daily counts
// reset at UTC midnight, so anything older than a week is purely historical.
// Kept short to prevent the table from accumulating millions of rows under
// steady traffic.
const RETENTION_DAYS = 7;

export interface RateLimitTrackerCleanupResult {
  deleted: number;
}

export async function handleRateLimitTrackerCleanup(): Promise<RateLimitTrackerCleanupResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  log.info({ cutoff, retentionDays: RETENTION_DAYS }, "rate-limit-tracker-cleanup: starting");

  const { count } = await db.rateLimitTracker.deleteMany({
    where: { window_start: { lt: cutoff } },
  });

  log.info({ deleted: count }, "rate-limit-tracker-cleanup: completed");
  return { deleted: count };
}
