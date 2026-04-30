import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { Prisma } from "@prisma/client";

const log = createLogger({ module: "audit" });

const AUDITED_ENTITIES = new Set(["User", "Task", "Project", "ProjectFolder", "Capture", "EmailCapture", "Attachment"]);

export interface ActivityEvent {
  user_id?: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete" | string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { from: before[key], to: after[key] };
    }
  }
  return diff;
}

export async function logActivity(event: ActivityEvent): Promise<void> {
  if (!AUDITED_ENTITIES.has(event.entity_type)) return;

  const diff =
    event.before && event.after
      ? diffObjects(event.before, event.after)
      : undefined;

  try {
    await db.auditLog.create({
      data: {
        id: newId(),
        user_id: event.user_id ?? null,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        action: event.action,
        diff: diff as Prisma.InputJsonValue | undefined,
        meta: event.meta as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    log.error({ err, event }, "Failed to write audit log");
  }
}

export function isAudited(entityType: string): boolean {
  return AUDITED_ENTITIES.has(entityType);
}
