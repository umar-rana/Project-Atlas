import "server-only";
import PgBoss from "pg-boss";
import { createLogger } from "@/core/logging";
import { JOB_REGISTRY } from "./registry";

const log = createLogger({ module: "jobs/runner" });

declare global {
  var __atlasJobRunner: PgBoss | undefined;
}

function resolveDbUrl(): string {
  const raw = process.env.DATABASE_URL_NEON ?? "";
  const url = raw.replace(/^'+|'+$/g, "");
  if (!url) {
    throw new Error(
      "DATABASE_URL_NEON is not set — cannot start job runner.",
    );
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

  for (const job of JOB_REGISTRY) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron, {}, { tz: "UTC" });

    await boss.work(job.name, async () => {
      log.info({ job: job.name }, "running job");
      try {
        await job.handler();
        log.info({ job: job.name }, "job completed");
      } catch (err) {
        log.error({ err, job: job.name }, "job failed");
        throw err;
      }
    });

    log.info({ job: job.name, cron: job.cron }, "job registered");
  }

  globalThis.__atlasJobRunner = boss;
  log.info({ count: JOB_REGISTRY.length }, "all jobs registered");
}
