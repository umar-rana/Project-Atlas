import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, userOwned, userOwnedActive } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { captureAndCreate, previewParse } from "@/core/capture/service";
import { logActivity } from "@/core/audit";
import {
  runInboxMigrationDryRun,
  runInboxMigrationForUser,
  saveMigrationSummaryForUser,
  readAndClearMigrationSummary,
  dismissMigrationSummary,
} from "@/core/capture/inbox-migration";

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
        due_date_override: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { captureId, basic_parse } = await captureAndCreate({
        rawText: input.raw_text,
        userId: ctx.user.id,
        source: input.source,
        projectIdOverride: input.project_id_override,
        contextIdOverrides: input.context_id_overrides,
        tagIdOverrides: input.tag_id_overrides,
        dueDateOverride: input.due_date_override ? new Date(input.due_date_override) : undefined,
      });
      return { captureId, basic_parse };
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
          where: userOwnedActive(ctx.user, {
            title: { equals: input.project_hint, mode: "insensitive" as const },
          }),
          select: { id: true },
        });
        projectId = proj?.id ?? null;
      }

      const resolvedTagIds: string[] = [];
      for (const tagName of input.tags) {
        const lower = tagName.toLowerCase().trim();
        if (!lower) continue;
        let tag = await db.tag.findFirst({
          where: userOwnedActive(ctx.user, { name: lower }),
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
              where: userOwnedActive(ctx.user, { name: lower }),
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
          where: userOwnedActive(ctx.user, {
            name: { equals: trimmed, mode: "insensitive" as const },
          }),
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
              where: {
                user_id: ctx.user.id,
                name: { equals: trimmed, mode: "insensitive" },
                deleted_at: null,
              },
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
          where: userOwned(ctx.user, { action: "task_user_overrode_parse" }),
          select: { entity_id: true },
          distinct: ["entity_id"],
        });
        overriddenTaskIds = overrideEvents.map((e) => e.entity_id).filter(Boolean);
      }

      const logs = await db.captureParseLog.findMany({
        where: userOwned(ctx.user, {
          ...(input.cursor ? { id: { lt: input.cursor } } : {}),
          ...(overriddenTaskIds !== undefined ? { task_id: { in: overriddenTaskIds } } : {}),
        }),
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
        where: userOwned(ctx.user, { task_id: input.task_id }),
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

  inboxProjectHints: protectedProcedure.query(async ({ ctx }) => {
    const inboxTasks = await db.task.findMany({
      where: userOwnedActive(ctx.user, { project_id: null, status: "active" }),
      select: { id: true },
    });

    const taskIds = inboxTasks.map((t) => t.id);
    if (taskIds.length === 0) return {};

    const logs = await db.captureParseLog.findMany({
      where: userOwned(ctx.user, { task_id: { in: taskIds }, project_hint: { not: null } }),
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
      const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
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
      const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
      const capturePrefs: Record<string, unknown> = {
        ...(typeof prefs.capture_prefs === "object" && prefs.capture_prefs !== null
          ? (prefs.capture_prefs as Record<string, unknown>)
          : {}),
      };
      if (input.ai_capture_enabled !== undefined)
        capturePrefs.ai_capture_enabled = input.ai_capture_enabled;
      if (input.parse_review_modal !== undefined)
        capturePrefs.parse_review_modal = input.parse_review_modal;
      if (input.auto_create_tags !== undefined)
        capturePrefs.auto_create_tags = input.auto_create_tags;
      if (input.auto_link_projects !== undefined)
        capturePrefs.auto_link_projects = input.auto_link_projects;
      if (input.auto_link_people !== undefined)
        capturePrefs.auto_link_people = input.auto_link_people;
      if (input.ai_fallback_enabled !== undefined)
        capturePrefs.ai_fallback_enabled = input.ai_fallback_enabled;

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
        where: userOwned(ctx.user, {
          ...(since ? { created_at: { gte: since } } : {}),
        }),
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
        where: userOwned(ctx.user, {
          ...(since ? { created_at: { gte: since } } : {}),
        }),
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
          ? Math.round(
              localLogs.reduce((s: number, l) => s + (l.parse_duration_ms ?? 0), 0) /
                localLogs.length,
            )
          : 0;
      const avgAiMs =
        aiLogs.length > 0
          ? Math.round(
              aiLogs.reduce((s: number, l) => s + (l.parse_duration_ms ?? 0), 0) / aiLogs.length,
            )
          : 0;

      if (total === 0) {
        return {
          avgConfidence: 0,
          aiFailureRate: 0,
          aiAttempts: 0,
          aiFailures: 0,
          avgLocalMs: 0,
          avgAiMs: 0,
          total,
          days: input.days,
        };
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
        where: userOwned(ctx.user, {
          action: "task_user_overrode_parse",
          ...(since ? { created_at: { gte: since } } : {}),
        }),
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
        where: userOwned(ctx.user, {
          ...(since ? { created_at: { gte: since } } : {}),
        }),
      });

      // Use distinct task count so one capture with multiple overridden fields counts once
      const distinctOverriddenTasks = new Set(
        overrideEvents.map((e) => e.entity_id).filter(Boolean),
      );
      const overrideRate = totalCaptures > 0 ? distinctOverriddenTasks.size / totalCaptures : 0;

      let previousOverrideRate: number | null = null;
      if (input.days > 0) {
        const prevEnd = sinceDate(input.days) ?? new Date();
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - input.days);
        const [prevOverrideRows, prevCaptures] = await Promise.all([
          db.auditLog.findMany({
            where: userOwned(ctx.user, {
              action: "task_user_overrode_parse",
              created_at: { gte: prevStart, lt: prevEnd },
            }),
            select: { entity_id: true },
          }),
          db.captureParseLog.count({
            where: userOwned(ctx.user, {
              created_at: { gte: prevStart, lt: prevEnd },
            }),
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
        where: userOwned(ctx.user, {
          ...(since ? { created_at: { gte: since } } : {}),
        }),
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

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
        search: z.string().max(500).optional(),
        tag: z.string().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.CaptureWhereInput = userOwnedActive(ctx.user, {
        ...(input.search
          ? {
              OR: [
                { title: { contains: input.search, mode: "insensitive" } },
                { raw_text: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(input.tag ? { tags: { has: input.tag } } : {}),
      });

      const captures = await db.capture.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
        take: input.limit + 1,
        select: {
          id: true,
          raw_text: true,
          title: true,
          tags: true,
          due_date: true,
          action_items: true,
          ai_parsed: true,
          created_at: true,
        },
      });

      let nextCursor: string | undefined;
      if (captures.length > input.limit) {
        captures.pop();
        nextCursor = captures[captures.length - 1]?.id;
      }

      return { captures, nextCursor };
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
        where: userOwned(ctx.user, {
          ...(since ? { created_at: { gte: since } } : {}),
        }),
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

      const header =
        "id,created_at,parse_tier,local_confidence,ai_used,ai_cost_usd,parse_duration_ms,source,title\n";
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

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.id,
        }),
      });
      if (!capture) throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });
      return capture;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        tags: z.array(z.string().max(100)).optional(),
        due_date: z.string().datetime().nullable().optional(),
        action_items: z.array(z.string().max(1000)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, { id: input.id }),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });

      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.due_date !== undefined)
        data.due_date = input.due_date ? new Date(input.due_date) : null;
      if (input.action_items !== undefined) data.action_items = input.action_items;

      const updated = await db.capture.update({
        where: { id: input.id },
        data,
        select: {
          id: true,
          raw_text: true,
          title: true,
          tags: true,
          due_date: true,
          action_items: true,
          ai_parsed: true,
          created_at: true,
        },
      });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.capture.updateMany({
        where: userOwned(ctx.user, { id: input.id }),
        data: { deleted_at: new Date() },
      });
      return { ok: true };
    }),

  // ── Inbox Migration procedures ───────────────────────────────────────────

  runInboxMigration: protectedProcedure
    .input(
      z.object({
        dry_run: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.dry_run) {
        const result = await runInboxMigrationDryRun([ctx.user.id]);
        const userCounts = result.byUser[ctx.user.id] ?? { categoryA: 0, categoryB: 0, total: 0 };
        return {
          dry_run: true as const,
          categoryA: userCounts.categoryA,
          categoryB: userCounts.categoryB,
          total: userCounts.total,
          converted: undefined as number | undefined,
          kept: undefined as number | undefined,
          errors: undefined as number | undefined,
        };
      }

      const result = await runInboxMigrationForUser(ctx.user.id);
      await saveMigrationSummaryForUser(ctx.user.id, {
        converted: result.converted,
        kept: result.kept,
        errors: result.errors,
        ranAt: new Date().toISOString(),
      });
      return {
        dry_run: false as const,
        converted: result.converted,
        kept: result.kept,
        errors: result.errors,
        categoryA: undefined as number | undefined,
        categoryB: undefined as number | undefined,
        total: undefined as number | undefined,
      };
    }),

  getMigrationSummary: protectedProcedure.query(async ({ ctx }) => {
    return await readAndClearMigrationSummary(ctx.user.id);
  }),

  dismissMigrationSummary: protectedProcedure.mutation(async ({ ctx }) => {
    await dismissMigrationSummary(ctx.user.id);
    return { ok: true };
  }),

  listInbox: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const captures = await db.capture.findMany({
        where: userOwnedActive(ctx.user, {
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        orderBy: { created_at: "desc" },
        take: input.limit,
        select: {
          id: true,
          raw_text: true,
          title: true,
          tags: true,
          due_date: true,
          state: true,
          migration_source: true,
          ai_parsed: true,
          parser_proposal: true,
          created_at: true,
        },
      });
      return captures;
    }),

  // ── Processing mode disposition procedures ───────────────────────────────

  processToTask: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        notes: z.string().max(50_000).nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        context_ids: z.array(z.string().uuid()).default([]),
        tag_ids: z.array(z.string().uuid()).default([]),
        due_date: z.string().datetime().nullable().optional(),
        defer_date: z.string().datetime().nullable().optional(),
        estimated_minutes: z.number().int().min(0).nullable().optional(),
        flagged: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true, state: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      if (input.project_id) {
        const proj = await db.project.findFirst({
          where: userOwnedActive(ctx.user, { id: input.project_id }),
          select: { id: true },
        });
        if (!proj)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Project not found or not owned by user",
          });
      }
      if (input.context_ids.length > 0) {
        const count = await db.context.count({
          where: userOwnedActive(ctx.user, { id: { in: input.context_ids } }),
        });
        if (count !== input.context_ids.length)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "One or more contexts not found or not owned by user",
          });
      }
      if (input.tag_ids.length > 0) {
        const count = await db.tag.count({
          where: userOwnedActive(ctx.user, { id: { in: input.tag_ids } }),
        });
        if (count !== input.tag_ids.length)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "One or more tags not found or not owned by user",
          });
      }

      const taskId = newId();
      const now = new Date();

      try {
        await db.$transaction([
          db.task.create({
            data: {
              id: taskId,
              user_id: ctx.user.id,
              title: input.title,
              notes: input.notes ?? undefined,
              project_id: input.project_id ?? undefined,
              flagged: input.flagged,
              due_date: input.due_date ? new Date(input.due_date) : undefined,
              defer_date: input.defer_date ? new Date(input.defer_date) : undefined,
              estimated_minutes: input.estimated_minutes ?? undefined,
              status: "active",
            },
          }),
          ...input.context_ids.map((ctxId) =>
            db.contextOnTask.create({ data: { task_id: taskId, context_id: ctxId } }),
          ),
          ...input.tag_ids.map((tagId) =>
            db.tagOnTask.create({ data: { task_id: taskId, tag_id: tagId } }),
          ),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "task",
              processed_to_id: taskId,
            },
          }),
        ]);
      } catch (err) {
        log.error({ err, captureId: input.capture_id, userId: ctx.user.id }, "processToTask transaction failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("foreign key") || msg.includes("Foreign key")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A referenced context, tag, or project no longer exists. Please refresh and try again." });
        }
        if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
          throw new TRPCError({ code: "CONFLICT", message: "This capture has already been processed. Please refresh your inbox." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create task. Please try again." });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: { disposition: "task", task_id: taskId },
      }).catch((err: unknown) => log.warn({ err }, "processToTask audit log failed"));

      return { taskId };
    }),

  processToNote: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        purpose: z.enum(["note", "meeting_note", "project_brief", "reading_note"]).default("note"),
        project_id: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true, raw_text: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      if (input.project_id) {
        const proj = await db.project.findFirst({
          where: userOwnedActive(ctx.user, { id: input.project_id }),
          select: { id: true },
        });
        if (!proj)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Project not found or not owned by user",
          });
      }

      const noteId = newId();
      const now = new Date();
      const bodyText = capture.raw_text ?? "";

      try {
        await db.$transaction([
          db.note.create({
            data: {
              id: noteId,
              user_id: ctx.user.id,
              title: input.title,
              purpose: input.purpose,
              project_id: input.project_id ?? undefined,
              body_text: bodyText,
              body_json: JSON.stringify({
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: bodyText }] }],
              }),
              body_markdown: bodyText,
            },
          }),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "note",
              processed_to_id: noteId,
            },
          }),
        ]);
      } catch (err) {
        log.error({ err, captureId: input.capture_id, userId: ctx.user.id }, "processToNote transaction failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
          throw new TRPCError({ code: "CONFLICT", message: "This capture has already been processed. Please refresh your inbox." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create note. Please try again." });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: { disposition: "note", note_id: noteId, purpose: input.purpose },
      }).catch((err: unknown) => log.warn({ err }, "processToNote audit log failed"));

      return { noteId };
    }),

  processToProject: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
        existing_project_id: z.string().uuid().optional(),
        new_project_name: z.string().min(1).max(200).optional(),
        new_project_type: z.enum(["project", "area"]).default("project").optional(),
        target_type: z.enum(["task", "note", "brief"]),
        title: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true, raw_text: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      let projectId: string;
      if (input.existing_project_id) {
        const proj = await db.project.findFirst({
          where: userOwnedActive(ctx.user, { id: input.existing_project_id }),
          select: { id: true },
        });
        if (!proj) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        projectId = proj.id;
      } else if (input.new_project_name) {
        const existing = await db.project.findFirst({
          where: userOwnedActive(ctx.user, { title: input.new_project_name }),
          select: { id: true },
        });
        if (existing) {
          projectId = existing.id;
        } else {
          const created = await db.project.create({
            data: {
              id: newId(),
              user_id: ctx.user.id,
              title: input.new_project_name,
              type: input.new_project_type ?? "project",
            },
          });
          projectId = created.id;
        }
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must provide existing_project_id or new_project_name",
        });
      }

      const now = new Date();
      let entityId: string;

      if (input.target_type === "task") {
        entityId = newId();
        await db.$transaction([
          db.task.create({
            data: {
              id: entityId,
              user_id: ctx.user.id,
              title: input.title,
              project_id: projectId,
              status: "active",
            },
          }),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "project_task",
              processed_to_id: entityId,
            },
          }),
        ]);
      } else {
        const purpose = input.target_type === "brief" ? "project_brief" : "note";
        entityId = newId();
        const bodyText = capture.raw_text ?? "";
        await db.$transaction([
          db.note.create({
            data: {
              id: entityId,
              user_id: ctx.user.id,
              title: input.title,
              purpose,
              project_id: projectId,
              body_text: bodyText,
              body_json: JSON.stringify({
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: bodyText }] }],
              }),
              body_markdown: bodyText,
            },
          }),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "project_note",
              processed_to_id: entityId,
            },
          }),
        ]);
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: {
          disposition: "project",
          project_id: projectId,
          target_type: input.target_type,
          entity_id: entityId,
        },
      }).catch((err: unknown) => log.warn({ err }, "processToProject audit log failed"));

      return { projectId, entityId };
    }),

  processToSomeday: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        notes: z.string().max(50_000).nullable().optional(),
        tag_ids: z.array(z.string().uuid()).default([]),
        someday_review_date: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      if (input.tag_ids.length > 0) {
        const count = await db.tag.count({
          where: userOwnedActive(ctx.user, { id: { in: input.tag_ids } }),
        });
        if (count !== input.tag_ids.length)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "One or more tags not found or not owned by user",
          });
      }

      const taskId = newId();
      const now = new Date();

      try {
        await db.$transaction([
          db.task.create({
            data: {
              id: taskId,
              user_id: ctx.user.id,
              title: input.title,
              notes: input.notes ?? undefined,
              is_someday: true,
              someday_review_date: input.someday_review_date
                ? new Date(input.someday_review_date)
                : undefined,
              status: "active",
            },
          }),
          ...input.tag_ids.map((tagId) =>
            db.tagOnTask.create({ data: { task_id: taskId, tag_id: tagId } }),
          ),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "someday",
              processed_to_id: taskId,
            },
          }),
        ]);
      } catch (err) {
        log.error({ err, captureId: input.capture_id, userId: ctx.user.id }, "processToSomeday transaction failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
          throw new TRPCError({ code: "CONFLICT", message: "This capture has already been processed. Please refresh your inbox." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to add to Someday/Maybe. Please try again." });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: { disposition: "someday", task_id: taskId },
      }).catch((err: unknown) => log.warn({ err }, "processToSomeday audit log failed"));
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: taskId,
        action: "task_marked_someday",
        meta: { from_capture: input.capture_id, review_date: input.someday_review_date ?? null },
      }).catch((err: unknown) => log.warn({ err }, "task_marked_someday audit log failed"));

      return { taskId };
    }),

  processToWaitingFor: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        delegated_to_text: z.string().max(500).optional(),
        follow_up_date: z.string().datetime().nullable().optional(),
        notes: z.string().max(50_000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      const taskId = newId();
      const now = new Date();

      try {
        await db.$transaction([
          db.task.create({
            data: {
              id: taskId,
              user_id: ctx.user.id,
              title: input.title,
              notes: input.notes ?? undefined,
              delegated_to_text: input.delegated_to_text ?? undefined,
              follow_up_date: input.follow_up_date ? new Date(input.follow_up_date) : undefined,
              status: "active",
            },
          }),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "waiting_for",
              processed_to_id: taskId,
            },
          }),
        ]);
      } catch (err) {
        log.error({ err, captureId: input.capture_id, userId: ctx.user.id }, "processToWaitingFor transaction failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
          throw new TRPCError({ code: "CONFLICT", message: "This capture has already been processed. Please refresh your inbox." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to add to Waiting For. Please try again." });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: {
          disposition: "waiting_for",
          task_id: taskId,
          delegated_to: input.delegated_to_text,
        },
      }).catch((err: unknown) => log.warn({ err }, "processToWaitingFor audit log failed"));
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: taskId,
        action: "task_delegated",
        meta: {
          from_capture: input.capture_id,
          delegated_to: input.delegated_to_text ?? null,
          follow_up_date: input.follow_up_date ?? null,
        },
      }).catch((err: unknown) => log.warn({ err }, "task_delegated audit log failed"));

      return { taskId };
    }),

  processToTwoMinuteDone: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        notes: z.string().max(50_000).nullable().optional(),
        project_id: z.string().uuid().optional(),
        context_ids: z.array(z.string().uuid()).default([]),
        tag_ids: z.array(z.string().uuid()).default([]),
        estimated_minutes: z.number().int().min(1).max(1440).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      // Validate optional project ownership
      if (input.project_id) {
        const proj = await db.project.findFirst({
          where: userOwnedActive(ctx.user, { id: input.project_id }),
          select: { id: true },
        });
        if (!proj)
          throw new TRPCError({ code: "FORBIDDEN", message: "Project not found or not owned by user" });
      }

      // Validate optional tag ownership
      if (input.tag_ids.length > 0) {
        const count = await db.tag.count({
          where: userOwnedActive(ctx.user, { id: { in: input.tag_ids } }),
        });
        if (count !== input.tag_ids.length)
          throw new TRPCError({ code: "FORBIDDEN", message: "One or more tags not found or not owned by user" });
      }

      // Validate optional context ownership
      if (input.context_ids.length > 0) {
        const count = await db.context.count({
          where: userOwnedActive(ctx.user, { id: { in: input.context_ids } }),
        });
        if (count !== input.context_ids.length)
          throw new TRPCError({ code: "FORBIDDEN", message: "One or more contexts not found or not owned by user" });
      }

      const taskId = newId();
      const now = new Date();

      try {
        await db.$transaction([
          db.task.create({
            data: {
              id: taskId,
              user_id: ctx.user.id,
              title: input.title,
              notes: input.notes ?? undefined,
              project_id: input.project_id ?? undefined,
              estimated_minutes: input.estimated_minutes ?? undefined,
              status: "completed",
              completed_at: now,
            },
          }),
          ...input.context_ids.map((ctxId) =>
            db.contextOnTask.create({ data: { task_id: taskId, context_id: ctxId } }),
          ),
          ...input.tag_ids.map((tagId) =>
            db.tagOnTask.create({ data: { task_id: taskId, tag_id: tagId } }),
          ),
          db.capture.update({
            where: { id: input.capture_id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "two_minute_done",
              processed_to_id: taskId,
            },
          }),
        ]);
      } catch (err) {
        log.error({ err, captureId: input.capture_id, userId: ctx.user.id }, "processToTwoMinuteDone transaction failed");
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
          throw new TRPCError({ code: "CONFLICT", message: "This capture has already been processed. Please refresh your inbox." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to mark capture as done. Please try again." });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: {
          disposition: "two_minute_done",
          task_id: taskId,
          note: "completed via 2-minute rule",
        },
      }).catch((err: unknown) => log.warn({ err }, "processToTwoMinuteDone audit log failed"));

      return { taskId };
    }),

  processToTrash: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, {
          id: input.capture_id,
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true },
      });
      if (!capture)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Capture not found or already processed",
        });

      const now = new Date();
      try {
        await db.capture.update({
          where: { id: input.capture_id },
          data: {
            state: "processed",
            processed_at: now,
            processed_to_type: "trashed",
            processed_to_id: null,
          },
        });
      } catch (err) {
        log.error({ err, captureId: input.capture_id, userId: ctx.user.id }, "processToTrash failed");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to trash capture. Please try again." });
      }

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_processed",
        meta: { disposition: "trashed" },
      }).catch((err: unknown) => log.warn({ err }, "processToTrash audit log failed"));

      return { ok: true };
    }),

  bulkProcess: protectedProcedure
    .input(
      z.object({
        capture_ids: z.array(z.string().uuid()).min(1).max(100),
        disposition: z.enum(["task", "note", "someday", "trash"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const captures = await db.capture.findMany({
        where: userOwnedActive(ctx.user, {
          id: { in: input.capture_ids },
          state: { in: ["raw", "proposed"] },
          processed_at: null,
        }),
        select: { id: true, raw_text: true, title: true },
      });

      if (captures.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No processable captures found" });
      }

      const now = new Date();
      const processedIds: string[] = [];

      for (const capture of captures) {
        const displayTitle = (capture.title ?? capture.raw_text ?? "(untitled)").slice(0, 500);
        let processedToType: string;
        let processedToId: string | null = null;

        if (input.disposition === "task") {
          const taskId = newId();
          await db.$transaction([
            db.task.create({
              data: {
                id: taskId,
                user_id: ctx.user.id,
                title: displayTitle,
                status: "active",
              },
            }),
            db.capture.update({
              where: { id: capture.id },
              data: {
                state: "processed",
                processed_at: now,
                processed_to_type: "task",
                processed_to_id: taskId,
              },
            }),
          ]);
          processedToType = "task";
          processedToId = taskId;
        } else if (input.disposition === "note") {
          const noteId = newId();
          const bodyText = capture.raw_text ?? "";
          await db.$transaction([
            db.note.create({
              data: {
                id: noteId,
                user_id: ctx.user.id,
                title: displayTitle,
                purpose: "note",
                body_text: bodyText,
                body_json: JSON.stringify({
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text: bodyText }] }],
                }),
                body_markdown: bodyText,
              },
            }),
            db.capture.update({
              where: { id: capture.id },
              data: {
                state: "processed",
                processed_at: now,
                processed_to_type: "note",
                processed_to_id: noteId,
              },
            }),
          ]);
          processedToType = "note";
          processedToId = noteId;
        } else if (input.disposition === "someday") {
          const taskId = newId();
          await db.$transaction([
            db.task.create({
              data: {
                id: taskId,
                user_id: ctx.user.id,
                title: displayTitle,
                is_someday: true,
                status: "active",
              },
            }),
            db.capture.update({
              where: { id: capture.id },
              data: {
                state: "processed",
                processed_at: now,
                processed_to_type: "someday",
                processed_to_id: taskId,
              },
            }),
          ]);
          processedToType = "someday";
          processedToId = taskId;
        } else {
          await db.capture.update({
            where: { id: capture.id },
            data: {
              state: "processed",
              processed_at: now,
              processed_to_type: "trashed",
              processed_to_id: null,
            },
          });
          processedToType = "trashed";
        }

        processedIds.push(capture.id);

        await logActivity({
          user_id: ctx.user.id,
          entity_type: "Capture",
          entity_id: capture.id,
          action: "capture_bulk_processed",
          meta: {
            disposition: input.disposition,
            processed_to_type: processedToType,
            processed_to_id: processedToId,
            bulk: true,
          },
        }).catch((err: unknown) => log.warn({ err }, "bulkProcess audit log failed"));
      }

      return { ok: true, count: processedIds.length };
    }),

  undoLastProcessing: protectedProcedure
    .input(
      z.object({
        capture_id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const capture = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, { id: input.capture_id }),
        select: {
          id: true,
          state: true,
          processed_at: true,
          processed_to_type: true,
          processed_to_id: true,
        },
      });
      if (!capture) throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });
      if (capture.state !== "processed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Capture is not in processed state" });
      }
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (!capture.processed_at || capture.processed_at < fiveMinutesAgo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Undo window has expired (5 minutes)",
        });
      }

      const mostRecentProcessed = await db.capture.findFirst({
        where: userOwnedActive(ctx.user, { state: "processed" }),
        orderBy: { processed_at: "desc" },
        select: { id: true },
      });
      if (!mostRecentProcessed || mostRecentProcessed.id !== input.capture_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only undo the most recently processed capture",
        });
      }

      const ops: Promise<unknown>[] = [];

      const entityType = capture.processed_to_type;
      const entityId = capture.processed_to_id;

      if (
        entityId &&
        (entityType === "task" ||
          entityType === "someday" ||
          entityType === "waiting_for" ||
          entityType === "two_minute_done" ||
          entityType === "project_task")
      ) {
        ops.push(
          db.task.updateMany({
            where: userOwned(ctx.user, { id: entityId }),
            data: { deleted_at: new Date() },
          }),
        );
      } else if (entityId && (entityType === "note" || entityType === "project_note")) {
        ops.push(
          db.note.updateMany({
            where: userOwned(ctx.user, { id: entityId }),
            data: { deleted_at: new Date() },
          }),
        );
      }

      ops.push(
        db.capture.update({
          where: { id: input.capture_id },
          data: {
            state: "proposed",
            processed_at: null,
            processed_to_type: null,
            processed_to_id: null,
          },
        }),
      );

      await Promise.all(ops);

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Capture",
        entity_id: input.capture_id,
        action: "capture_undo",
        meta: { reverted_from: entityType, entity_id: entityId },
      }).catch((err: unknown) => log.warn({ err }, "undoLastProcessing audit log failed"));

      return { ok: true };
    }),
});

log.debug("Capture router initialized with hybrid pipeline");
