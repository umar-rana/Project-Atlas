import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "jobs/job-records-cleanup" });

const KEEP_PER_JOB = 100;
const JOB_AUDIT_ACTIONS = ["job_run_completed", "job_paused", "job_resumed"];

export interface JobRecordsCleanupResult {
  deleted: number;
}

export async function handleJobRecordsCleanup(): Promise<JobRecordsCleanupResult> {
  log.info({ keepPerJob: KEEP_PER_JOB }, "job-records-cleanup: starting");

  let deleted = 0;

  // Find all distinct job names recorded in the audit log
  const distinctJobs = await db.auditLog.findMany({
    where: { action: { in: JOB_AUDIT_ACTIONS } },
    select: { entity_id: true },
    distinct: ["entity_id"],
  });

  for (const { entity_id: jobName } of distinctJobs) {
    try {
      // Find the created_at of the 100th most-recent entry for this job
      const anchor = await db.auditLog.findMany({
        where: {
          entity_id: jobName,
          action: { in: JOB_AUDIT_ACTIONS },
        },
        orderBy: { created_at: "desc" },
        skip: KEEP_PER_JOB - 1,
        take: 1,
        select: { created_at: true },
      });

      if (anchor.length === 0) {
        // Fewer than KEEP_PER_JOB entries — nothing to prune
        continue;
      }

      const cutoffDate = anchor[0]!.created_at;

      const { count } = await db.auditLog.deleteMany({
        where: {
          entity_id: jobName,
          action: { in: JOB_AUDIT_ACTIONS },
          created_at: { lt: cutoffDate },
        },
      });

      deleted += count;
      log.debug({ jobName, count }, "job-records-cleanup: pruned entries for job");
    } catch (err) {
      log.warn({ err, jobName }, "job-records-cleanup: failed to prune entries for job — skipping");
    }
  }

  log.info({ deleted }, "job-records-cleanup: completed");
  return { deleted };
}
