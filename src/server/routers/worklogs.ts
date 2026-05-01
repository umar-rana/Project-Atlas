import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { renderAuditEntry } from "@/core/audit/render";

export const worklogsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        task_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await db.taskWorkLog.findMany({
        where: {
          task_id: input.task_id,
          user_id: ctx.user.id,
          deleted_at: null,
        },
        orderBy: { created_at: "desc" },
        take: input.limit,
        ...(input.cursor
          ? {
              cursor: { id: input.cursor },
              skip: 1,
            }
          : {}),
      });
      return items;
    }),

  create: protectedProcedure
    .input(
      z.object({
        task_id: z.string().uuid(),
        body: z.string().min(1).max(10_000),
        duration_minutes: z.number().int().min(1).max(60 * 24 * 7).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.task_id, user_id: ctx.user.id },
        select: { id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const entry = await db.taskWorkLog.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          task_id: input.task_id,
          body: input.body,
          duration_minutes: input.duration_minutes ?? null,
        },
      });
      return entry;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        body: z.string().min(1).max(10_000).optional(),
        duration_minutes: z.number().int().min(1).max(60 * 24 * 7).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.taskWorkLog.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updated = await db.taskWorkLog.update({
        where: { id: input.id },
        data: {
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.duration_minutes !== undefined
            ? { duration_minutes: input.duration_minutes }
            : {}),
        },
      });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.taskWorkLog.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.taskWorkLog.update({
        where: { id: input.id },
        data: { deleted_at: new Date() },
      });
      return { ok: true };
    }),

  feed: protectedProcedure
    .input(
      z.object({
        task_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [auditLogs, workLogs] = await Promise.all([
        db.auditLog.findMany({
          where: {
            user_id: ctx.user.id,
            entity_type: "Task",
            entity_id: input.task_id,
          },
          orderBy: { created_at: "desc" },
          take: input.limit,
        }),
        db.taskWorkLog.findMany({
          where: {
            task_id: input.task_id,
            user_id: ctx.user.id,
            deleted_at: null,
          },
          orderBy: { created_at: "desc" },
          take: input.limit,
        }),
      ]);

      type FeedItem =
        | {
            type: "audit";
            id: string;
            created_at: Date;
            sentence: string;
          }
        | {
            type: "worklog";
            id: string;
            created_at: Date;
            body: string;
            duration_minutes: number | null;
          };

      const userLocale = {
        date_format: ctx.user.date_format ?? "DD/MM/YYYY",
        time_format: (ctx.user.time_format as "12h" | "24h") ?? "12h",
        number_format: ctx.user.number_format ?? "1,234.56",
        currency_code: ctx.user.currency_code ?? "PKR",
        currency_symbol: ctx.user.currency_symbol ?? "₨",
        language: ctx.user.language ?? "en",
      };

      const auditItems: FeedItem[] = auditLogs.map((entry) => ({
        type: "audit" as const,
        id: entry.id,
        created_at: entry.created_at,
        sentence: renderAuditEntry(entry, userLocale),
      }));

      const worklogItems: FeedItem[] = workLogs.map((entry) => ({
        type: "worklog" as const,
        id: entry.id,
        created_at: entry.created_at,
        body: entry.body,
        duration_minutes: entry.duration_minutes,
      }));

      const merged = [...auditItems, ...worklogItems].sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime(),
      );

      return merged;
    }),
});
