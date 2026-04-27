import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { z } from "zod";
import { captureAndCreate, previewParse } from "@/core/capture/service";

const log = createLogger({ module: "capture-router" });

export const captureRouter = router({
  parseAndCreate: protectedProcedure
    .input(
      z.object({
        raw_text: z.string().min(1).max(10000),
        source: z.enum(["modal", "quick_add", "email", "api"]).default("modal"),
        project_id_override: z.string().uuid().optional(),
        context_id_overrides: z.array(z.string().uuid()).optional(),
        tag_id_overrides: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { taskId, basic_parse } = await captureAndCreate({
        rawText: input.raw_text,
        userId: ctx.user.id,
        source: input.source,
        projectIdOverride: input.project_id_override,
        contextIdOverrides: input.context_id_overrides,
        tagIdOverrides: input.tag_id_overrides,
      });
      return { taskId, basic_parse };
    }),

  preview: protectedProcedure
    .input(
      z.object({
        raw_text: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { parsed, durationMs } = await previewParse(input.raw_text, ctx.user.id);
      return {
        title: parsed.title,
        tags: parsed.tags,
        contexts: parsed.contexts,
        due_date: parsed.due_date?.toISOString() ?? null,
        defer_date: parsed.defer_date?.toISOString() ?? null,
        project_hint: parsed.project_hint ?? null,
        person_refs: parsed.person_refs,
        flagged: parsed.flagged,
        parse_tier: parsed.parse_tier,
        local_confidence: parsed.local_confidence,
        basic_parse: parsed.basic_parse,
        duration_ms: durationMs,
      };
    }),

  recentLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logs = await db.captureParseLog.findMany({
        where: {
          user_id: ctx.user.id,
          ...(input.cursor ? { id: { lt: input.cursor } } : {}),
        },
        orderBy: { created_at: "desc" },
        take: input.limit,
        select: {
          id: true,
          task_id: true,
          raw_text: true,
          parse_tier: true,
          local_confidence: true,
          ai_used: true,
          ai_model: true,
          ai_input_tokens: true,
          ai_output_tokens: true,
          ai_cost_usd: true,
          parse_duration_ms: true,
          title: true,
          due_date: true,
          tags: true,
          contexts: true,
          project_hint: true,
          ai_error: true,
          source: true,
          created_at: true,
        },
      });
      return logs;
    }),

  updateThreshold: protectedProcedure
    .input(
      z.object({
        threshold: z.number().min(0).max(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.user.update({
        where: { id: ctx.user.id },
        data: { ai_confidence_threshold: input.threshold },
      });
      return { ok: true, threshold: input.threshold };
    }),

  updateAiEnabled: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { tasks_prefs: true },
      });
      const prefs = ((user?.tasks_prefs ?? {}) as Record<string, unknown>);
      await db.user.update({
        where: { id: ctx.user.id },
        data: {
          tasks_prefs: { ...prefs, ai_capture_enabled: input.enabled },
        },
      });
      return { ok: true, enabled: input.enabled };
    }),

  strategyStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const logs = await db.captureParseLog.findMany({
        where: { user_id: ctx.user.id, created_at: { gte: since } },
        select: {
          parse_tier: true,
          ai_cost_usd: true,
          parse_duration_ms: true,
        },
      });

      const totalCaptures = logs.length;
      const byTier = {
        local_only: 0,
        local_plus_ai: 0,
        fallback_only: 0,
      };
      let totalAiCost = 0;
      let totalParseDurationMs = 0;

      for (const l of logs) {
        if (l.parse_tier === "local_only") byTier.local_only++;
        else if (l.parse_tier === "local_plus_ai") byTier.local_plus_ai++;
        else byTier.fallback_only++;

        if (l.ai_cost_usd) totalAiCost += l.ai_cost_usd;
        if (l.parse_duration_ms) totalParseDurationMs += l.parse_duration_ms;
      }

      const estimatedPureAiCost = totalCaptures * 0.0005;
      const avgParseDurationMs = totalCaptures > 0 ? totalParseDurationMs / totalCaptures : 0;

      return {
        totalCaptures,
        byTier,
        totalAiCost,
        estimatedPureAiCost,
        aiCostSavings: Math.max(0, estimatedPureAiCost - totalAiCost),
        avgParseDurationMs: Math.round(avgParseDurationMs),
        days: input.days,
      };
    }),

  qualityStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const logs = await db.captureParseLog.findMany({
        where: { user_id: ctx.user.id, created_at: { gte: since } },
        select: {
          parse_tier: true,
          local_confidence: true,
          ai_used: true,
          ai_error: true,
          parse_duration_ms: true,
        },
      });

      const total = logs.length;
      if (total === 0) {
        return { avgConfidence: 0, aiFailureRate: 0, total, days: input.days };
      }

      const sumConfidence = logs.reduce((s, l) => s + (l.local_confidence ?? 0), 0);
      const aiAttempts = logs.filter((l) => l.ai_used || l.ai_error).length;
      const aiFailures = logs.filter((l) => !!l.ai_error).length;

      return {
        avgConfidence: sumConfidence / total,
        aiFailureRate: aiAttempts > 0 ? aiFailures / aiAttempts : 0,
        aiAttempts,
        aiFailures,
        total,
        days: input.days,
      };
    }),

  thresholdImpact: protectedProcedure
    .input(
      z.object({
        threshold: z.number().min(0).max(1),
        days: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const logs = await db.captureParseLog.findMany({
        where: { user_id: ctx.user.id, created_at: { gte: since } },
        select: { local_confidence: true, ai_cost_usd: true },
      });

      const total = logs.length;
      const wouldUseAi = logs.filter((l) => (l.local_confidence ?? 0) < input.threshold).length;
      const wouldSkipAi = total - wouldUseAi;
      const estimatedCost = wouldUseAi * 0.0005;

      return {
        threshold: input.threshold,
        total,
        wouldUseAi,
        wouldSkipAi,
        estimatedDailyCost: estimatedCost,
        days: input.days,
      };
    }),

  exportStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const logs = await db.captureParseLog.findMany({
        where: { user_id: ctx.user.id, created_at: { gte: since } },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          created_at: true,
          parse_tier: true,
          local_confidence: true,
          ai_used: true,
          ai_cost_usd: true,
          parse_duration_ms: true,
          source: true,
          title: true,
        },
      });

      const header = "id,created_at,parse_tier,local_confidence,ai_used,ai_cost_usd,parse_duration_ms,source,title\n";
      const rows = logs.map((l) => {
        const title = `"${(l.title ?? "").replace(/"/g, '""')}"`;
        return [
          l.id,
          l.created_at.toISOString(),
          l.parse_tier,
          l.local_confidence.toFixed(4),
          l.ai_used ? "true" : "false",
          (l.ai_cost_usd ?? 0).toFixed(6),
          l.parse_duration_ms,
          l.source,
          title,
        ].join(",");
      });

      return { csv: header + rows.join("\n"), count: logs.length };
    }),

  create: protectedProcedure
    .input(
      z.object({
        raw_text: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.create({
        data: {
          id: newId(),
          user_id: ctx.user.id,
          raw_text: input.raw_text,
          tags: [],
          action_items: [],
        },
      });
      return capture;
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const captures = await db.capture.findMany({
        where: {
          user_id: ctx.user.id,
          deleted_at: null,
          ...(input.cursor ? { id: { lt: input.cursor } } : {}),
        },
        orderBy: { id: "desc" },
        take: input.limit,
      });
      return captures;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: {
          id: input.id,
          user_id: ctx.user.id,
          deleted_at: null,
        },
      });
      if (!capture) throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });
      return capture;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.capture.updateMany({
        where: { id: input.id, user_id: ctx.user.id },
        data: { deleted_at: new Date() },
      });
      return { ok: true };
    }),
});

log.debug("Capture router initialized with hybrid pipeline");
