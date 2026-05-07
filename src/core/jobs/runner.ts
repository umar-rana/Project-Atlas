import "server-only";
import PgBoss from "pg-boss";
import { createLogger } from "@/core/logging";
import { JOB_REGISTRY } from "./registry";
import { writeJobAuditLog } from "./audit";
import { runBackfillOrphanRecovery } from "@/core/auth/backfill";

const log = createLogger({ module: "jobs/runner" });

declare global {
  var __atlasJobRunner: PgBoss | undefined;
}

function resolveDbUrl(): string {
  const raw = process.env.DATABASE_URL_NEON ?? "";
  const url = raw.replace(/^'+|'+$/g, "");
  if (!url) {
    throw new Error("DATABASE_URL_NEON is not set — cannot start job runner.");
  }
  return url;
}

export async function startJobRunner(): Promise<void> {
  if (globalThis.__atlasJobRunner) {
    log.info("Job runner already initialised — skipping");
    return;
  }

  const connectionString = resolveDbUrl();

  const boss = new PgBoss({
    connectionString,
    retryLimit: 3,
    retryDelay: 30,
    deleteAfterDays: 7,
    archiveCompletedAfterSeconds: 60 * 60 * 24,
  });

  boss.on("error", (err) => {
    log.error({ err }, "pg-boss error");
  });

  await boss.start();
  log.info("pg-boss started");

  // One-time backfill: runs idempotently on startup, skips if already done.
  runBackfillOrphanRecovery().catch((err) => {
    log.error({ err }, "Backfill orphan recovery failed on startup — non-fatal");
  });

  for (const job of JOB_REGISTRY) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron, {}, { tz: "UTC" });

    await boss.work(job.name, async () => {
      log.info({ job: job.name }, "running job");
      const startedAt = Date.now();
      try {
        const output = await job.handler();
        log.info({ job: job.name, output }, "job completed");
        await writeJobAuditLog(null, "job_run_completed", job.name, {
          outcome: "completed",
          duration_ms: Date.now() - startedAt,
          result: output,
        });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ err, job: job.name }, "job failed");
        await writeJobAuditLog(null, "job_run_completed", job.name, {
          outcome: "failed",
          duration_ms: Date.now() - startedAt,
          error: message,
        });
        throw err;
      }
    });

    log.info({ job: job.name, cron: job.cron }, "job registered");
  }

  globalThis.__atlasJobRunner = boss;
  log.info({ count: JOB_REGISTRY.length }, "all jobs registered");
}

export async function runJobNow(jobName: string): Promise<void> {
  const job = JOB_REGISTRY.find((j) => j.name === jobName);
  if (!job) {
    throw new Error(`Unknown job: ${jobName}`);
  }

  const boss = globalThis.__atlasJobRunner;
  if (boss) {
    await boss.send(jobName, {}, { priority: 10, singletonKey: `run-now-${jobName}` });
    log.info({ job: jobName }, "job enqueued for immediate run via pg-boss");
  } else {
    log.warn({ job: jobName }, "pg-boss not running — executing handler directly");
    await job.handler();
  }
}
