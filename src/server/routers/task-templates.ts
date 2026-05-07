import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "task-templates-router" });

function nextPosition(maxPos: Prisma.Decimal | null): string {
  const base = maxPos ? new Prisma.Decimal(maxPos) : new Prisma.Decimal(0);
  return base.plus(1024).toString();
}

const TemplateChecklistItemInput = z.object({
  title: z.string().min(1).max(500),
  position: z.string().optional(),
});

const TemplateCreateInput = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(50_000).optional().nullable(),
  default_project_id: z.string().uuid().optional().nullable(),
  estimated_minutes: z.number().int().min(0).max(60 * 24 * 30).optional().nullable(),
  flagged: z.boolean().optional(),
  recurrence_rule: z.string().optional().nullable(),
  context_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  checklist_items: z.array(TemplateChecklistItemInput).optional(),
});

const TemplateUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(50_000).optional().nullable(),
  default_project_id: z.string().uuid().optional().nullable(),
  estimated_minutes: z.number().int().min(0).max(60 * 24 * 30).optional().nullable(),
  flagged: z.boolean().optional(),
  recurrence_rule: z.string().optional().nullable(),
  context_ids: z.array(z.string().uuid()).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  checklist_items: z.array(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(500),
      position: z.string().optional(),
    }),
  ).optional(),
});

const TEMPLATE_INCLUDE = {
  default_project: { select: { id: true, title: true, color: true } },
  checklist_items: { orderBy: { position: "asc" as const } },
  contexts: { include: { context: { select: { id: true, name: true } } } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.TaskTemplateInclude;

export const taskTemplatesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(200),
        topN: z.number().int().min(1).max(50).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return db.taskTemplate.findMany({
        where: { user_id: ctx.user.id, deleted_at: null },
        orderBy: [{ usage_count: "desc" }, { name: "asc" }],
        take: input.topN ?? input.limit,
        include: TEMPLATE_INCLUDE,
      });
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const template = await db.taskTemplate.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        include: TEMPLATE_INCLUDE,
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),

  create: protectedProcedure
    .input(TemplateCreateInput)
    .mutation(async ({ ctx, input }) => {
      const id = newId();
      const userId = ctx.user.id;

      if (input.default_project_id) {
        const owns = await db.project.findFirst({
          where: { id: input.default_project_id, user_id: userId },
          select: { id: true },
        });
        if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
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

      const template = await db.taskTemplate.create({
        data: {
          id,
          user_id: userId,
          name: input.name,
          notes: input.notes ?? null,
          default_project_id: input.default_project_id ?? null,
          estimated_minutes: input.estimated_minutes ?? null,
          flagged: input.flagged ?? false,
          recurrence_rule: input.recurrence_rule ?? null,
          contexts: input.context_ids?.length
            ? { create: input.context_ids.map((cid) => ({ context_id: cid })) }
            : undefined,
          tags: input.tag_ids?.length
            ? { create: input.tag_ids.map((tid) => ({ tag_id: tid })) }
            : undefined,
          checklist_items: input.checklist_items?.length
            ? {
                create: input.checklist_items.map((item, idx) => ({
                  id: newId(),
                  title: item.title,
                  position: new Prisma.Decimal(item.position ?? (idx + 1) * 1024),
                })),
              }
            : undefined,
        },
        include: TEMPLATE_INCLUDE,
      });

      await logActivity({
        user_id: userId,
        entity_type: "TaskTemplate",
        entity_id: id,
        action: "task_template_created",
        meta: { name: input.name },
      });

      log.info({ user_id: userId, template_id: id }, "Task template created");
      return template;
    }),

  update: protectedProcedure
    .input(TemplateUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, checklist_items, context_ids, tag_ids, ...rest } = input;
      const userId = ctx.user.id;

      const existing = await db.taskTemplate.findFirst({
        where: { id, user_id: userId, deleted_at: null },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      if (rest.default_project_id) {
        const owns = await db.project.findFirst({
          where: { id: rest.default_project_id, user_id: userId },
          select: { id: true },
        });
        if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      if (context_ids?.length) {
        const owned = await db.context.findMany({
          where: { id: { in: context_ids }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== context_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown context id" });
        }
      }

      if (tag_ids?.length) {
        const owned = await db.tag.findMany({
          where: { id: { in: tag_ids }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== tag_ids.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown tag id" });
        }
      }

      const updateData: Prisma.TaskTemplateUncheckedUpdateInput = {};
      if (rest.name !== undefined) updateData.name = rest.name;
      if ("notes" in rest) updateData.notes = rest.notes;
      if ("default_project_id" in rest) updateData.default_project_id = rest.default_project_id;
      if ("estimated_minutes" in rest) updateData.estimated_minutes = rest.estimated_minutes;
      if (rest.flagged !== undefined) updateData.flagged = rest.flagged;
      if ("recurrence_rule" in rest) updateData.recurrence_rule = rest.recurrence_rule;

      await db.$transaction(async (tx) => {
        await tx.taskTemplate.update({ where: { id }, data: updateData });

        if (context_ids !== undefined) {
          await tx.contextOnTaskTemplate.deleteMany({ where: { template_id: id } });
          if (context_ids.length > 0) {
            await tx.contextOnTaskTemplate.createMany({
              data: context_ids.map((cid) => ({ template_id: id, context_id: cid })),
            });
          }
        }

        if (tag_ids !== undefined) {
          await tx.tagOnTaskTemplate.deleteMany({ where: { template_id: id } });
          if (tag_ids.length > 0) {
            await tx.tagOnTaskTemplate.createMany({
              data: tag_ids.map((tid) => ({ template_id: id, tag_id: tid })),
            });
          }
        }

        if (checklist_items !== undefined) {
          await tx.taskTemplateChecklistItem.deleteMany({ where: { template_id: id } });
          if (checklist_items.length > 0) {
            await tx.taskTemplateChecklistItem.createMany({
              data: checklist_items.map((item, idx) => ({
                id: newId(),
                template_id: id,
                title: item.title,
                position: new Prisma.Decimal(item.position ?? (idx + 1) * 1024),
              })),
            });
          }
        }
      });

      log.info({ user_id: userId, template_id: id }, "Task template updated");
      return db.taskTemplate.findFirst({
        where: { id },
        include: TEMPLATE_INCLUDE,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const existing = await db.taskTemplate.findFirst({
        where: { id: input.id, user_id: userId, deleted_at: null },
        select: { id: true, name: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.taskTemplate.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });

      await logActivity({
        user_id: userId,
        entity_type: "TaskTemplate",
        entity_id: input.id,
        action: "task_template_deleted",
        meta: { name: existing.name },
      });

      log.info({ user_id: userId, template_id: input.id }, "Task template soft-deleted");
      return { id: input.id };
    }),

  instantiate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        overrides: z.object({
          title: z.string().min(1).max(500).optional(),
          notes: z.string().max(50_000).optional().nullable(),
          project_id: z.string().uuid().optional().nullable(),
          flagged: z.boolean().optional(),
          due_date: z.coerce.date().optional().nullable(),
          defer_date: z.coerce.date().optional().nullable(),
          estimated_minutes: z.number().int().min(0).optional().nullable(),
          context_ids: z.array(z.string().uuid()).optional(),
          tag_ids: z.array(z.string().uuid()).optional(),
        }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const template = await db.taskTemplate.findFirst({
        where: { id: input.id, user_id: userId, deleted_at: null },
        include: {
          checklist_items: { orderBy: { position: "asc" } },
          contexts: true,
          tags: true,
        },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      const overrides = input.overrides ?? {};

      const projectId = "project_id" in overrides
        ? overrides.project_id
        : template.default_project_id;

      if (projectId) {
        const owns = await db.project.findFirst({
          where: { id: projectId, user_id: userId },
          select: { id: true },
        });
        if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const contextIds = overrides.context_ids ?? template.contexts.map((c) => c.context_id);
      const tagIds = overrides.tag_ids ?? template.tags.map((t) => t.tag_id);

      if (contextIds.length) {
        const owned = await db.context.findMany({
          where: { id: { in: contextIds }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== contextIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown context id" });
        }
      }

      if (tagIds.length) {
        const owned = await db.tag.findMany({
          where: { id: { in: tagIds }, user_id: userId },
          select: { id: true },
        });
        if (owned.length !== tagIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Unknown tag id" });
        }
      }

      const maxAgg = await db.task.aggregate({
        _max: { position: true },
        where: { user_id: userId, project_id: projectId ?? null, parent_id: null, deleted_at: null },
      });
      const position = nextPosition(maxAgg._max.position);

      const taskId = newId();

      const task = await db.$transaction(async (tx) => {
        const newTask = await tx.task.create({
          data: {
            id: taskId,
            user_id: userId,
            title: overrides.title ?? template.name,
            notes: "notes" in overrides ? overrides.notes : template.notes,
            project_id: projectId ?? null,
            flagged: overrides.flagged ?? template.flagged,
            due_date: "due_date" in overrides ? overrides.due_date : null,
            defer_date: "defer_date" in overrides ? overrides.defer_date : null,
            estimated_minutes: "estimated_minutes" in overrides
              ? overrides.estimated_minutes
              : template.estimated_minutes,
            recurrence_rule: template.recurrence_rule ?? null,
            position: new Prisma.Decimal(position),
            contexts: contextIds.length
              ? { create: contextIds.map((cid) => ({ context_id: cid })) }
              : undefined,
            tags: tagIds.length
              ? { create: tagIds.map((tid) => ({ tag_id: tid })) }
              : undefined,
          },
        });

        if (template.checklist_items.length > 0) {
          await tx.checklistItem.createMany({
            data: template.checklist_items.map((item) => ({
              id: newId(),
              user_id: userId,
              task_id: newTask.id,
              title: item.title,
              position: item.position,
            })),
          });
        }

        await tx.taskTemplate.update({
          where: { id: template.id },
          data: {
            usage_count: { increment: 1 },
            last_used_at: new Date(),
          },
        });

        return newTask;
      });

      await logActivity({
        user_id: userId,
        entity_type: "TaskTemplate",
        entity_id: template.id,
        action: "task_template_used",
        meta: { template_name: template.name, task_id: taskId },
      });

      log.info({ user_id: userId, template_id: template.id, task_id: taskId }, "Task template instantiated");
      return task;
    }),
});
