import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUnique({ where: { id: ctx.user.id } });
    if (!user) throw new Error("User not found");
    return user;
  }),

  updatePreferences: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        timezone: z.string().optional(),
        date_format: z.string().optional(),
        time_format: z.enum(["12h", "24h"]).optional(),
        week_start: z.enum(["sunday", "monday"]).optional(),
        theme: z.enum(["dark", "light", "system"]).optional(),
        tasks_default_review_interval_days: z.number().int().min(1).max(365).nullable().optional(),
        tasks_default_forecast_days: z.enum(["7", "14"]).optional(),
        tasks_default_sequential: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tasks_default_review_interval_days, tasks_default_forecast_days, tasks_default_sequential, ...coreFields } = input;

      const tasksPrefsUpdate: Record<string, unknown> = {};
      if (tasks_default_review_interval_days !== undefined) tasksPrefsUpdate.default_review_interval_days = tasks_default_review_interval_days;
      if (tasks_default_forecast_days !== undefined) tasksPrefsUpdate.default_forecast_days = parseInt(tasks_default_forecast_days, 10);
      if (tasks_default_sequential !== undefined) tasksPrefsUpdate.default_sequential = tasks_default_sequential;

      const hasTasksPrefs = Object.keys(tasksPrefsUpdate).length > 0;

      if (hasTasksPrefs) {
        const existing = await db.user.findUnique({ where: { id: ctx.user.id } });
        const currentPrefs = (typeof existing?.tasks_prefs === "object" && existing?.tasks_prefs !== null
          ? existing.tasks_prefs
          : {}) as Record<string, unknown>;
        const updated = await db.user.update({
          where: { id: ctx.user.id },
          data: { ...coreFields, tasks_prefs: { ...currentPrefs, ...tasksPrefsUpdate } as Prisma.InputJsonValue },
        });
        return updated;
      }

      const updated = await db.user.update({
        where: { id: ctx.user.id },
        data: coreFields,
      });
      return updated;
    }),
});
