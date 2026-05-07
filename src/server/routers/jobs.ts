import "server-only";
import { router, adminProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { JOB_REGISTRY } from "@/core/jobs/registry";
import { runJobNow } from "@/core/jobs/runner";
import { writeJobAuditLog } from "@/core/jobs/audit";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import cronParser from "cron-parser";

const log = createLogger({ module: "routers/jobs" });

interface PgBossSchedule {
  name: string;
  cron: string;
  timezone: string;
  created_on: Date;
  updated_on: Date;
}

interface PgBossJob {
  id: string;
  name: string;
  state: string;
  output: unknown;
  created_on: Date;
  completed_on: Date | null;
  started_on: Date | null;
}

async function getBossInstance() {
  const g = globalThis as {
    __atlasJobRunner?: {
      unschedule: (name: string) => Promise<void>;
      schedule: (
        name: string,
        cron: string,
        data: Record<string, never>,
        options: { tz: string },
      ) => Promise<void>;
    };
  };
  return g.__atlasJobRunner ?? null;
}

async function getSchedules(): Promise<PgBossSchedule[]> {
  const rows = await db.$queryRaw<PgBossSchedule[]>`
    SELECT name, cron, timezone, created_on, updated_on
    FROM pgboss.schedule
  `;
  return rows;
}

async function getLastJobRun(jobName: string): Promise<PgBossJob | null> {
  try {
    const rows = await db.$queryRaw<PgBossJob[]>`
      SELECT id, name, state, output, created_on, completed_on, started_on
      FROM pgboss.job
      WHERE name = ${jobName}
        AND state IN ('completed', 'failed')
      ORDER BY completed_on DESC NULLS LAST, created_on DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function computeNextRun(cron: string): Date | null {
  try {
    const interval = cronParser.parse(cron, {
      currentDate: new Date(),
      tz: "UTC",
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export const jobsRouter = router({
  list: adminProcedure.query(async () => {
    const schedules = await getSchedules();
    const scheduleMap = new Map(schedules.map((s) => [s.name, s]));

    const results = await Promise.all(
      JOB_REGISTRY.map(async (job) => {
        const schedule = scheduleMap.get(job.name);
        const isActive = !!schedule;
        const lastRun = await getLastJobRun(job.name);
        const nextRun = isActive ? computeNextRun(job.cron) : null;

        let lastResult: string | null = null;
        if (lastRun) {
          if (lastRun.state === "failed") {
            const output = lastRun.output as Record<string, unknown> | null;
            lastResult =
              (output?.message as string) ||
              (output?.error as string) ||
              "Job failed";
          } else if (lastRun.state === "completed") {
            const output = lastRun.output as Record<string, unknown> | null;
            if (output && typeof output === "object") {
              // trash-retention: sum all entity counts
              if (
                typeof output.tasks === "number" ||
                typeof output.projects === "number" ||
                typeof output.notes === "number"
              ) {
                const entityFields = [
                  "checklistItems", "workLogs", "tasks", "projects", "notes",
                  "notesFolders", "projectFolders", "captures", "tags",
                  "contexts", "attachments", "tables", "tableColumns",
                  "tableRows", "tablesFolders", "taskTemplates",
                ];
                const total = entityFields.reduce((sum, k) => {
                  const v = output[k];
                  return sum + (typeof v === "number" ? v : 0);
                }, 0);
                const parts: string[] = [`${total} record${total !== 1 ? "s" : ""} purged`];
                const errs = output.errors;
                if (Array.isArray(errs) && errs.length > 0) {
                  parts.push(`${errs.length} error${errs.length !== 1 ? "s" : ""}`);
                }
                lastResult = parts.join(", ");
              // attachment-cleanup: attachments + orphans cleaned
              } else if (typeof output.attachments === "number" && typeof output.orphans === "number") {
                const parts: string[] = [];
                if (output.attachments > 0) {
                  parts.push(`${output.attachments} attachment${(output.attachments as number) !== 1 ? "s" : ""} cleaned`);
                }
                if ((output.orphans as number) > 0) {
                  parts.push(`${output.orphans} orphan${(output.orphans as number) !== 1 ? "s" : ""} removed`);
                }
                if (typeof output.errors === "number" && (output.errors as number) > 0) {
                  parts.push(`${output.errors} error${(output.errors as number) !== 1 ? "s" : ""}`);
                }
                lastResult = parts.length > 0 ? parts.join(", ") : "nothing to clean";
              // processed-captures-cleanup: captures deleted
              } else if (typeof output.captures === "number") {
                const n = output.captures as number;
                lastResult = `${n} capture${n !== 1 ? "s" : ""} deleted`;
              // job-records-cleanup: audit entries pruned
              } else if (typeof output.deleted === "number" && Object.keys(output).length === 1) {
                const n = output.deleted as number;
                lastResult = `${n} audit entr${n !== 1 ? "ies" : "y"} pruned`;
              // drive sync jobs and import-cleanup
              } else {
                const synced = output.synced ?? output.files_synced ?? output.count;
                if (typeof synced === "number") {
                  const parts: string[] = [`${synced} file${synced !== 1 ? "s" : ""} synced`];
                  const deleted = output.deleted;
                  if (typeof deleted === "number" && deleted > 0) {
                    parts.push(`${deleted} deleted`);
                  }
                  const errors = output.errors;
                  if (typeof errors === "number" && errors > 0) {
                    parts.push(`${errors} error${errors !== 1 ? "s" : ""}`);
                  }
                  lastResult = parts.join(", ");
                } else if (typeof output.message === "string") {
                  lastResult = output.message;
                } else if (typeof output.deleted === "number") {
                  lastResult = `${output.deleted} record${(output.deleted as number) !== 1 ? "s" : ""} removed`;
                }
              }
            }
          }
        }

        return {
          name: job.name,
          description: job.description,
          cron: job.cron,
          status: isActive ? ("active" as const) : ("paused" as const),
          lastRun: lastRun
            ? {
                completedAt: lastRun.completed_on ?? lastRun.created_on,
                outcome: lastRun.state as "completed" | "failed",
                result: lastResult,
              }
            : null,
          nextRun: nextRun ?? null,
        };
      }),
    );

    return results;
  }),

  runNow: adminProcedure
    .input(z.object({ job_name: z.string() }))
    .mutation(async ({ input }) => {
      const job = JOB_REGISTRY.find((j) => j.name === input.job_name);
      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown job" });
      }

      await runJobNow(input.job_name);
      log.info({ job: input.job_name }, "Job enqueued via UI");

      return { queued: true };
    }),

  pause: adminProcedure
    .input(z.object({ job_name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = JOB_REGISTRY.find((j) => j.name === input.job_name);
      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown job" });
      }

      const boss = await getBossInstance();
      try {
        if (boss) {
          await boss.unschedule(input.job_name);
        } else {
          await db.$executeRaw`
            DELETE FROM pgboss.schedule WHERE name = ${input.job_name}
          `;
        }
      } catch (err) {
        log.error({ err, job: input.job_name }, "Failed to pause job");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to pause job — schedule could not be removed.",
        });
      }

      log.info({ job: input.job_name }, "Job schedule removed (paused)");
      await writeJobAuditLog(ctx.user.id, "job_paused", input.job_name);

      return { paused: true };
    }),

  resume: adminProcedure
    .input(z.object({ job_name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = JOB_REGISTRY.find((j) => j.name === input.job_name);
      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown job" });
      }

      const boss = await getBossInstance();
      try {
        if (boss) {
          await boss.schedule(job.name, job.cron, {}, { tz: "UTC" });
        } else {
          await db.$executeRaw`
            INSERT INTO pgboss.schedule (name, cron, timezone, created_on, updated_on)
            VALUES (${job.name}, ${job.cron}, 'UTC', NOW(), NOW())
            ON CONFLICT (name) DO UPDATE SET cron = EXCLUDED.cron, updated_on = NOW()
          `;
        }
      } catch (err) {
        log.error({ err, job: input.job_name }, "Failed to resume job");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resume job — schedule could not be re-added.",
        });
      }

      log.info({ job: input.job_name }, "Job schedule re-added (resumed)");
      await writeJobAuditLog(ctx.user.id, "job_resumed", input.job_name);

      return { resumed: true };
    }),
});
