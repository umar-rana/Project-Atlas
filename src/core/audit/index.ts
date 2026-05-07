import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { Prisma } from "@prisma/client";

const log = createLogger({ module: "audit" });

const AUDITED_ENTITIES = new Set(["AuthEvent", "User", "Task", "Project", "ProjectFolder", "Capture", "EmailCapture", "Attachment", "Note", "NotesFolder", "Table", "TablesFolder", "TaskTemplate", "Person", "PersonEmail", "PersonPhone", "PersonAddress", "PersonOrganization", "PersonUrl", "PersonEvent", "PersonRelation", "PersonSkill", "PersonInterest"]);

export interface ActivityEvent {
  user_id?: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete" | string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  /**
   * When true, any database write failure is re-thrown after being logged,
   * so the caller can handle it explicitly.  Use for critical events (e.g.
   * auth events) where silent data loss is unacceptable.
   */
  throwOnError?: boolean;
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
    if (event.throwOnError) throw err;
  }
}

export function isAudited(entityType: string): boolean {
  return AUDITED_ENTITIES.has(entityType);
}
