import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";

function nextPosition(maxPos: Prisma.Decimal | null): string {
  const base = maxPos ? new Prisma.Decimal(maxPos) : new Prisma.Decimal(0);
  return base.plus(1024).toString();
}

export const checklistRouter = router({
  list: protectedProcedure
    .input(z.object({ task_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.task_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      return db.checklistItem.findMany({
        where: { task_id: input.task_id, deleted_at: null },
        orderBy: { position: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        task_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        position: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.task_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const maxAgg = await db.checklistItem.aggregate({
        _max: { position: true },
        where: { task_id: input.task_id, deleted_at: null },
      });
      const position = input.position ?? nextPosition(maxAgg._max.position);

      return db.checklistItem.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          task_id: input.task_id,
          title: input.title,
          position: new Prisma.Decimal(position),
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        completed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.checklistItem.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const data: Prisma.ChecklistItemUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.completed !== undefined) {
        data.completed_at = input.completed ? new Date() : null;
      }

      return db.checklistItem.update({ where: { id: input.id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.checklistItem.updateMany({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
        data: { deleted_at: new Date() },
      });
      if (result.count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),

  reorder: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        before_id: z.string().uuid().nullable().optional(),
        after_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.checklistItem.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const beforeRow = input.before_id
        ? await db.checklistItem.findFirst({ where: { id: input.before_id, user_id: ctx.user.id } })
        : null;
      const afterRow = input.after_id
        ? await db.checklistItem.findFirst({ where: { id: input.after_id, user_id: ctx.user.id } })
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

      await db.checklistItem.update({
        where: { id: input.id },
        data: { position: newPos },
      });

      return { ok: true };
    }),

  migrateSubtasksToChecklist: protectedProcedure
    .input(z.object({ parent_task_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const simpleSubs = await db.task.findMany({
        where: {
          parent_id: input.parent_task_id,
          user_id: userId,
          deleted_at: null,
          due_date: null,
          defer_date: null,
          flagged: false,
          notes: null,
          contexts: { none: {} },
          tags: { none: {} },
        },
        orderBy: { position: "asc" },
        select: { id: true, title: true, status: true, position: true },
      });

      if (simpleSubs.length === 0) return { converted: 0 };

      await db.$transaction(async (tx) => {
        const now = new Date();
        for (const sub of simpleSubs) {
          await tx.checklistItem.create({
            data: {
              id: newId(),
              user_id: userId,
              task_id: input.parent_task_id,
              title: sub.title,
              completed_at: sub.status === "completed" ? now : null,
              position: sub.position,
            },
          });
          await tx.task.updateMany({
            where: { id: sub.id, user_id: userId },
            data: { deleted_at: now },
          });
        }
      });

      return { converted: simpleSubs.length };
    }),
});
