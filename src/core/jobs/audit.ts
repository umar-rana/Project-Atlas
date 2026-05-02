import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { Prisma } from "@prisma/client";

const log = createLogger({ module: "jobs/audit" });

export async function writeJobAuditLog(
  userId: string | null,
  action: string,
  jobName: string,
  meta?: Record<string, unknown>,
) {
  try {
    await db.auditLog.create({
      data: {
        id: newId(),
        user_id: userId,
        entity_type: "Job",
        entity_id: jobName,
        action,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    log.error({ err, action, jobName }, "Failed to write job audit log");
  }
}
