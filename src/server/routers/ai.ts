import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

function utcStartOfDayInTz(tz: string, now: Date): Date {
  const zoned = toZonedTime(now, tz);
  const zonedMidnight = startOfDay(zoned);
  return fromZonedTime(zonedMidnight, tz);
}

function utcStartOfWeekInTz(tz: string, now: Date, weekStart: "sunday" | "monday"): Date {
  const weekStartsOn = weekStart === "monday" ? 1 : 0;
  const zoned = toZonedTime(now, tz);
  const zonedWeekStart = startOfWeek(zoned, { weekStartsOn });
  const zonedMidnight = startOfDay(zonedWeekStart);
  return fromZonedTime(zonedMidnight, tz);
}

export const aiRouter = router({
  usageStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const timezone = ctx.user.timezone ?? "UTC";
    const weekStart = (ctx.user.week_start ?? "sunday") as "sunday" | "monday";
    const now = new Date();

    const startOfDayUtc = utcStartOfDayInTz(timezone, now);
    const startOfWeekUtc = utcStartOfWeekInTz(timezone, now, weekStart);
    const startOfMonthUtc = (() => {
      const zoned = toZonedTime(now, timezone);
      const zonedMonthStart = startOfMonth(zoned);
      return fromZonedTime(startOfDay(zonedMonthStart), timezone);
    })();

    const [allTime, daily, weekly, monthly, byTask, failureCount, recentErrors] = await Promise.all(
      [
        db.aICallLog.aggregate({
          where: { user_id: userId },
          _count: { id: true },
          _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
        }),
        db.aICallLog.aggregate({
          where: { user_id: userId, created_at: { gte: startOfDayUtc } },
          _count: { id: true },
          _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
        }),
        db.aICallLog.aggregate({
          where: { user_id: userId, created_at: { gte: startOfWeekUtc } },
          _count: { id: true },
          _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
        }),
        db.aICallLog.aggregate({
          where: { user_id: userId, created_at: { gte: startOfMonthUtc } },
          _count: { id: true },
          _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
        }),
        db.aICallLog.groupBy({
          by: ["task"],
          where: { user_id: userId },
          _count: { id: true },
          _sum: { input_tokens: true, output_tokens: true, cost_usd: true },
          orderBy: { _sum: { cost_usd: "desc" } },
        }),
        db.aICallLog.count({
          where: { user_id: userId, success: false },
        }),
        db.aICallLog.findMany({
          where: { user_id: userId, success: false },
          orderBy: { created_at: "desc" },
          take: 5,
          select: { id: true, task: true, error: true, created_at: true },
        }),
      ],
    );

    return {
      budgetUsd: ctx.user.ai_budget_usd ?? null,
      allTime: {
        calls: allTime._count.id,
        inputTokens: allTime._sum.input_tokens ?? 0,
        outputTokens: allTime._sum.output_tokens ?? 0,
        costUsd: allTime._sum.cost_usd ?? 0,
      },
      daily: {
        calls: daily._count.id,
        inputTokens: daily._sum.input_tokens ?? 0,
        outputTokens: daily._sum.output_tokens ?? 0,
        costUsd: daily._sum.cost_usd ?? 0,
      },
      weekly: {
        calls: weekly._count.id,
        inputTokens: weekly._sum.input_tokens ?? 0,
        outputTokens: weekly._sum.output_tokens ?? 0,
        costUsd: weekly._sum.cost_usd ?? 0,
      },
      monthly: {
        calls: monthly._count.id,
        inputTokens: monthly._sum.input_tokens ?? 0,
        outputTokens: monthly._sum.output_tokens ?? 0,
        costUsd: monthly._sum.cost_usd ?? 0,
      },
      byTask: byTask.map((t) => ({
        task: t.task,
        calls: t._count.id,
        inputTokens: t._sum.input_tokens ?? 0,
        outputTokens: t._sum.output_tokens ?? 0,
        costUsd: t._sum.cost_usd ?? 0,
      })),
      failureCount,
      recentErrors: recentErrors.map((e) => ({
        id: e.id,
        task: e.task,
        error: e.error ?? "Unknown error",
        createdAt: e.created_at.toISOString(),
      })),
    };
  }),
});
