import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { analyseCleanupCandidates } from "@/core/tags/cleanup";

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
        where: { user_id: ctx.user.id, deleted_at: null },
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
          where: { user_id: ctx.user.id, deleted_at: null },
          orderBy: [{ usage_count: "desc" }, { name: "asc" }],
          take: input.limit,
        });
      }
      return db.tag.findMany({
        where: {
          user_id: ctx.user.id,
          deleted_at: null,
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

  rename: protectedProcedure
    .input(z.object({ id: z.string().uuid(), new_name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const before = await db.tag.findFirst({
        where: { id: input.id, user_id: ctx.user.id },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const lower = input.new_name.toLowerCase().trim();
      const conflict = await db.tag.findFirst({
        where: { user_id: ctx.user.id, name: lower, id: { not: input.id } },
      });
      if (conflict) {
        throw new TRPCError({ code: "CONFLICT", message: "A tag with that name already exists" });
      }
      return db.tag.update({ where: { id: input.id }, data: { name: lower } });
    }),

  merge: protectedProcedure
    .input(z.object({ from_id: z.string().uuid(), into_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.from_id === input.into_id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a tag into itself" });
      }
      const [fromTag, intoTag] = await Promise.all([
        db.tag.findFirst({ where: { id: input.from_id, user_id: ctx.user.id } }),
        db.tag.findFirst({ where: { id: input.into_id, user_id: ctx.user.id } }),
      ]);
      if (!fromTag || !intoTag) throw new TRPCError({ code: "NOT_FOUND" });

      const fromAssociations = await db.tagOnTask.findMany({
        where: { tag_id: input.from_id },
        select: { task_id: true },
      });

      const existingInto = await db.tagOnTask.findMany({
        where: { tag_id: input.into_id },
        select: { task_id: true },
      });
      const existingIntoSet = new Set(existingInto.map((r) => r.task_id));

      const toCreate = fromAssociations.filter((r) => !existingIntoSet.has(r.task_id));

      await db.$transaction([
        ...toCreate.map((r) =>
          db.tagOnTask.create({ data: { task_id: r.task_id, tag_id: input.into_id } }),
        ),
        db.tagOnTask.deleteMany({ where: { tag_id: input.from_id } }),
        db.tag.update({
          where: { id: input.into_id },
          data: { usage_count: { increment: toCreate.length } },
        }),
        db.tag.update({
          where: { id: input.from_id },
          data: { deleted_at: new Date() },
        }),
      ]);

      return { ok: true };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tags = await db.tag.findMany({
        where: { id: { in: input.ids }, user_id: ctx.user.id },
        select: { id: true },
      });
      const validIds = tags.map((t) => t.id);
      if (validIds.length === 0) return { ok: true, deleted: 0 };

      await db.$transaction([
        db.tagOnTask.deleteMany({ where: { tag_id: { in: validIds } } }),
        db.tag.updateMany({
          where: { id: { in: validIds } },
          data: { deleted_at: new Date() },
        }),
      ]);

      return { ok: true, deleted: validIds.length };
    }),

  usageStats: protectedProcedure.query(async ({ ctx }) => {
    const tags = await db.tag.findMany({
      where: { user_id: ctx.user.id, deleted_at: null },
      orderBy: [{ usage_count: "desc" }, { name: "asc" }],
      take: 500,
    });

    const latestUse = await db.tagOnTask.groupBy({
      by: ["tag_id"],
      where: { tag: { user_id: ctx.user.id, deleted_at: null } },
      _max: { created_at: true },
    });

    const latestMap = new Map(latestUse.map((r) => [r.tag_id, r._max.created_at]));

    return tags.map((t) => ({
      ...t,
      last_used_at: latestMap.get(t.id) ?? null,
    }));
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

  count: protectedProcedure.query(async ({ ctx }) => {
    const count = await db.tag.count({
      where: { user_id: ctx.user.id, deleted_at: null },
    });
    return { count };
  }),

  cleanupCandidates: protectedProcedure.query(async ({ ctx }) => {
    return analyseCleanupCandidates(ctx.user.id);
  }),
});
