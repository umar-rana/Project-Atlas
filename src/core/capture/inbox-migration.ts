import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { logActivity } from "@/core/audit";
import type { Prisma } from "@prisma/client";

const log = createLogger({ module: "inbox-migration" });

export type InboxTaskCategory = "A" | "B";

export interface InboxTaskForClassification {
  id: string;
  title: string;
  notes: string | null;
  flagged: boolean;
  due_date: Date | null;
  defer_date: Date | null;
  estimated_minutes: number | null;
  contexts: { context_id: string }[];
  tags: { tag_id: string }[];
  checklist_items: { id: string }[];
  subtasks: { id: string }[];
  auditActions: string[];
  created_at: Date;
}

const SYSTEM_AUDIT_ACTIONS = new Set([
  "task_created",
  "capture_parsed",
  "task_parsed_local_only",
  "task_parsed_with_ai",
  "task_parsed_fallback",
  "capture_created",
]);

/**
 * Classify an inbox task into Category A (safe to migrate to Capture)
 * or Category B (has meaningful metadata — keep as Task).
 *
 * Category A criteria (ALL must be true):
 * - No notes (or notes === title or very short)
 * - Not flagged
 * - No due_date, no defer_date
 * - No estimated_minutes
 * - No contexts, no tags
 * - No checklist items, no subtasks
 * - Only system-generated audit activity (no user overrides/edits)
 *
 * When in doubt, classify as B.
 */
export function categorizeInboxTask(task: InboxTaskForClassification): InboxTaskCategory {
  if (task.flagged) return "B";
  if (task.due_date) return "B";
  if (task.defer_date) return "B";
  if (task.estimated_minutes != null && task.estimated_minutes > 0) return "B";
  if (task.contexts.length > 0) return "B";
  if (task.tags.length > 0) return "B";
  if (task.checklist_items.length > 0) return "B";
  if (task.subtasks.length > 0) return "B";

  if (task.notes && task.notes.trim().length > 0 && task.notes.trim() !== task.title.trim()) {
    return "B";
  }

  const hasUserActivity = task.auditActions.some((a) => !SYSTEM_AUDIT_ACTIONS.has(a));
  if (hasUserActivity) return "B";

  return "A";
}

export interface MigrationCounts {
  categoryA: number;
  categoryB: number;
  total: number;
}

export interface MigrationDryRunResult {
  byUser: Record<string, MigrationCounts>;
  global: MigrationCounts;
}

async function fetchInboxTasksForUser(userId: string): Promise<InboxTaskForClassification[]> {
  const tasks = await db.task.findMany({
    where: {
      user_id: userId,
      project_id: null,
      parent_id: null,
      status: "active",
      deleted_at: null,
    },
    select: {
      id: true,
      title: true,
      notes: true,
      flagged: true,
      due_date: true,
      defer_date: true,
      estimated_minutes: true,
      created_at: true,
      contexts: { select: { context_id: true } },
      tags: { select: { tag_id: true } },
      checklist_items: { where: { deleted_at: null }, select: { id: true } },
      subtasks: { where: { deleted_at: null }, select: { id: true } },
    },
  });

  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length === 0) return [];

  const auditLogs = await db.auditLog.findMany({
    where: {
      entity_type: "Task",
      entity_id: { in: taskIds },
      user_id: userId,
    },
    select: { entity_id: true, action: true },
  });

  const auditByTask: Record<string, string[]> = {};
  for (const log of auditLogs) {
    const existing = auditByTask[log.entity_id];
    if (!existing) {
      auditByTask[log.entity_id] = [log.action];
    } else {
      existing.push(log.action);
    }
  }

  return tasks.map((t) => ({
    ...t,
    due_date: t.due_date ?? null,
    defer_date: t.defer_date ?? null,
    estimated_minutes: t.estimated_minutes ?? null,
    auditActions: auditByTask[t.id] ?? [],
    created_at: t.created_at,
  }));
}

/**
 * Dry-run: count Category A vs B per user and globally.
 * Does NOT make any DB changes.
 */
export async function runInboxMigrationDryRun(
  userIds?: string[],
): Promise<MigrationDryRunResult> {
  const users = userIds
    ? await db.user.findMany({
        where: { id: { in: userIds }, deleted_at: null },
        select: { id: true },
      })
    : await db.user.findMany({
        where: { deleted_at: null },
        select: { id: true },
      });

  const byUser: Record<string, MigrationCounts> = {};
  const global: MigrationCounts = { categoryA: 0, categoryB: 0, total: 0 };

  for (const user of users) {
    const tasks = await fetchInboxTasksForUser(user.id);
    let a = 0;
    let b = 0;
    for (const task of tasks) {
      const cat = categorizeInboxTask(task);
      if (cat === "A") a++;
      else b++;
    }
    byUser[user.id] = { categoryA: a, categoryB: b, total: tasks.length };
    global.categoryA += a;
    global.categoryB += b;
    global.total += tasks.length;
  }

  return { byUser, global };
}

export interface MigrationResult {
  converted: number;
  kept: number;
  errors: number;
  userId: string;
}

/**
 * Run the full inbox migration for a single user.
 * - Category A tasks → soft-deleted, corresponding Capture created (state='proposed')
 * - Category B tasks → left untouched
 * Runs each task in its own transaction so a single failure doesn't block others.
 */
export async function runInboxMigrationForUser(userId: string): Promise<MigrationResult> {
  const tasks = await fetchInboxTasksForUser(userId);
  let converted = 0;
  let kept = 0;
  let errors = 0;

  for (const task of tasks) {
    const category = categorizeInboxTask(task);
    if (category === "B") {
      kept++;
      continue;
    }

    try {
      const captureId = newId();
      const now = new Date();

      const parserProposal: Prisma.InputJsonValue = {
        title: task.title,
        notes: task.notes ?? null,
        due_date: task.due_date ? task.due_date.toISOString() : null,
        defer_date: task.defer_date ? task.defer_date.toISOString() : null,
        estimated_minutes: task.estimated_minutes ?? null,
        flagged: task.flagged,
        parse_tier: "migration_import",
        confidence: 1.0,
      };

      await db.$transaction(async (tx) => {
        await tx.capture.create({
          data: {
            id: captureId,
            user_id: userId,
            raw_text: task.title + (task.notes && task.notes !== task.title ? "\n" + task.notes : ""),
            title: task.title,
            tags: [],
            action_items: [],
            state: "proposed",
            migration_source: "inbox_migration_v1",
            parser_proposal: parserProposal,
            created_at: task.created_at,
          },
        });

        await tx.task.update({
          where: { id: task.id },
          data: {
            deleted_at: now,
            migration_note: `Migrated to Capture ${captureId} by inbox_migration_v1`,
          },
        });
      });

      await logActivity({
        user_id: userId,
        entity_type: "Task",
        entity_id: task.id,
        action: "task_migrated_to_capture",
        meta: { capture_id: captureId, migration_source: "inbox_migration_v1" },
      });

      await logActivity({
        user_id: userId,
        entity_type: "Capture",
        entity_id: captureId,
        action: "capture_created_from_migration",
        meta: { source_task_id: task.id, migration_source: "inbox_migration_v1" },
      });

      converted++;
    } catch (err) {
      log.error({ err, taskId: task.id, userId }, "Failed to migrate task to capture");
      errors++;
    }
  }

  log.info({ userId, converted, kept, errors }, "Inbox migration complete for user");
  return { converted, kept, errors, userId };
}

export interface MigrationSummary {
  converted: number;
  kept: number;
  errors: number;
  ranAt: string;
}

const MIGRATION_SUMMARY_PREF_KEY = "gtd_inbox_migration_v1_summary";

/**
 * Persist migration summary in user's tasks_prefs so the UI can show it once.
 */
export async function saveMigrationSummaryForUser(
  userId: string,
  summary: MigrationSummary,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tasks_prefs: true },
  });
  const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
  await db.user.update({
    where: { id: userId },
    data: {
      tasks_prefs: { ...prefs, [MIGRATION_SUMMARY_PREF_KEY]: summary as unknown as Prisma.InputJsonValue },
    },
  });
}

/**
 * Read and clear the migration summary from user prefs (one-shot display).
 */
export async function readAndClearMigrationSummary(
  userId: string,
): Promise<MigrationSummary | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tasks_prefs: true },
  });
  const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
  const summary = prefs[MIGRATION_SUMMARY_PREF_KEY];
  if (!summary || typeof summary !== "object") return null;

  const s = summary as Record<string, unknown>;
  return {
    converted: typeof s.converted === "number" ? s.converted : 0,
    kept: typeof s.kept === "number" ? s.kept : 0,
    errors: typeof s.errors === "number" ? s.errors : 0,
    ranAt: typeof s.ranAt === "string" ? s.ranAt : new Date().toISOString(),
  };
}

export async function dismissMigrationSummary(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tasks_prefs: true },
  });
  const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
  const updated = { ...prefs };
  delete updated[MIGRATION_SUMMARY_PREF_KEY];
  await db.user.update({
    where: { id: userId },
    data: { tasks_prefs: updated as unknown as Prisma.InputJsonValue },
  });
}
