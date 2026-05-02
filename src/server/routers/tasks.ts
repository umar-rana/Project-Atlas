import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { withDeleted } from "@/core/db/soft-delete";
import { logActivity, diffObjects } from "@/core/audit";
import {
  resolveAndApplyReferences,
  releaseTagReferences,
} from "@/core/references/resolver";
import { syncLinksForSource } from "@/core/links/service";
import type { ResolvedLink } from "@/core/links/resolver";
import { createLogger } from "@/core/logging";
import { computeNextOccurrence, ruleForNextOccurrence } from "@/core/recurrence/rrule-helpers";
import { RRule } from "rrule";

const log = createLogger({ module: "tasks-router" });

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a timezone offset in minutes (as returned by `new Date().getTimezoneOffset()`
 * on the client — positive west of UTC, negative east), returns midnight boundaries
 * for today and tomorrow in that local timezone, expressed as UTC Date objects.
 */
function getLocalDayBoundaries(timezoneOffsetMinutes: number) {
  const nowUtc = new Date();
  // Shift to "local" time by subtracting the offset
  const localNow = new Date(nowUtc.getTime() - timezoneOffsetMinutes * 60_000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();
  // Local midnight expressed as UTC: shift back by adding the offset
  const todayStart = new Date(Date.UTC(y, m, d) + timezoneOffsetMinutes * 60_000);
  const tomorrowStart = new Date(Date.UTC(y, m, d + 1) + timezoneOffsetMinutes * 60_000);
  const dayAfterTomorrowStart = new Date(Date.UTC(y, m, d + 2) + timezoneOffsetMinutes * 60_000);
  return { nowUtc, todayStart, tomorrowStart, dayAfterTomorrowStart };
}

const TaskCreateInput = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(50_000).optional(),
  project_id: z.string().uuid().nullable().optional(),
  /** If set and `project_id` is missing, server resolves or auto-creates a project with this title. */
  project_title: z.string().min(1).max(200).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  flagged: z.boolean().optional(),
  defer_date: z.coerce.date().nullable().optional(),
  due_date: z.coerce.date().nullable().optional(),
  estimated_minutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
  context_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  position: z.string().optional(),
});

const TaskUpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(50_000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  flagged: z.boolean().optional(),
  defer_date: z.coerce.date().nullable().optional(),
  due_date: z.coerce.date().nullable().optional(),
  estimated_minutes: z.number().int().min(0).nullable().optional(),
  context_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

function nextPosition(maxPos: Prisma.Decimal | null): string {
  // Simple: max + 1024. Fractional-indexing midpoints used in `move`.
  const base = maxPos ? new Prisma.Decimal(maxPos) : new Prisma.Decimal(0);
  return base.plus(1024).toString();
}

// Full projection for the inspector's `get` endpoint — includes every field
// the detail panel needs (including `notes`, references, recurrence, etc.).
const TASK_INCLUDE = {
  contexts: { include: { context: { select: { id: true, name: true } } } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  project: { select: { id: true, title: true, color: true } },
  parent: { select: { id: true, title: true } },
  subtasks: {
    where: { deleted_at: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      status: true,
      title: true,
      due_date: true,
      flagged: true,
      estimated_minutes: true,
    },
  },
  checklist_items: {
    where: { deleted_at: null },
    orderBy: { position: "asc" },
    select: { id: true, title: true, completed_at: true, position: true },
  },
  _count: {
    select: { attachments: { where: { deleted_at: null } } },
  },
} satisfies Prisma.TaskInclude;

// Narrowed projection for list endpoints — omits `notes` (up to 50 KB per task)
// and other fields not rendered in list rows, keeping payloads small.
// The inspector's `get` endpoint still uses TASK_INCLUDE for the full record.
const TASK_LIST_SELECT = {
  id: true,
  title: true,
  notes: true, // kept so duplicate-task quick action preserves content
  status: true,
  flagged: true,
  project_id: true,
  parent_id: true,
  defer_date: true,
  due_date: true,
  estimated_minutes: true,
  position: true,
  deleted_at: true,
  recurrence_rule: true,
  recurrence_anchor: true,
  contexts: { select: { context: { select: { id: true, name: true } } } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  project: { select: { id: true, title: true, color: true } },
  parent: { select: { id: true, title: true } },
  subtasks: {
    where: { deleted_at: null },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      status: true,
      title: true,
      due_date: true,
      flagged: true,
      estimated_minutes: true,
    },
  },
  checklist_items: {
    where: { deleted_at: null },
    orderBy: { position: "asc" as const },
    select: { id: true, title: true, completed_at: true, position: true },
  },
  _count: {
    select: { attachments: { where: { deleted_at: null } } },
  },
} satisfies Prisma.TaskSelect;

// ── Router ───────────────────────────────────────────────────────────────────

export const tasksRouter = router({
  // ── List by perspective ─────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        perspective: z
          .enum([
            "all",
            "inbox",
            "today",
            "tomorrow",
            "flagged",
            "project",
            "context",
            "tag",
            "trash",
          ])
          .default("all"),
        project_id: z.string().uuid().optional(),
        context_id: z.string().uuid().optional(),
        tag_name: z.string().optional(),
        include_completed: z.boolean().default(false),
        include_deferred: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(200),
        timezoneOffset: z.number().int().min(-840).max(840).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TaskWhereInput = {
        user_id: ctx.user.id,
      };

      if (input.perspective === "trash") {
        const items = await db.task.findMany({
          where: withDeleted<Prisma.TaskWhereInput>({
            user_id: ctx.user.id,
            NOT: { deleted_at: null },
          }),
          orderBy: { deleted_at: "desc" },
          select: TASK_LIST_SELECT,
          take: input.limit,
        });
        return items;
      }

      if (!input.include_completed) {
        where.status = "active";
      }

      const { nowUtc, todayStart, tomorrowStart, dayAfterTomorrowStart } =
        getLocalDayBoundaries(input.timezoneOffset);
      const notDeferred: Prisma.TaskWhereInput = {
        OR: [{ defer_date: null }, { defer_date: { lte: nowUtc } }],
      };

      if (input.perspective === "inbox") {
        where.project_id = null;
        where.parent_id = null;
      } else if (input.perspective === "today") {
        where.AND = [
          notDeferred,
          {
            OR: [
              { due_date: { lt: tomorrowStart } },
              { defer_date: { lte: nowUtc, not: null } },
              { flagged: true },
            ],
          },
        ];
      } else if (input.perspective === "tomorrow") {
        where.AND = [
          {
            OR: [
              { due_date: { gte: tomorrowStart, lt: dayAfterTomorrowStart } },
              { defer_date: { gte: tomorrowStart, lt: dayAfterTomorrowStart } },
            ],
          },
        ];
      } else if (input.perspective === "flagged") {
        where.flagged = true;
      } else if (input.perspective === "project") {
        if (!input.project_id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "project_id is required for project perspective",
          });
        }
        where.project_id = input.project_id;
        where.parent_id = null;
        if (!input.include_deferred) {
          where.AND = [notDeferred];
        }
      } else if (input.perspective === "context") {
        if (!input.context_id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "context_id is required",
          });
        }
        where.contexts = { some: { context_id: input.context_id } };
      } else if (input.perspective === "tag") {
        if (!input.tag_name) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "tag_name is required" });
        }
        where.tags = {
          some: { tag: { name: input.tag_name.toLowerCase() } },
        };
      }

      const items = await db.task.findMany({
        where,
        orderBy: [
          { flagged: "desc" },
          { due_date: { sort: "asc", nulls: "last" } },
          { position: "asc" },
          { created_at: "desc" },
        ],
        select: TASK_LIST_SELECT,
        take: input.limit,
      });

      // ── Sequential project filtering ──────────────────────────────────────
      // Only applies to: "project" (annotate), "today", "flagged" (exclude blocked).
      // "all", "context", "tag" are unaffected intentionally.
      const SEQUENTIAL_PERSPECTIVES = new Set(["project", "today", "flagged", "forecast"]);
      if (!SEQUENTIAL_PERSPECTIVES.has(input.perspective)) {
        return items;
      }

      const projectIds = [
        ...new Set(items.map((t) => t.project_id).filter(Boolean) as string[]),
      ];

      if (projectIds.length > 0) {
        const sequentialProjects = await db.project.findMany({
          where: { id: { in: projectIds }, sequential: true },
          select: { id: true },
        });
        const sequentialProjectIds = new Set(sequentialProjects.map((p) => p.id));

        if (sequentialProjectIds.size > 0) {
          // Batch: one query for all sequential projects instead of N+1 findFirst calls.
          // We fetch candidates ordered by position then created_at, then pick the first
          // per project in memory — equivalent to N individual findFirst calls.
          const firstAvailableByProject = new Map<string, string>();
          const firstCandidates = await db.task.findMany({
            where: {
              project_id: { in: [...sequentialProjectIds] },
              status: "active",
              parent_id: null,
              deleted_at: null,
            },
            orderBy: [{ position: "asc" }, { created_at: "asc" }],
            select: { id: true, project_id: true },
          });
          for (const candidate of firstCandidates) {
            if (!candidate.project_id) continue;
            if (!firstAvailableByProject.has(candidate.project_id)) {
              firstAvailableByProject.set(candidate.project_id, candidate.id);
            }
          }

          if (input.perspective === "project") {
            // Annotate each task with is_blocked
            return items.map((task) => {
              if (!task.project_id || !sequentialProjectIds.has(task.project_id)) {
                return { ...task, is_blocked: false };
              }
              const firstId = firstAvailableByProject.get(task.project_id);
              // Flagged tasks are always available regardless of sequential order
              const isBlocked = task.status === "active" && task.id !== firstId && !task.flagged;
              return { ...task, is_blocked: isBlocked };
            });
          } else {
            // For today/flagged: exclude blocked tasks,
            // but flagged tasks appear even if blocked (flagged overrides sequential blocking).
            return items.filter((task) => {
              if (!task.project_id || !sequentialProjectIds.has(task.project_id)) return true;
              if (task.status !== "active") return true;
              if (task.flagged) return true; // flagged override
              const firstId = firstAvailableByProject.get(task.project_id);
              return task.id === firstId;
            });
          }
        }
      }

      return items;
    }),

  counts: protectedProcedure
    .input(z.object({ timezoneOffset: z.number().int().min(-840).max(840).default(0) }))
    .query(async ({ ctx, input }) => {
      const { nowUtc, tomorrowStart, dayAfterTomorrowStart } = getLocalDayBoundaries(
        input.timezoneOffset,
      );

      const notDeferred: Prisma.TaskWhereInput = {
        OR: [{ defer_date: null }, { defer_date: { lte: nowUtc } }],
      };

      const [inbox, today, tomorrow, flagged, trash] = await Promise.all([
        db.task.count({
          where: {
            user_id: ctx.user.id,
            status: "active",
            project_id: null,
            parent_id: null,
          },
        }),
        db.task.count({
          where: {
            user_id: ctx.user.id,
            status: "active",
            AND: [
              notDeferred,
              {
                OR: [
                  { due_date: { lt: tomorrowStart } },
                  { defer_date: { lte: nowUtc, not: null } },
                  { flagged: true },
                ],
              },
            ],
          },
        }),
        db.task.count({
          where: {
            user_id: ctx.user.id,
            status: "active",
            OR: [
              { due_date: { gte: tomorrowStart, lt: dayAfterTomorrowStart } },
              { defer_date: { gte: tomorrowStart, lt: dayAfterTomorrowStart } },
            ],
          },
        }),
        db.task.count({
          where: { user_id: ctx.user.id, status: "active", flagged: true },
        }),
        db.task.count({
          where: withDeleted<Prisma.TaskWhereInput>({
            user_id: ctx.user.id,
            NOT: { deleted_at: null },
          }),
        }),
      ]);

      return { inbox, today, tomorrow, flagged, trash };
    }),

  countDeferred: protectedProcedure
    .input(z.object({ project_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const count = await db.task.count({
        where: {
          user_id: ctx.user.id,
          project_id: input.project_id,
          parent_id: null,
          status: "active",
          deleted_at: null,
          defer_date: { gt: now },
        },
      });
      return { count };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid(), includeDeleted: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const baseWhere: Prisma.TaskWhereInput = {
        id: input.id,
        user_id: ctx.user.id,
      };
      const task = await db.task.findFirst({
        where: input.includeDeleted ? withDeleted(baseWhere) : baseWhere,
        include: TASK_INCLUDE,
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      return task;
    }),

  // ── Create ────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(TaskCreateInput)
    .mutation(async ({ ctx, input }) => {
      const id = newId();
      const userId = ctx.user.id;

      // Validate every foreign ID belongs to this user before any writes.
      let resolvedProjectId: string | null = input.project_id ?? null;
      if (resolvedProjectId) {
        const owns = await db.project.findFirst({
          where: { id: resolvedProjectId, user_id: userId },
          select: { id: true },
        });
        if (!owns) {
          // Guard: check if the caller accidentally passed a folder ID instead of a project ID.
          const isFolder = await db.projectFolder.findFirst({
            where: { id: resolvedProjectId, user_id: userId },
            select: { id: true },
          });
          if (isFolder) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tasks cannot be added directly to a folder. Add the task to a project within the folder instead.",
            });
          }
          throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        }
      } else if (input.project_title) {
        // Resolve `>>project` from quick-add: find by title, else create.
        const title = input.project_title.trim();
        const existing = await db.project.findFirst({
          where: { user_id: userId, title },
          select: { id: true },
        });
        if (existing) {
          resolvedProjectId = existing.id;
        } else {
          const newProject = await db.project.create({
            data: { id: newId(), user_id: userId, title },
          });
          resolvedProjectId = newProject.id;
        }
      }

      if (input.parent_id) {
        const parent = await db.task.findFirst({
          where: { id: input.parent_id, user_id: userId },
          select: { id: true, parent_id: true },
        });
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent task not found" });
        if (parent.parent_id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Subtasks cannot be nested: maximum depth is one level.",
          });
        }
      }

      if (input.context_ids?.length) {
        const owned = await db.context.findMany({
          where: { id: { in: input.context_ids }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== input.context_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown context id" });
        }
      }
      if (input.tag_ids?.length) {
        const owned = await db.tag.findMany({
          where: { id: { in: input.tag_ids }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== input.tag_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown tag id" });
        }
      }

      // Determine position: max within scope + 1024.
      const maxAgg = await db.task.aggregate({
        _max: { position: true },
        where: {
          user_id: userId,
          project_id: resolvedProjectId,
          parent_id: input.parent_id ?? null,
        },
      });
      const position = input.position ?? nextPosition(maxAgg._max.position);

      const task = await db.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            id,
            user_id: userId,
            title: input.title,
            notes: input.notes ?? null,
            project_id: resolvedProjectId,
            parent_id: input.parent_id ?? null,
            flagged: input.flagged ?? false,
            defer_date: input.defer_date ?? null,
            due_date: input.due_date ?? null,
            estimated_minutes: input.estimated_minutes ?? null,
            position: new Prisma.Decimal(position),
          },
        });

        if (input.context_ids?.length) {
          await tx.contextOnTask.createMany({
            data: input.context_ids.map((context_id) => ({
              task_id: created.id,
              context_id,
            })),
            skipDuplicates: true,
          });
        }
        if (input.tag_ids?.length) {
          await tx.tagOnTask.createMany({
            data: input.tag_ids.map((tag_id) => ({
              task_id: created.id,
              tag_id,
            })),
            skipDuplicates: true,
          });
          await tx.tag.updateMany({
            where: { id: { in: input.tag_ids } },
            data: { usage_count: { increment: 1 } },
          });
        }

        // Resolve refs from notes
        if (input.notes) {
          const refs = await resolveAndApplyReferences({
            userId,
            notes: input.notes,
            previousTagIds: [],
            tx,
          });
          await tx.task.update({
            where: { id: created.id },
            data: {
              referenced_person_ids: refs.person_ids,
              referenced_tag_ids: refs.tag_ids,
              referenced_entity_refs: refs.entity_refs satisfies Prisma.InputJsonValue,
            },
          });

          const resolvedLinks: ResolvedLink[] = [
            ...refs.entity_refs.map((e) => ({
              target_type: e.kind === "project" ? "Project" : "Task",
              target_id: e.id,
            })),
            ...refs.tag_ids.map((id) => ({ target_type: "Tag", target_id: id })),
          ];
          await syncLinksForSource({
            userId,
            source_type: "Task",
            source_id: created.id,
            resolved: resolvedLinks,
            tx,
          });
        }

        return tx.task.findUniqueOrThrow({
          where: { id: created.id },
          include: TASK_INCLUDE,
        });
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: task.id,
        action: "create",
        meta: { title: task.title },
      });

      return task;
    }),

  // ── Update ────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(TaskUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const before = await db.task.findFirst({
        where: { id: input.id, user_id: userId },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      // Validate any new foreign IDs are owned by this user.
      if (input.project_id) {
        const owns = await db.project.findFirst({
          where: { id: input.project_id, user_id: userId },
          select: { id: true },
        });
        if (!owns) {
          // Guard: check if the caller accidentally passed a folder ID instead of a project ID.
          const isFolder = await db.projectFolder.findFirst({
            where: { id: input.project_id, user_id: userId },
            select: { id: true },
          });
          if (isFolder) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tasks cannot be assigned directly to a folder. Assign the task to a project within the folder instead.",
            });
          }
          throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        }
      }
      if (input.parent_id) {
        const parent = await db.task.findFirst({
          where: { id: input.parent_id, user_id: userId },
          select: { id: true, parent_id: true },
        });
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent task not found" });
        if (parent.parent_id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Subtasks cannot be nested: maximum depth is one level.",
          });
        }
      }
      if (input.context_ids?.length) {
        const owned = await db.context.findMany({
          where: { id: { in: input.context_ids }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== input.context_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown context id" });
        }
      }
      if (input.tag_ids?.length) {
        const owned = await db.tag.findMany({
          where: { id: { in: input.tag_ids }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== input.tag_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown tag id" });
        }
      }

      const data: Prisma.TaskUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.project_id !== undefined) {
        data.project = input.project_id
          ? { connect: { id: input.project_id } }
          : { disconnect: true };
      }
      if (input.parent_id !== undefined) {
        data.parent = input.parent_id
          ? { connect: { id: input.parent_id } }
          : { disconnect: true };
      }
      if (input.flagged !== undefined) data.flagged = input.flagged;
      if (input.defer_date !== undefined) data.defer_date = input.defer_date;
      if (input.due_date !== undefined) data.due_date = input.due_date;
      if (input.estimated_minutes !== undefined) data.estimated_minutes = input.estimated_minutes;

      const updated = await db.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: input.id },
          data,
        });

        // If project_id changed, move all child subtasks to the new project.
        if (input.project_id !== undefined && input.project_id !== before.project_id) {
          await tx.task.updateMany({
            where: { parent_id: input.id, user_id: userId },
            data: { project_id: input.project_id ?? null },
          });
        }

        if (input.context_ids !== undefined) {
          await tx.contextOnTask.deleteMany({ where: { task_id: input.id } });
          if (input.context_ids.length > 0) {
            await tx.contextOnTask.createMany({
              data: input.context_ids.map((context_id) => ({
                task_id: input.id,
                context_id,
              })),
              skipDuplicates: true,
            });
          }
        }
        if (input.tag_ids !== undefined) {
          const existing = await tx.tagOnTask.findMany({
            where: { task_id: input.id },
            select: { tag_id: true },
          });
          const previousTagIds = existing.map((t) => t.tag_id);
          await tx.tagOnTask.deleteMany({ where: { task_id: input.id } });
          if (input.tag_ids.length > 0) {
            await tx.tagOnTask.createMany({
              data: input.tag_ids.map((tag_id) => ({
                task_id: input.id,
                tag_id,
              })),
              skipDuplicates: true,
            });
          }
          // Adjust usage_count.
          const prev = new Set(previousTagIds);
          const next = new Set(input.tag_ids);
          const inc = input.tag_ids.filter((id) => !prev.has(id));
          const dec = previousTagIds.filter((id) => !next.has(id));
          if (inc.length) {
            await tx.tag.updateMany({
              where: { id: { in: inc } },
              data: { usage_count: { increment: 1 } },
            });
          }
          if (dec.length) {
            await tx.tag.updateMany({
              where: { id: { in: dec } },
              data: { usage_count: { decrement: 1 } },
            });
          }
        }

        // Re-parse references if notes changed.
        if (input.notes !== undefined && input.notes !== before.notes) {
          const refs = await resolveAndApplyReferences({
            userId: ctx.user.id,
            notes: input.notes,
            previousTagIds: before.referenced_tag_ids,
            tx,
          });
          await tx.task.update({
            where: { id: input.id },
            data: {
              referenced_person_ids: refs.person_ids,
              referenced_tag_ids: refs.tag_ids,
              referenced_entity_refs: refs.entity_refs satisfies Prisma.InputJsonValue,
            },
          });

          const resolvedLinks: ResolvedLink[] = [
            ...refs.entity_refs.map((e) => ({
              target_type: e.kind === "project" ? "Project" : "Task",
              target_id: e.id,
            })),
            ...refs.tag_ids.map((id) => ({ target_type: "Tag", target_id: id })),
          ];
          await syncLinksForSource({
            userId: ctx.user.id,
            source_type: "Task",
            source_id: input.id,
            resolved: resolvedLinks,
            tx,
          });
        }

        return tx.task.findUniqueOrThrow({
          where: { id: input.id },
          include: TASK_INCLUDE,
        });
      });

      // Cast Prisma's typed rows to a generic record for the structural
      // diff helper. The diff helper only reads enumerable string keys, so
      // a one-step assertion is safe and avoids an unknown-bridge.
      const beforeRec = before as Record<string, unknown>;
      const updatedRec = updated as Record<string, unknown>;
      const diff = diffObjects(beforeRec, updatedRec);
      if (Object.keys(diff).length > 0) {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: updated.id,
          action: "update",
          before: beforeRec,
          after: updatedRec,
        });
      }

      return updated;
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const completedAt = new Date();
      const task = await db.task.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
        select: {
          id: true,
          title: true,
          notes: true,
          project_id: true,
          estimated_minutes: true,
          due_date: true,
          defer_date: true,
          flagged: true,
          recurrence_rule: true,
          recurrence_anchor: true,
          recurrence_parent_id: true,
          tags: { select: { tag_id: true } },
          contexts: { select: { context_id: true } },
          checklist_items: {
            where: { deleted_at: null },
            select: { id: true, title: true, position: true },
          },
        },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      // Pre-compute next occurrence data before the transaction so the
      // mark-complete and next-occurrence creation are fully atomic.
      let nextOccurrenceId: string | null = null;
      let nextOccurrenceDate: Date | null = null;
      let newId_: string | null = null;
      let childRule: string | null = null;
      let chainAnchorId: string | null = null;
      let position: string | null = null;

      if (task.recurrence_rule) {
        nextOccurrenceDate = computeNextOccurrence(
          task.recurrence_rule,
          (task.recurrence_anchor ?? "due_date") as "due_date" | "completion_date",
          completedAt,
          task.due_date,
        );

        if (nextOccurrenceDate) {
          newId_ = newId();
          chainAnchorId = task.recurrence_parent_id ?? task.id;
          childRule = ruleForNextOccurrence(task.recurrence_rule);

          const maxAgg = await db.task.aggregate({
            _max: { position: true },
            where: { user_id: ctx.user.id, project_id: task.project_id, parent_id: null },
          });
          position = nextPosition(maxAgg._max.position);
          nextOccurrenceId = newId_;
        }
      }

      // Single atomic transaction: mark task complete + create next occurrence.
      await db.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: input.id },
          data: { status: "completed", completed_at: completedAt },
        });

        if (nextOccurrenceDate && newId_ && chainAnchorId !== null && position !== null) {
          await tx.task.create({
            data: {
              id: newId_,
              user_id: ctx.user.id,
              title: task.title,
              notes: task.notes ?? null,
              project_id: task.project_id ?? null,
              estimated_minutes: task.estimated_minutes ?? null,
              due_date: nextOccurrenceDate,
              flagged: false,
              recurrence_rule: childRule,
              recurrence_anchor: childRule ? (task.recurrence_anchor ?? "due_date") : "due_date",
              recurrence_parent_id: childRule ? chainAnchorId : null,
              position: new Prisma.Decimal(position),
            },
          });

          if (task.tags.length > 0) {
            await tx.tagOnTask.createMany({
              data: task.tags.map((t) => ({ task_id: newId_!, tag_id: t.tag_id })),
              skipDuplicates: true,
            });
          }

          if (task.contexts.length > 0) {
            await tx.contextOnTask.createMany({
              data: task.contexts.map((c) => ({ task_id: newId_!, context_id: c.context_id })),
              skipDuplicates: true,
            });
          }

          if (task.checklist_items.length > 0) {
            await tx.checklistItem.createMany({
              data: task.checklist_items.map((ci) => ({
                id: newId(),
                user_id: ctx.user.id,
                task_id: newId_!,
                title: ci.title,
                position: ci.position,
              })),
            });
          }
        }
      });

      const auditMeta: Record<string, unknown> = {};
      if (nextOccurrenceId && nextOccurrenceDate) {
        auditMeta.next_occurrence_id = nextOccurrenceId;
        auditMeta.next_occurrence_date = nextOccurrenceDate.toISOString();
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.id,
        action: "complete",
        meta: Object.keys(auditMeta).length > 0 ? auditMeta : undefined,
      });
      return { ok: true, next_occurrence_id: nextOccurrenceId };
    }),

  // ── Recurrence procedures ────────────────────────────────────────────────
  setRecurrence: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        rule: z.string().min(1).max(500),
        anchor: z.enum(["due_date", "completion_date"]).default("due_date"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      // Validate the RRULE string before persisting to prevent silently
      // broken recurring tasks that stop generating occurrences.
      try {
        const rruleStr = input.rule.startsWith("RRULE:") ? input.rule : `RRULE:${input.rule}`;
        RRule.fromString(rruleStr);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid recurrence rule" });
      }

      await db.task.update({
        where: { id: input.id },
        data: {
          recurrence_rule: input.rule,
          recurrence_anchor: input.anchor,
          // Anchor tasks point to themselves so all chain members share
          // recurrence_parent_id = anchor_id as a consistent data invariant.
          recurrence_parent_id: input.id,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.id,
        action: "update",
        meta: { recurrence_rule: input.rule, recurrence_anchor: input.anchor },
      });

      return { ok: true };
    }),

  removeRecurrence: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      await db.task.update({
        where: { id: input.id },
        data: {
          recurrence_rule: null,
          recurrence_anchor: "due_date",
          recurrence_parent_id: null,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.id,
        action: "update",
        meta: { recurrence_rule: null },
      });

      return { ok: true };
    }),

  recurrenceInstances: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
        select: { id: true, recurrence_parent_id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const chainAnchorId = task.recurrence_parent_id ?? task.id;

      const instances = await db.task.findMany({
        where: {
          user_id: ctx.user.id,
          OR: [
            { id: chainAnchorId },
            { recurrence_parent_id: chainAnchorId },
          ],
        },
        orderBy: { due_date: "asc" },
        take: input.limit,
        select: { id: true, title: true, due_date: true, status: true, completed_at: true },
      });

      return instances;
    }),

  uncomplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.task.updateMany({
        where: { id: input.id, user_id: ctx.user.id },
        data: { status: "active", completed_at: null },
      });
      if (result.count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.id,
        action: "uncomplete",
      });
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const task = await db.task.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true, recurrence_rule: true, recurrence_parent_id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      await db.task.update({
        where: { id: input.id },
        data: { deleted_at: now },
      });

      // Cascade soft-delete to child subtasks and checklist items.
      await db.task.updateMany({
        where: { parent_id: input.id, user_id: ctx.user.id, deleted_at: null },
        data: { deleted_at: now },
      });
      await db.checklistItem.updateMany({
        where: { task_id: input.id, user_id: ctx.user.id, deleted_at: null },
        data: { deleted_at: now },
      });

      // Break the recurrence chain when deleting the anchor task.
      // An anchor has recurrence_parent_id === task.id (self-reference).
      // We clear recurrence_parent_id from direct descendants so the chain
      // link is severed; their recurrence_rule is preserved so they are
      // "untouched" in terms of content but no longer linked to the anchor.
      if (task.recurrence_rule && task.recurrence_parent_id === input.id) {
        await db.task.updateMany({
          where: {
            user_id: ctx.user.id,
            recurrence_parent_id: input.id,
            deleted_at: null,
          },
          data: { recurrence_parent_id: null },
        });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.id,
        action: "delete",
      });
      return { ok: true };
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.task.updateMany({
        where: {
          id: input.id,
          user_id: ctx.user.id,
          NOT: { deleted_at: null },
        },
        data: { deleted_at: null },
      });
      if (result.count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      // Cascade restore to child subtasks and checklist items.
      await db.task.updateMany({
        where: { parent_id: input.id, user_id: ctx.user.id, NOT: { deleted_at: null } },
        data: { deleted_at: null },
      });
      await db.checklistItem.updateMany({
        where: { task_id: input.id, user_id: ctx.user.id, NOT: { deleted_at: null } },
        data: { deleted_at: null },
      });
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.id,
        action: "restore",
      });
      return { ok: true };
    }),

  hardDelete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: withDeleted<Prisma.TaskWhereInput>({
          id: input.id,
          user_id: ctx.user.id,
          NOT: { deleted_at: null },
        }),
      });
      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Task must be in trash before it can be permanently deleted",
        });
      }
      await db.$transaction(async (tx) => {
        if (task.referenced_tag_ids.length) {
          await releaseTagReferences({ tagIds: task.referenced_tag_ids, tx });
        }
        const tagJoins = await tx.tagOnTask.findMany({
          where: { task_id: task.id },
          select: { tag_id: true },
        });
        if (tagJoins.length) {
          await tx.tag.updateMany({
            where: { id: { in: tagJoins.map((t) => t.tag_id) } },
            data: { usage_count: { decrement: 1 } },
          });
        }
        // Bypass the soft-delete middleware via raw SQL.
        await tx.$executeRaw`DELETE FROM "Task" WHERE id = ${task.id} AND user_id = ${ctx.user.id}`;
      });
      return { ok: true };
    }),

  emptyTrash: protectedProcedure.mutation(async ({ ctx }) => {
    const tasks = await db.task.findMany({
      where: withDeleted<Prisma.TaskWhereInput>({
        user_id: ctx.user.id,
        NOT: { deleted_at: null },
      }),
      select: { id: true, referenced_tag_ids: true },
    });
    if (tasks.length === 0) return { ok: true, count: 0 };
    const ids = tasks.map((t) => t.id);
    await db.$transaction(async (tx) => {
      const tagJoins = await tx.tagOnTask.findMany({
        where: { task_id: { in: ids } },
        select: { tag_id: true },
      });
      const allRefTags = tasks.flatMap((t) => t.referenced_tag_ids);
      const tagDecrements = [...tagJoins.map((t) => t.tag_id), ...allRefTags];
      if (tagDecrements.length) {
        const counts = new Map<string, number>();
        for (const id of tagDecrements) counts.set(id, (counts.get(id) ?? 0) + 1);
        for (const [tagId, n] of counts) {
          await tx.tag.update({
            where: { id: tagId },
            data: { usage_count: { decrement: n } },
          });
        }
      }
      // Bypass the soft-delete middleware via raw SQL, scoped to user.
      await tx.$executeRaw`DELETE FROM "Task" WHERE user_id = ${ctx.user.id} AND deleted_at IS NOT NULL`;
    });
    return { ok: true, count: ids.length };
  }),

  // ── Move (fractional indexing) ─────────────────────────────────────────
  move: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        before_id: z.string().uuid().nullable().optional(),
        after_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        parent_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const target = await db.task.findFirst({
        where: { id: input.id, user_id: userId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // Authorization: any new project_id/parent_id must belong to caller.
      if (input.project_id) {
        const owns = await db.project.findFirst({
          where: { id: input.project_id, user_id: userId },
          select: { id: true },
        });
        if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      if (input.parent_id) {
        const owns = await db.task.findFirst({
          where: { id: input.parent_id, user_id: userId },
          select: { id: true },
        });
        if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Parent task not found" });
      }

      const beforeRow = input.before_id
        ? await db.task.findFirst({ where: { id: input.before_id, user_id: userId } })
        : null;
      const afterRow = input.after_id
        ? await db.task.findFirst({ where: { id: input.after_id, user_id: userId } })
        : null;

      let newPos: Prisma.Decimal;
      if (beforeRow && afterRow) {
        newPos = new Prisma.Decimal(beforeRow.position).plus(afterRow.position).div(2);
      } else if (beforeRow) {
        newPos = new Prisma.Decimal(beforeRow.position).plus(1024);
      } else if (afterRow) {
        newPos = new Prisma.Decimal(afterRow.position).div(2);
      } else {
        newPos = new Prisma.Decimal(1024);
      }

      // Rebalance trigger: if precision blew past 9 fractional digits,
      // renumber the scope by 1024-step increments.
      const decimalStr = newPos.toString();
      const fracDigits = decimalStr.split(".")[1]?.length ?? 0;
      let rebalanced = false;
      if (fracDigits > 9) {
        rebalanced = true;
      }

      const update: Prisma.TaskUpdateInput = { position: newPos };
      if (input.project_id !== undefined) {
        update.project = input.project_id
          ? { connect: { id: input.project_id } }
          : { disconnect: true };
      }
      if (input.parent_id !== undefined) {
        update.parent = input.parent_id
          ? { connect: { id: input.parent_id } }
          : { disconnect: true };
      }

      await db.task.update({ where: { id: input.id }, data: update });

      if (rebalanced) {
        const scope: Prisma.TaskWhereInput = {
          user_id: ctx.user.id,
          status: "active",
          project_id: input.project_id ?? target.project_id,
          parent_id: input.parent_id ?? target.parent_id,
        };
        const all = await db.task.findMany({
          where: scope,
          orderBy: { position: "asc" },
          select: { id: true },
        });
        for (let i = 0; i < all.length; i++) {
          const row = all[i];
          if (!row) continue;
          await db.task.update({
            where: { id: row.id },
            data: { position: new Prisma.Decimal((i + 1) * 1024) },
          });
        }
      }

      return { ok: true };
    }),

  // ── Bulk operations ───────────────────────────────────────────────────
  bulkComplete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      // updateMany with user_id guards ownership; we only audit ids that
      // were actually owned & touched.
      const owned = await db.task.findMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id },
        select: { id: true },
      });
      if (owned.length === 0) return { ok: true, count: 0 };
      const ownedIds = owned.map((t) => t.id);
      const result = await db.task.updateMany({
        where: { id: { in: ownedIds }, user_id: ctx.user.id },
        data: { status: "completed", completed_at: new Date() },
      });
      for (const id of ownedIds) {
        log.debug({ id }, "bulk complete");
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: id,
          action: "complete",
        });
      }
      return { ok: true, count: result.count };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.task.updateMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id, deleted_at: null },
        data: { deleted_at: new Date() },
      });
      return { ok: true, count: result.count };
    }),

  bulkPermanentDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const ownedTasks = await db.task.findMany({
        where: {
          id: { in: input.ids },
          user_id: userId,
          status: "completed",
          deleted_at: null,
        },
        select: { id: true, referenced_tag_ids: true },
      });
      if (ownedTasks.length === 0) return { ok: true, count: 0 };

      await db.$transaction(async (tx) => {
        const tagIds = [...new Set(ownedTasks.flatMap((t) => t.referenced_tag_ids))];
        if (tagIds.length) {
          await releaseTagReferences({ tagIds, tx });
        }
        const taskIds = ownedTasks.map((t) => t.id);
        await tx.tagOnTask.deleteMany({ where: { task_id: { in: taskIds } } });
        for (const tid of taskIds) {
          await tx.$executeRaw`DELETE FROM "Task" WHERE id = ${tid}::uuid AND user_id = ${userId}::uuid`;
        }
      });

      await logActivity({
        user_id: userId,
        entity_type: "Task",
        entity_id: "bulk",
        action: "bulk_permanent_delete",
        meta: { count: ownedTasks.length },
      });

      return { ok: true, count: ownedTasks.length };
    }),

  bulkMoveToProject: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string().uuid()).min(1),
        project_id: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.project_id) {
        const owns = await db.project.findFirst({
          where: { id: input.project_id, user_id: ctx.user.id },
          select: { id: true },
        });
        if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      const result = await db.task.updateMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id },
        data: { project_id: input.project_id, parent_id: null },
      });
      return { ok: true, count: result.count };
    }),

  bulkAddContext: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string().uuid()).min(1),
        context_id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership of context AND every task ID.
      const ctxRow = await db.context.findFirst({
        where: { id: input.context_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!ctxRow) throw new TRPCError({ code: "NOT_FOUND", message: "Context not found" });
      const ownedTasks = await db.task.findMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id },
        select: { id: true },
      });
      if (ownedTasks.length !== input.ids.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unknown task id" });
      }
      await db.contextOnTask.createMany({
        data: ownedTasks.map((t) => ({
          task_id: t.id,
          context_id: input.context_id,
        })),
        skipDuplicates: true,
      });
      return { ok: true, count: ownedTasks.length };
    }),

  bulkAddTag: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string().uuid()).min(1),
        tag_id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await db.tag.findFirst({
        where: { id: input.tag_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
      const ownedTasks = await db.task.findMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id },
        select: { id: true },
      });
      if (ownedTasks.length !== input.ids.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unknown task id" });
      }
      const ownedIds = ownedTasks.map((t) => t.id);
      const existing = await db.tagOnTask.findMany({
        where: { tag_id: input.tag_id, task_id: { in: ownedIds } },
        select: { task_id: true },
      });
      const skipIds = new Set(existing.map((e) => e.task_id));
      const toAdd = ownedIds.filter((id) => !skipIds.has(id));
      if (toAdd.length === 0) return { ok: true, count: 0 };
      await db.$transaction([
        db.tagOnTask.createMany({
          data: toAdd.map((task_id) => ({ task_id, tag_id: input.tag_id })),
          skipDuplicates: true,
        }),
        db.tag.update({
          where: { id: input.tag_id },
          data: { usage_count: { increment: toAdd.length } },
        }),
      ]);
      return { ok: true, count: toAdd.length };
    }),

  // ── Audit Activity for the task ───────────────────────────────────────
  activity: protectedProcedure
    .input(z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const events = await db.auditLog.findMany({
        where: {
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: input.id,
        },
        orderBy: { created_at: "desc" },
        take: input.limit,
      });
      return events;
    }),

  // ── Completed perspective ─────────────────────────────────────────────
  completed: protectedProcedure
    .input(
      z.object({
        date_range: z.enum(["today", "week", "month", "year", "all", "custom"]).default("week"),
        from_date: z.coerce.date().optional(),
        to_date: z.coerce.date().optional(),
        project_id: z.string().uuid().nullable().optional(),
        sort: z.enum(["completed_at", "title", "due_date"]).default("completed_at"),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const now = new Date();

      let since: Date | null = null;
      let until: Date | null = null;
      if (input.date_range === "today") {
        since = new Date(now);
        since.setHours(0, 0, 0, 0);
      } else if (input.date_range === "week") {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (input.date_range === "month") {
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (input.date_range === "year") {
        since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      } else if (input.date_range === "custom") {
        since = input.from_date ?? null;
        if (input.to_date) {
          until = new Date(input.to_date);
          until.setHours(23, 59, 59, 999);
        }
      }

      const where: Prisma.TaskWhereInput = {
        user_id: userId,
        status: "completed",
        deleted_at: null,
        completed_at: { not: null },
      };

      if (since && until) {
        where.completed_at = { gte: since, lte: until };
      } else if (since) {
        where.completed_at = { gte: since };
      } else if (until) {
        where.completed_at = { lte: until };
      }

      if (input.project_id !== undefined) {
        where.project_id = input.project_id;
      }

      const orderBy: Prisma.TaskOrderByWithRelationInput[] = [];
      if (input.sort === "completed_at") {
        orderBy.push({ completed_at: "desc" });
      } else if (input.sort === "title") {
        orderBy.push({ title: "asc" });
      } else if (input.sort === "due_date") {
        orderBy.push({ due_date: { sort: "asc", nulls: "last" } });
      }

      const tasks = await db.task.findMany({
        where,
        orderBy,
        include: TASK_INCLUDE,
        take: input.limit,
      });

      return tasks;
    }),

  bulkUncomplete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.task.updateMany({
        where: {
          id: { in: input.ids },
          user_id: ctx.user.id,
          status: "completed",
        },
        data: { status: "active", completed_at: null },
      });
      return { ok: true, count: result.count };
    }),

  completionStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, lastWeek, lastMonth] = await Promise.all([
      db.task.count({
        where: { user_id: userId, status: "completed", deleted_at: null },
      }),
      db.task.count({
        where: {
          user_id: userId,
          status: "completed",
          deleted_at: null,
          completed_at: { gte: weekAgo },
        },
      }),
      db.task.count({
        where: {
          user_id: userId,
          status: "completed",
          deleted_at: null,
          completed_at: { gte: monthAgo },
        },
      }),
    ]);

    return { total, last_week: lastWeek, last_month: lastMonth };
  }),

  // ── Hierarchy audit ───────────────────────────────────────────────────
  // Detects structural inconsistencies in the task/project/folder hierarchy
  // and returns grouped information so the UI can offer targeted remediation.
  //
  // Note: the Task schema has no folder_id field, so "tasks directly in a
  // folder" is schema-impossible. The relevant real-world violations are:
  //   1. Tasks whose project was soft-deleted (become invisible orphans).
  //   2. Subtasks whose parent task was soft-deleted (become invisible orphans).
  // Both are grouped by their associated folder (via the deleted project) so the
  // UI can offer "Create a default project per folder" as a remediation choice.
  auditHierarchy: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Tasks whose project was soft-deleted — include the project's folder_id
    // so we can group by folder for the "create default project per folder" remedy.
    const orphanedTasks = await db.task.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        project_id: { not: null },
        project: { deleted_at: { not: null } },
      },
      select: {
        id: true,
        title: true,
        project_id: true,
        project: {
          select: {
            id: true,
            title: true,
            folder_id: true,
            folder: { select: { id: true, name: true } },
          },
        },
      },
      take: 200,
    });

    // Subtasks whose parent task was deleted.
    const subtasksWithoutParent = await db.task.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        parent_id: { not: null },
        parent: { deleted_at: { not: null } },
      },
      select: { id: true, title: true, parent_id: true },
      take: 100,
    });

    // Build folder-grouped view for the orphaned tasks so the UI can show
    // "Create default project per folder" (or "no folder" for inbox-level tasks).
    type FolderGroup = {
      folderId: string | null;
      folderName: string | null;
      taskIds: string[];
      taskTitles: string[];
    };
    const byFolder = new Map<string | null, FolderGroup>();
    for (const t of orphanedTasks) {
      const key = t.project?.folder_id ?? null;
      if (!byFolder.has(key)) {
        byFolder.set(key, {
          folderId: key,
          folderName: t.project?.folder?.name ?? null,
          taskIds: [],
          taskTitles: [],
        });
      }
      const g = byFolder.get(key)!;
      g.taskIds.push(t.id);
      g.taskTitles.push(t.title);
    }

    return {
      orphanedTasks: orphanedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        project_id: t.project_id,
        folder_id: t.project?.folder_id ?? null,
        folder_name: t.project?.folder?.name ?? null,
      })),
      orphanedByFolder: [...byFolder.values()],
      subtasksWithoutParent: subtasksWithoutParent.map((t) => ({
        id: t.id,
        title: t.title,
        parent_id: t.parent_id,
      })),
      totalIssues: orphanedTasks.length + subtasksWithoutParent.length,
    };
  }),

  // ── Fix hierarchy issues ──────────────────────────────────────────────
  // Provides two remediation modes for orphaned tasks:
  //   moveToInbox  – clears project_id/parent_id, tasks appear in inbox.
  //   createDefaultProjects – creates one recovery project per folder group
  //                           and assigns orphaned tasks to it.
  fixHierarchyIssues: protectedProcedure
    .input(
      z.object({
        // "Move to inbox" path: clear project/parent references on orphans.
        moveToInbox: z.boolean().default(false),
        // "Create default project per folder" path: create a recovery project
        // inside each folder that had orphaned tasks, then reassign tasks.
        createDefaultProjects: z.boolean().default(false),
        // Always fix subtasks with deleted parents (move to inbox as top-level tasks).
        fixSubtasksWithoutParent: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      let fixed = 0;

      if (input.moveToInbox) {
        const result = await db.task.updateMany({
          where: {
            user_id: userId,
            deleted_at: null,
            project_id: { not: null },
            project: { deleted_at: { not: null } },
          },
          data: { project_id: null },
        });
        fixed += result.count;
      } else if (input.createDefaultProjects) {
        // Fetch orphaned tasks with their project/folder context.
        const orphaned = await db.task.findMany({
          where: {
            user_id: userId,
            deleted_at: null,
            project_id: { not: null },
            project: { deleted_at: { not: null } },
          },
          select: {
            id: true,
            project: {
              select: { folder_id: true, folder: { select: { id: true, name: true } } },
            },
          },
        });

        // Group by folder.
        const byFolder = new Map<string | null, { folderId: string | null; folderName: string | null; taskIds: string[] }>();
        for (const t of orphaned) {
          const key = t.project?.folder_id ?? null;
          if (!byFolder.has(key)) {
            byFolder.set(key, {
              folderId: key,
              folderName: t.project?.folder?.name ?? null,
              taskIds: [],
            });
          }
          byFolder.get(key)!.taskIds.push(t.id);
        }

        // For each folder group, find-or-create a recovery project.
        const maxAgg = await db.project.aggregate({
          _max: { position: true },
          where: { user_id: userId, deleted_at: null },
        });
        let nextPos = maxAgg._max.position
          ? new Prisma.Decimal(maxAgg._max.position).plus(1024)
          : new Prisma.Decimal(1024);

        for (const group of byFolder.values()) {
          const recoveryTitle = group.folderName
            ? `${group.folderName} — Recovered`
            : "Recovered Tasks";

          // Check if a recovery project by this name already exists in the folder.
          const existing = await db.project.findFirst({
            where: {
              user_id: userId,
              title: recoveryTitle,
              folder_id: group.folderId,
              deleted_at: null,
            },
            select: { id: true },
          });

          let recoveryProjectId: string;
          if (existing) {
            recoveryProjectId = existing.id;
          } else {
            const created = await db.project.create({
              data: {
                id: newId(),
                user_id: userId,
                title: recoveryTitle,
                folder_id: group.folderId,
                position: nextPos,
              },
            });
            recoveryProjectId = created.id;
            nextPos = nextPos.plus(1024);
          }

          // Reassign tasks to the recovery project.
          const result = await db.task.updateMany({
            where: { id: { in: group.taskIds }, user_id: userId },
            data: { project_id: recoveryProjectId },
          });
          fixed += result.count;
        }
      }

      if (input.fixSubtasksWithoutParent) {
        const result = await db.task.updateMany({
          where: {
            user_id: userId,
            deleted_at: null,
            parent_id: { not: null },
            parent: { deleted_at: { not: null } },
          },
          data: { parent_id: null },
        });
        fixed += result.count;
      }

      return { ok: true, fixed };
    }),
});
