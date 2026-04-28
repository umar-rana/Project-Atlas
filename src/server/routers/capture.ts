import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { captureAndCreate, previewParse } from "@/core/capture/service";
import { logActivity } from "@/core/audit";

const log = createLogger({ module: "capture-router" });

function sinceDate(days: number): Date | undefined {
  if (days === 0) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

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

  commitReview: protectedProcedure
    .input(
      z.object({
        raw_text: z.string().min(1).max(10000).optional(),
        title: z.string().min(1).max(500),
        notes: z.string().max(50_000).nullable().optional(),
        due_date: z.string().nullable().optional(),
        defer_date: z.string().nullable().optional(),
        project_hint: z.string().max(200).nullable().optional(),
        tags: z.array(z.string()),
        contexts: z.array(z.string()),
        flagged: z.boolean(),
        overridden_fields: z.array(z.string()).optional(),
        parse_tier: z.enum(["local_only", "local_plus_ai", "fallback_only"]).optional(),
        local_confidence: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let projectId: string | null = null;
      if (input.project_hint) {
        const proj = await db.project.findFirst({
          where: {
            title: { equals: input.project_hint, mode: "insensitive" },
            user_id: ctx.user.id,
            deleted_at: null,
          },
          select: { id: true },
        });
        projectId = proj?.id ?? null;
      }

      const resolvedTagIds: string[] = [];
      for (const tagName of input.tags) {
        const lower = tagName.toLowerCase().trim();
        if (!lower) continue;
        let tag = await db.tag.findFirst({
          where: { user_id: ctx.user.id, name: lower, deleted_at: null },
          select: { id: true },
        });
        if (!tag) {
          try {
            tag = await db.tag.create({
              data: { id: newId(), user_id: ctx.user.id, name: lower },
              select: { id: true },
            });
          } catch {
            // Concurrent creation race — re-fetch
            tag = await db.tag.findFirst({
              where: { user_id: ctx.user.id, name: lower, deleted_at: null },
              select: { id: true },
            });
          }
        }
        if (tag) resolvedTagIds.push(tag.id);
      }

      const resolvedContextIds: string[] = [];
      for (const ctxName of input.contexts) {
        const trimmed = ctxName.trim();
        if (!trimmed) continue;
        let ctxRow = await db.context.findFirst({
          where: { user_id: ctx.user.id, name: { equals: trimmed, mode: "insensitive" }, deleted_at: null },
          select: { id: true },
        });
        if (!ctxRow) {
          try {
            ctxRow = await db.context.create({
              data: { id: newId(), user_id: ctx.user.id, name: trimmed },
              select: { id: true },
            });
          } catch {
            // Concurrent creation race — re-fetch
            ctxRow = await db.context.findFirst({
              where: { user_id: ctx.user.id, name: { equals: trimmed, mode: "insensitive" }, deleted_at: null },
              select: { id: true },
            });
          }
        }
        if (ctxRow) resolvedContextIds.push(ctxRow.id);
      }

      const taskId = newId();
      await db.$transaction([
        db.task.create({
          data: {
            id: taskId,
            user_id: ctx.user.id,
            title: input.title,
            notes: input.notes ?? undefined,
            project_id: projectId ?? undefined,
            flagged: input.flagged,
            due_date: input.due_date ? new Date(input.due_date) : undefined,
            defer_date: input.defer_date ? new Date(input.defer_date) : undefined,
            status: "active",
          },
        }),
        ...resolvedTagIds.map((tagId) =>
          db.tagOnTask.create({ data: { task_id: taskId, tag_id: tagId } }),
        ),
        ...resolvedContextIds.map((ctxId) =>
          db.contextOnTask.create({ data: { task_id: taskId, context_id: ctxId } }),
        ),
        db.captureParseLog.create({
          data: {
            id: newId(),
            user_id: ctx.user.id,
            task_id: taskId,
            raw_text: input.raw_text ?? input.title,
            parse_tier: input.parse_tier ?? "local_only",
            local_confidence: input.local_confidence ?? 1.0,
            ai_used: input.parse_tier === "local_plus_ai" || input.parse_tier === "fallback_only",
            parse_duration_ms: 0,
            title: input.title,
            due_date: input.due_date ? new Date(input.due_date) : null,
            tags: input.tags,
            contexts: input.contexts,
            project_hint: input.project_hint,
            source: "modal",
          },
        }),
      ]);

      for (const tagId of resolvedTagIds) {
        db.tag
          .update({ where: { id: tagId }, data: { usage_count: { increment: 1 } } })
          .catch((err: unknown) => log.warn({ err, tagId }, "tag usage increment failed"));
      }

      for (const field of input.overridden_fields ?? []) {
        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Task",
          entity_id: taskId,
          action: "task_user_overrode_parse",
          meta: { field, source: "review_modal" },
        }).catch((err: unknown) => log.warn({ err, field }, "parse override audit log failed"));
      }

      return { taskId };
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
        notes: parsed.notes ?? null,
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
        overrides_only: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let overriddenTaskIds: string[] | undefined;
      if (input.overrides_only) {
        const overrideEvents = await db.auditLog.findMany({
          where: { user_id: ctx.user.id, action: "task_user_overrode_parse" },
          select: { entity_id: true },
          distinct: ["entity_id"],
        });
        overriddenTaskIds = overrideEvents.map((e) => e.entity_id).filter(Boolean);
      }

      const logs = await db.captureParseLog.findMany({
        where: {
          user_id: ctx.user.id,
          ...(input.cursor ? { id: { lt: input.cursor } } : {}),
          ...(overriddenTaskIds !== undefined ? { task_id: { in: overriddenTaskIds } } : {}),
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

  getLogForTask: protectedProcedure
    .input(z.object({ task_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const parseLog = await db.captureParseLog.findFirst({
        where: { user_id: ctx.user.id, task_id: input.task_id },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          parse_tier: true,
          local_confidence: true,
          ai_used: true,
          title: true,
          due_date: true,
          tags: true,
          contexts: true,
          project_hint: true,
          source: true,
          created_at: true,
        },
      });
      return parseLog ?? null;
    }),

  inboxProjectHints: protectedProcedure
    .query(async ({ ctx }) => {
      const inboxTasks = await db.task.findMany({
        where: { user_id: ctx.user.id, project_id: null, status: "active", deleted_at: null },
        select: { id: true },
      });

      const taskIds = inboxTasks.map((t) => t.id);
      if (taskIds.length === 0) return {};

      const logs = await db.captureParseLog.findMany({
        where: { user_id: ctx.user.id, task_id: { in: taskIds }, project_hint: { not: null } },
        orderBy: { created_at: "desc" },
        select: { task_id: true, project_hint: true },
      });

      const result: Record<string, string> = {};
      for (const l of logs) {
        if (l.task_id && l.project_hint && !result[l.task_id]) {
          result[l.task_id] = l.project_hint;
        }
      }
      return result;
    }),

  logParseOverride: protectedProcedure
    .input(
      z.object({
        task_id: z.string().uuid(),
        field: z.string(),
        original: z.string().optional(),
        new_value: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.task_id,
        action: "task_user_overrode_parse",
        meta: { field: input.field, original: input.original, new_value: input.new_value },
      });
      return { ok: true };
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

  updateCapturePrefs: protectedProcedure
    .input(
      z.object({
        ai_capture_enabled: z.boolean().optional(),
        parse_review_modal: z.enum(["never", "when_uncertain", "always"]).optional(),
        auto_create_tags: z.boolean().optional(),
        auto_link_projects: z.boolean().optional(),
        auto_link_people: z.boolean().optional(),
        ai_fallback_enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { tasks_prefs: true },
      });
      const prefs = ((user?.tasks_prefs ?? {}) as Record<string, unknown>);
      const capturePrefs: Record<string, unknown> = {
        ...(typeof prefs.capture_prefs === "object" && prefs.capture_prefs !== null
          ? (prefs.capture_prefs as Record<string, unknown>)
          : {}),
      };
      if (input.ai_capture_enabled !== undefined) capturePrefs.ai_capture_enabled = input.ai_capture_enabled;
      if (input.parse_review_modal !== undefined) capturePrefs.parse_review_modal = input.parse_review_modal;
      if (input.auto_create_tags !== undefined) capturePrefs.auto_create_tags = input.auto_create_tags;
      if (input.auto_link_projects !== undefined) capturePrefs.auto_link_projects = input.auto_link_projects;
      if (input.auto_link_people !== undefined) capturePrefs.auto_link_people = input.auto_link_people;
      if (input.ai_fallback_enabled !== undefined) capturePrefs.ai_fallback_enabled = input.ai_fallback_enabled;

      await db.user.update({
        where: { id: ctx.user.id },
        data: { tasks_prefs: { ...prefs, capture_prefs: capturePrefs as Prisma.InputJsonValue } },
      });
      return { ok: true, capture_prefs: capturePrefs };
    }),

  strategyStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(0).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sinceDate(input.days);

      const logs = await db.captureParseLog.findMany({
        where: {
          user_id: ctx.user.id,
          ...(since ? { created_at: { gte: since } } : {}),
        },
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
        days: z.number().int().min(0).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sinceDate(input.days);

      const logs = await db.captureParseLog.findMany({
        where: {
          user_id: ctx.user.id,
          ...(since ? { created_at: { gte: since } } : {}),
        },
        select: {
          parse_tier: true,
          local_confidence: true,
          ai_used: true,
          ai_error: true,
          parse_duration_ms: true,
        },
      });

      const total = logs.length;

      const sumConfidence = logs.reduce((s: number, l) => s + (l.local_confidence ?? 0), 0);
      const aiAttempts = logs.filter((l) => l.ai_used || l.ai_error).length;
      const aiFailures = logs.filter((l) => !!l.ai_error).length;

      const localLogs = logs.filter((l) => l.parse_tier === "local_only");
      const aiLogs = logs.filter((l) => l.parse_tier !== "local_only");
      const avgLocalMs =
        localLogs.length > 0
          ? Math.round(localLogs.reduce((s: number, l) => s + (l.parse_duration_ms ?? 0), 0) / localLogs.length)
          : 0;
      const avgAiMs =
        aiLogs.length > 0
          ? Math.round(aiLogs.reduce((s: number, l) => s + (l.parse_duration_ms ?? 0), 0) / aiLogs.length)
          : 0;

      if (total === 0) {
        return { avgConfidence: 0, aiFailureRate: 0, aiAttempts: 0, aiFailures: 0, avgLocalMs: 0, avgAiMs: 0, total, days: input.days };
      }

      return {
        avgConfidence: sumConfidence / total,
        aiFailureRate: aiAttempts > 0 ? aiFailures / aiAttempts : 0,
        aiAttempts,
        aiFailures,
        avgLocalMs,
        avgAiMs,
        total,
        days: input.days,
      };
    }),

  overrideStats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(0).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sinceDate(input.days);

      const overrideEvents = await db.auditLog.findMany({
        where: {
          user_id: ctx.user.id,
          action: "task_user_overrode_parse",
          ...(since ? { created_at: { gte: since } } : {}),
        },
        select: { meta: true, created_at: true, entity_id: true },
      });

      const fieldCounts: Record<string, number> = {};
      for (const ev of overrideEvents) {
        const meta = ev.meta as Record<string, unknown> | null;
        const field = typeof meta?.field === "string" ? meta.field : "unknown";
        fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
      }

      const sortedFields = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);

      const totalCaptures = await db.captureParseLog.count({
        where: {
          user_id: ctx.user.id,
          ...(since ? { created_at: { gte: since } } : {}),
        },
      });

      // Use distinct task count so one capture with multiple overridden fields counts once
      const distinctOverriddenTasks = new Set(overrideEvents.map((e) => e.entity_id).filter(Boolean));
      const overrideRate = totalCaptures > 0 ? distinctOverriddenTasks.size / totalCaptures : 0;

      let previousOverrideRate: number | null = null;
      if (input.days > 0) {
        const prevEnd = sinceDate(input.days) ?? new Date();
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - input.days);
        const [prevOverrideRows, prevCaptures] = await Promise.all([
          db.auditLog.findMany({
            where: {
              user_id: ctx.user.id,
              action: "task_user_overrode_parse",
              created_at: { gte: prevStart, lt: prevEnd },
            },
            select: { entity_id: true },
          }),
          db.captureParseLog.count({
            where: {
              user_id: ctx.user.id,
              created_at: { gte: prevStart, lt: prevEnd },
            },
          }),
        ]);
        const prevDistinct = new Set(prevOverrideRows.map((e) => e.entity_id).filter(Boolean));
        previousOverrideRate = prevCaptures > 0 ? prevDistinct.size / prevCaptures : null;
      }

      return {
        totalOverrides: distinctOverriddenTasks.size,
        fieldCounts,
        mostOverridden: sortedFields[0]?.[0] ?? null,
        mostOverriddenCount: sortedFields[0]?.[1] ?? 0,
        leastOverridden: sortedFields[sortedFields.length - 1]?.[0] ?? null,
        leastOverriddenCount: sortedFields[sortedFields.length - 1]?.[1] ?? 0,
        overrideRate,
        previousOverrideRate,
        totalCaptures,
        days: input.days,
      };
    }),

  thresholdImpact: protectedProcedure
    .input(
      z.object({
        threshold: z.number().min(0).max(1),
        days: z.number().int().min(0).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sinceDate(input.days);

      const logs = await db.captureParseLog.findMany({
        where: {
          user_id: ctx.user.id,
          ...(since ? { created_at: { gte: since } } : {}),
        },
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
        days: z.number().int().min(0).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = sinceDate(input.days);

      const logs = await db.captureParseLog.findMany({
        where: {
          user_id: ctx.user.id,
          ...(since ? { created_at: { gte: since } } : {}),
        },
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
