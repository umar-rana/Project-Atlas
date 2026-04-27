import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { logActivity } from "@/core/audit";

const PROJECT_STATUS = z.enum(["active", "on_hold", "completed", "dropped"]);

export const projectsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: PROJECT_STATUS.optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const projects = await db.project.findMany({
        where: {
          user_id: ctx.user.id,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
      });

      // Get task counts per project (active only).
      const counts = await db.task.groupBy({
        by: ["project_id"],
        where: {
          user_id: ctx.user.id,
          status: "active",
          project_id: { in: projects.map((p) => p.id) },
        },
        _count: { _all: true },
      });
      const countMap = new Map(counts.map((c) => [c.project_id, c._count._all]));

      return projects.map((p) => ({
        ...p,
        task_count: countMap.get(p.id) ?? 0,
      }));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const task_count = await db.task.count({
        where: { project_id: project.id, status: "active" },
      });
      return { ...project, task_count };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        notes: z.string().max(10_000).optional(),
        color: z.string().max(40).optional(),
        sequential: z.boolean().optional(),
        status: PROJECT_STATUS.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const max = await db.project.aggregate({
        _max: { position: true },
        where: { user_id: ctx.user.id },
      });
      const position = (max._max.position
        ? new Prisma.Decimal(max._max.position).plus(1024)
        : new Prisma.Decimal(1024)
      ).toString();

      const project = await db.project.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          title: input.title,
          notes: input.notes ?? null,
          color: input.color ?? null,
          sequential: input.sequential ?? false,
          status: input.status ?? "active",
          position: new Prisma.Decimal(position),
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: project.id,
        action: "create",
        meta: { title: project.title },
      });
      return project;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        notes: z.string().max(10_000).nullable().optional(),
        color: z.string().max(40).nullable().optional(),
        sequential: z.boolean().optional(),
        status: PROJECT_STATUS.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      const data: Prisma.ProjectUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.color !== undefined) data.color = input.color;
      if (input.sequential !== undefined) data.sequential = input.sequential;
      if (input.status !== undefined) {
        data.status = input.status;
        data.completed_at =
          input.status === "completed" ? new Date() : null;
      }

      const updated = await db.project.update({
        where: { id: input.id },
        data,
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: updated.id,
        action: input.status && input.status !== before.status ? "status_change" : "update",
        before: before as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        moveTasksToInbox: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      await db.$transaction(async (tx) => {
        if (input.moveTasksToInbox) {
          await tx.task.updateMany({
            where: { project_id: project.id, user_id: ctx.user.id },
            data: { project_id: null },
          });
        } else {
          await tx.task.updateMany({
            where: { project_id: project.id, user_id: ctx.user.id },
            data: { deleted_at: new Date() },
          });
        }
        await tx.project.update({
          where: { id: project.id },
          data: { deleted_at: new Date() },
        });
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Project",
        entity_id: project.id,
        action: "delete",
      });
      return { ok: true };
    }),

  markAllComplete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await db.task.updateMany({
        where: {
          project_id: project.id,
          user_id: ctx.user.id,
          status: "active",
        },
        data: { status: "completed", completed_at: new Date() },
      });
      return { ok: true, count: result.count };
    }),
});
