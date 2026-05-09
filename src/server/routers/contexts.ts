import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure, userOwned, userOwnedActive } from "@/server/trpc";
import { db, newId } from "@/core/db";

export const contextsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const contexts = await db.context.findMany({
      where: userOwnedActive(ctx.user),
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    const counts = await db.contextOnTask.groupBy({
      by: ["context_id"],
      where: { context: userOwnedActive(ctx.user) },
      _count: { _all: true },
    });
    const map = new Map(counts.map((c) => [c.context_id, c._count._all]));
    return contexts.map((c) => ({ ...c, task_count: map.get(c.id) ?? 0 }));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const c = await db.context.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      return c;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        icon: z.string().max(40).optional(),
        color: z.string().max(40).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const max = await db.context.aggregate({
        _max: { position: true },
        where: userOwned(ctx.user),
      });
      const position = (
        max._max.position
          ? new Prisma.Decimal(max._max.position).plus(1024)
          : new Prisma.Decimal(1024)
      ).toString();
      try {
        const c = await db.context.create({
          data: {
            id: newId(),
            user_id: ctx.user.id,
            name: input.name,
            icon: input.icon ?? null,
            color: input.color ?? null,
            position: new Prisma.Decimal(position),
          },
        });
        return c;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A context with that name already exists",
          });
        }
        throw err;
      }
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string().uuid(), new_name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.context.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      // Conflict check intentionally uses userOwned (no deleted_at filter):
      // Context has @@unique([user_id, name]) which covers soft-deleted rows
      // too, so excluding trashed contexts here would let the rename appear
      // valid then fail downstream with P2002.
      const conflict = await db.context.findFirst({
        where: userOwned(ctx.user, { name: input.new_name, id: { not: input.id } }),
      });
      if (conflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A context with that name already exists",
        });
      }
      return db.context.update({ where: { id: input.id }, data: { name: input.new_name } });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        icon: z.string().max(40).nullable().optional(),
        color: z.string().max(40).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.context.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const data: Prisma.ContextUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.icon !== undefined) data.icon = input.icon;
      if (input.color !== undefined) data.color = input.color;
      return db.context.update({ where: { id: input.id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // userOwnedActive: deleting an already-soft-deleted context returns 404
      // (no-op), which is the correct idempotent behaviour.
      const before = await db.context.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db.$transaction([
        db.contextOnTask.deleteMany({ where: { context_id: input.id } }),
        db.context.update({
          where: { id: input.id },
          data: { deleted_at: new Date() },
        }),
      ]);
      return { ok: true };
    }),
});
