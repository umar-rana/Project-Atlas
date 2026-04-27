import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";

export const tagsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).default(100),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      return db.tag.findMany({
        where: { user_id: ctx.user.id },
        orderBy: [{ usage_count: "desc" }, { name: "asc" }],
        take: input.limit,
      });
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().int().min(1).max(50).default(15) }))
    .query(async ({ ctx, input }) => {
      const q = input.query.toLowerCase().trim();
      if (!q) {
        return db.tag.findMany({
          where: { user_id: ctx.user.id },
          orderBy: [{ usage_count: "desc" }, { name: "asc" }],
          take: input.limit,
        });
      }
      return db.tag.findMany({
        where: {
          user_id: ctx.user.id,
          name: { contains: q, mode: "insensitive" },
        },
        orderBy: [{ usage_count: "desc" }, { name: "asc" }],
        take: input.limit,
      });
    }),

  getByName: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const tag = await db.tag.findFirst({
        where: { user_id: ctx.user.id, name: input.name.toLowerCase() },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND" });
      return tag;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        color: z.string().max(40).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const lower = input.name.toLowerCase();
      try {
        return await db.tag.create({
          data: {
            id: newId(),
            user_id: ctx.user.id,
            name: lower,
            color: input.color ?? null,
            usage_count: 0,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const existing = await db.tag.findFirst({
            where: { user_id: ctx.user.id, name: lower },
          });
          if (existing) return existing;
        }
        throw err;
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        color: z.string().max(40).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.tag.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const data: Prisma.TagUpdateInput = {};
      if (input.name !== undefined) data.name = input.name.toLowerCase();
      if (input.color !== undefined) data.color = input.color;
      return db.tag.update({ where: { id: input.id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.tag.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db.$transaction([
        db.tagOnTask.deleteMany({ where: { tag_id: input.id } }),
        db.tag.update({
          where: { id: input.id },
          data: { deleted_at: new Date() },
        }),
      ]);
      return { ok: true };
    }),
});
