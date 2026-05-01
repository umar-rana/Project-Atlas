import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { logActivity } from "@/core/audit";
import { LOCALE_PRESETS, DATE_FORMAT_OPTIONS, NUMBER_FORMAT_OPTIONS } from "@/core/locale/presets";

const EMAIL_OR_DOMAIN_RE = /^([^\s@]+@[^\s@]+\.[^\s@]+|(@)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+)$/;

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
        email_filter_auto_replies: z.boolean().optional(),
        email_filter_calendar: z.boolean().optional(),
        email_blocklist: z.union([z.string(), z.array(z.string())]).optional(),
        ai_budget_usd: z.number().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        tasks_default_review_interval_days,
        tasks_default_forecast_days,
        tasks_default_sequential,
        email_filter_auto_replies,
        email_filter_calendar,
        email_blocklist,
        ...coreFields
      } = input;

      const tasksPrefsUpdate: Record<string, unknown> = {};
      if (tasks_default_review_interval_days !== undefined) tasksPrefsUpdate.default_review_interval_days = tasks_default_review_interval_days;
      if (tasks_default_forecast_days !== undefined) tasksPrefsUpdate.default_forecast_days = parseInt(tasks_default_forecast_days, 10);
      if (tasks_default_sequential !== undefined) tasksPrefsUpdate.default_sequential = tasks_default_sequential;
      if (email_filter_auto_replies !== undefined) tasksPrefsUpdate.email_filter_auto_replies = email_filter_auto_replies;
      if (email_filter_calendar !== undefined) tasksPrefsUpdate.email_filter_calendar = email_filter_calendar;
      if (email_blocklist !== undefined) {
        const raw = Array.isArray(email_blocklist)
          ? email_blocklist.map((s) => s.trim().toLowerCase()).filter(Boolean)
          : email_blocklist
              .split(/[\n,]/)
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);
        const invalid = raw.filter((s) => !EMAIL_OR_DOMAIN_RE.test(s));
        if (invalid.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid blocklist entries: ${invalid.join(", ")}`,
          });
        }
        const unique = [...new Set(raw)];
        tasksPrefsUpdate.email_blocklist = unique;
      }

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

  updateLocale: protectedProcedure
    .input(
      z.union([
        z.object({
          preset: z.enum(["pakistan", "us", "uk"]),
        }),
        z.object({
          preset: z.literal("custom"),
          date_format: z.enum(DATE_FORMAT_OPTIONS as [string, ...string[]]).optional(),
          time_format: z.enum(["12h", "24h"]).optional(),
          number_format: z.enum(
            NUMBER_FORMAT_OPTIONS.map((o) => o.value) as [string, ...string[]],
          ).optional(),
          currency_code: z.string().max(10).optional(),
          currency_symbol: z.string().max(5).optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      let data: Record<string, string>;

      if (input.preset !== "custom") {
        const preset = LOCALE_PRESETS.find((p) => p.key === input.preset);
        if (!preset) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown preset" });
        data = {
          locale_preset: preset.key,
          date_format: preset.settings.date_format,
          time_format: preset.settings.time_format,
          number_format: preset.settings.number_format,
          currency_code: preset.settings.currency_code,
          currency_symbol: preset.settings.currency_symbol,
        };
      } else {
        const customInput = input as {
          preset: "custom";
          date_format?: string;
          time_format?: string;
          number_format?: string;
          currency_code?: string;
          currency_symbol?: string;
        };
        data = { locale_preset: "custom" };
        if (customInput.date_format) data.date_format = customInput.date_format;
        if (customInput.time_format) data.time_format = customInput.time_format;
        if (customInput.number_format) data.number_format = customInput.number_format;
        if (customInput.currency_code) data.currency_code = customInput.currency_code;
        if (customInput.currency_symbol) data.currency_symbol = customInput.currency_symbol;
      }

      const updated = await db.user.update({
        where: { id: ctx.user.id },
        data,
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "user",
        entity_id: ctx.user.id,
        action: "locale_changed",
        meta: { preset: input.preset },
      });

      return updated;
    }),
});
