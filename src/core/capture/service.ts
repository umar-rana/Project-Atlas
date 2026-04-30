import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { runTier1 } from "./parser/tier-1-local";
import { runTier2 } from "./parser/tier-2-ai";
import { runFallback } from "./parser/fallback";
import { scoreConfidence } from "./parser/confidence";
import { runPipeline } from "./parser/index";
import { enqueueEnrichment } from "./enrichment-queue";
import type { CaptureSource, ParsedCapture } from "./parser/types";

const log = createLogger({ module: "capture-service" });

export interface CaptureCreateInput {
  rawText: string;
  userId: string;
  source: CaptureSource;
  projectIdOverride?: string;
  contextIdOverrides?: string[];
  tagIdOverrides?: string[];
  dueDateOverride?: Date;
}

export interface CaptureCreateResult {
  taskId: string;
  basic_parse: boolean;
}

async function getUserContext(userId: string): Promise<{
  timezone: string;
  confidenceThreshold: number;
  aiEnabled: boolean;
}> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { timezone: true, ai_confidence_threshold: true, tasks_prefs: true },
    });
    const prefs = (user?.tasks_prefs ?? {}) as Record<string, unknown>;
    const capturePrefs = (
      typeof prefs["capture_prefs"] === "object" && prefs["capture_prefs"] !== null
        ? prefs["capture_prefs"]
        : {}
    ) as Record<string, unknown>;
    const masterEnabled =
      prefs["ai_capture_enabled"] !== false &&
      capturePrefs["ai_capture_enabled"] !== false;
    const fallbackEnabled = capturePrefs["ai_fallback_enabled"] !== false;
    const aiEnabled = masterEnabled && fallbackEnabled;
    return {
      timezone: user?.timezone ?? "UTC",
      confidenceThreshold: user?.ai_confidence_threshold ?? 0.70,
      aiEnabled,
    };
  } catch {
    return { timezone: "UTC", confidenceThreshold: 0.70, aiEnabled: true };
  }
}

async function getUserProjects(userId: string): Promise<string[]> {
  try {
    const projects = await db.project.findMany({
      where: { user_id: userId, deleted_at: null, status: "active" },
      select: { title: true },
      take: 100,
    });
    return projects.map((p) => p.title);
  } catch {
    return [];
  }
}

async function resolveProjectId(
  projectHint: string | undefined,
  userId: string,
): Promise<string | undefined> {
  if (!projectHint) return undefined;
  try {
    const project = await db.project.findFirst({
      where: {
        title: { equals: projectHint, mode: "insensitive" },
        user_id: userId,
        deleted_at: null,
      },
      select: { id: true },
    });
    return project?.id ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Given all parsed tag names (from Tier1 + AI), the set of explicit #tag names
 * (Tier1 only), and the set of tag names that already exist in the user's library,
 * returns:
 *   - autoApply: tags to immediately create/link (explicit + AI-matched existing)
 *   - suggestedNew: tags NOT to auto-create; surface as inbox suggestions instead
 */
export function classifyParsedTags(
  allParsedTagNames: string[],
  explicitTagNames: ReadonlySet<string>,
  existingTagNames: ReadonlySet<string>,
): { autoApply: string[]; suggestedNew: string[] } {
  const autoApply: string[] = [];
  const suggestedNew: string[] = [];

  for (const tag of allParsedTagNames) {
    const lower = tag.toLowerCase();
    if (explicitTagNames.has(lower)) {
      autoApply.push(lower);
    } else if (existingTagNames.has(lower)) {
      autoApply.push(lower);
    } else {
      suggestedNew.push(lower);
    }
  }

  return { autoApply: [...new Set(autoApply)], suggestedNew: [...new Set(suggestedNew)] };
}

async function linkTagsAndContexts(
  taskId: string,
  userId: string,
  tagNames: string[],
  contextNames: string[],
  extraContextIds: string[] = [],
  extraTagIds: string[] = [],
): Promise<void> {
  if (tagNames.length === 0 && contextNames.length === 0 && extraContextIds.length === 0 && extraTagIds.length === 0) return;

  try {
    const tagIds: string[] = [];
    for (const name of tagNames) {
      const lower = name.toLowerCase().trim();
      if (!lower) continue;
      let tag = await db.tag.findFirst({
        where: { user_id: userId, name: lower, deleted_at: null },
        select: { id: true },
      });
      if (!tag) {
        try {
          tag = await db.tag.create({
            data: { id: newId(), user_id: userId, name: lower },
            select: { id: true },
          });
        } catch {
          tag = await db.tag.findFirst({
            where: { user_id: userId, name: lower, deleted_at: null },
            select: { id: true },
          });
        }
      }
      if (tag) tagIds.push(tag.id);
    }

    const contextIds: string[] = [];
    for (const name of contextNames) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      let ctx = await db.context.findFirst({
        where: { user_id: userId, name: { equals: trimmed, mode: "insensitive" }, deleted_at: null },
        select: { id: true },
      });
      if (!ctx) {
        try {
          ctx = await db.context.create({
            data: { id: newId(), user_id: userId, name: trimmed },
            select: { id: true },
          });
        } catch {
          ctx = await db.context.findFirst({
            where: { user_id: userId, name: { equals: trimmed, mode: "insensitive" }, deleted_at: null },
            select: { id: true },
          });
        }
      }
      if (ctx) contextIds.push(ctx.id);
    }

    const allTagIds = [...new Set([...tagIds, ...extraTagIds])];
    const allContextIds = [...new Set([...contextIds, ...extraContextIds])];

    if (allTagIds.length > 0) {
      await db.tagOnTask.createMany({
        data: allTagIds.map((tag_id) => ({ task_id: taskId, tag_id })),
        skipDuplicates: true,
      });
      if (tagIds.length > 0) {
        await db.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usage_count: { increment: 1 } },
        });
      }
    }

    if (allContextIds.length > 0) {
      await db.contextOnTask.createMany({
        data: allContextIds.map((context_id) => ({ task_id: taskId, context_id })),
        skipDuplicates: true,
      });
    }
  } catch (err) {
    log.warn({ err, taskId }, "Failed to link tags/contexts to task");
  }
}

async function writeAuditLog(
  userId: string,
  taskId: string,
  parsed: ParsedCapture,
  durationMs: number,
  source: CaptureSource,
): Promise<void> {
  const action =
    parsed.parse_tier === "local_plus_ai"
      ? "task_parsed_with_ai"
      : parsed.parse_tier === "local_only"
        ? "task_parsed_local_only"
        : "task_parsed_fallback";

  try {
    await db.auditLog.create({
      data: {
        id: newId(),
        user_id: userId,
        entity_type: "Task",
        entity_id: taskId,
        action,
        meta: {
          parse_tier: parsed.parse_tier,
          local_confidence: parsed.local_confidence,
          duration_ms: durationMs,
          source,
        },
      },
    });
  } catch (err) {
    log.warn({ err, taskId }, "Failed to write parse audit log");
  }
}

async function validateOverrideOwnership(
  userId: string,
  projectIdOverride?: string,
  contextIdOverrides?: string[],
  tagIdOverrides?: string[],
): Promise<void> {
  const checks: Promise<void>[] = [];

  if (projectIdOverride) {
    checks.push(
      db.project
        .findFirst({ where: { id: projectIdOverride, user_id: userId, deleted_at: null }, select: { id: true } })
        .then((r) => {
          if (!r) throw new Error(`Project ${projectIdOverride} not found or not owned by user`);
        }),
    );
  }

  if (contextIdOverrides?.length) {
    checks.push(
      db.context
        .findMany({ where: { id: { in: contextIdOverrides }, user_id: userId, deleted_at: null }, select: { id: true } })
        .then((rows) => {
          if (rows.length !== contextIdOverrides.length) {
            throw new Error("One or more context IDs not found or not owned by user");
          }
        }),
    );
  }

  if (tagIdOverrides?.length) {
    checks.push(
      db.tag
        .findMany({ where: { id: { in: tagIdOverrides }, user_id: userId, deleted_at: null }, select: { id: true } })
        .then((rows) => {
          if (rows.length !== tagIdOverrides.length) {
            throw new Error("One or more tag IDs not found or not owned by user");
          }
        }),
    );
  }

  await Promise.all(checks);
}

export async function captureAndCreate(
  input: CaptureCreateInput,
): Promise<CaptureCreateResult> {
  const { rawText, userId, source, projectIdOverride, contextIdOverrides, tagIdOverrides, dueDateOverride } = input;
  const start = Date.now();

  await validateOverrideOwnership(userId, projectIdOverride, contextIdOverrides, tagIdOverrides);

  const [userCtx, projectTitles] = await Promise.all([
    getUserContext(userId),
    getUserProjects(userId),
  ]);

  const tier1 = runTier1(rawText, {
    userTimezone: userCtx.timezone,
    projectTitles,
  });

  const confidence = scoreConfidence(rawText, tier1);
  const needsAi = confidence.score < userCtx.confidenceThreshold;

  const taskId = newId();

  if (!needsAi || !userCtx.aiEnabled) {
    // Both cases (high confidence OR AI disabled) use Tier-1 local parse — not degraded fallback.
    const parsed: ParsedCapture = {
      title: tier1.title ?? rawText.slice(0, 80),
      tags: tier1.tags,
      contexts: tier1.contexts,
      due_date: tier1.due_date,
      defer_date: tier1.defer_date,
      project_hint: tier1.project_hint,
      person_refs: tier1.person_refs,
      entity_refs: tier1.entity_refs,
      flagged: tier1.flagged,
      parse_tier: "local_only",
      local_confidence: confidence.score,
      basic_parse: false,
    };

    const projectId = projectIdOverride ?? await resolveProjectId(parsed.project_hint, userId);
    const durationMs = Date.now() - start;

    try {
      await db.task.create({
        data: {
          id: taskId,
          user_id: userId,
          title: parsed.title,
          notes: parsed.notes ?? (rawText.length > 80 ? rawText : undefined),
          due_date: parsed.due_date ?? dueDateOverride ?? undefined,
          defer_date: parsed.defer_date ?? undefined,
          flagged: parsed.flagged,
          project_id: projectId ?? undefined,
          status: "active",
        },
      });
    } catch (err) {
      log.error({ err, userId }, "Failed to create task in captureAndCreate (local)");
      throw err;
    }

    enqueueEnrichment(async () => {
      try {
        const allTags = [...parsed.tags];
        const allContextIds = [...(contextIdOverrides ?? [])];
        const allTagIds = [...(tagIdOverrides ?? [])];
        await Promise.all([
          linkTagsAndContexts(taskId, userId, allTags, parsed.contexts, allContextIds, allTagIds),
          db.captureParseLog.create({
            data: {
              id: newId(),
              user_id: userId,
              task_id: taskId,
              raw_text: rawText,
              parse_tier: parsed.parse_tier,
              local_confidence: confidence.score,
              ai_used: false,
              parse_duration_ms: durationMs,
              title: parsed.title,
              due_date: parsed.due_date ?? null,
              tags: parsed.tags,
              contexts: parsed.contexts,
              project_hint: parsed.project_hint ?? null,
              source,
            },
          }),
        ]);
        await writeAuditLog(userId, taskId, parsed, durationMs, source);
      } catch (err) {
        log.error({ err, taskId }, "Failed to write parse log for local-only capture");
      }
    });

    return { taskId, basic_parse: parsed.basic_parse };
  }

  const rawTitle = (tier1.title ?? rawText).slice(0, 80).replace(/\s+/g, " ").trim() || "Untitled capture";

  try {
    await db.task.create({
      data: {
        id: taskId,
        user_id: userId,
        title: rawTitle,
        notes: rawText.length > 80 ? rawText : undefined,
        status: "active",
        flagged: tier1.flagged,
        project_id: projectIdOverride ?? undefined,
        due_date: tier1.due_date ?? dueDateOverride ?? undefined,
      },
    });
  } catch (err) {
    log.error({ err, userId }, "Failed to create raw task for AI-enrichment capture");
    throw err;
  }

  if ((contextIdOverrides?.length ?? 0) > 0 || (tagIdOverrides?.length ?? 0) > 0) {
    enqueueEnrichment(async () => {
      await linkTagsAndContexts(taskId, userId, [], [], contextIdOverrides ?? [], tagIdOverrides ?? []);
    });
  }

  enqueueEnrichment(async () => {
    const enrichStart = Date.now();
    try {
      const tier2Result = await runTier2(rawText, tier1, userId);
      const parsed: ParsedCapture = tier2Result.parsed
        ? {
            ...tier2Result.parsed,
            parse_tier: "local_plus_ai",
            local_confidence: confidence.score,
            basic_parse: false,
          }
        : {
            title: tier1.title ?? rawText.slice(0, 80),
            tags: tier1.tags,
            contexts: tier1.contexts,
            due_date: tier1.due_date,
            defer_date: tier1.defer_date,
            project_hint: tier1.project_hint,
            person_refs: tier1.person_refs,
            entity_refs: tier1.entity_refs,
            flagged: tier1.flagged,
            parse_tier: "local_only",
            local_confidence: confidence.score,
            basic_parse: false,
          };

      const projectId = projectIdOverride ?? await resolveProjectId(parsed.project_hint, userId);

      await db.task.update({
        where: { id: taskId },
        data: {
          title: parsed.title,
          notes: parsed.notes ?? undefined,
          due_date: parsed.due_date ?? dueDateOverride ?? undefined,
          defer_date: parsed.defer_date ?? undefined,
          flagged: parsed.flagged,
          project_id: projectId ?? undefined,
        },
      });

      // Gate tag creation: only auto-create/apply explicit #tag syntax tags and
      // AI-suggested tags that already exist in the user's library.
      // AI-suggested tags that would require creating a new tag are stored in the
      // parse log only — the user can accept them via the suggestion UI.
      const explicitTagNames = new Set(tier1.tags.map((t) => t.toLowerCase()));
      const allParsedTagNames = parsed.tags; // explicit + AI-suggested combined

      // Load existing tag names for classification
      const aiOnlyTagNames = allParsedTagNames.filter((t) => !explicitTagNames.has(t.toLowerCase()));
      let existingTagNames = new Set<string>();

      if (aiOnlyTagNames.length > 0) {
        const existingUserTags = await db.tag.findMany({
          where: {
            user_id: userId,
            name: { in: aiOnlyTagNames.map((t) => t.toLowerCase()) },
            deleted_at: null,
          },
          select: { name: true },
        });
        existingTagNames = new Set(existingUserTags.map((t) => t.name.toLowerCase()));
      }

      const { autoApply: autoApplyTagNames, suggestedNew: suggestedNewTagNames } =
        classifyParsedTags(allParsedTagNames, explicitTagNames, existingTagNames);

      await linkTagsAndContexts(
        taskId,
        userId,
        autoApplyTagNames,
        parsed.contexts,
        contextIdOverrides ?? [],
        tagIdOverrides ?? [],
      );

      const durationMs = Date.now() - enrichStart + (Date.now() - start);

      // Store ALL tags (including suggested-new) in parse log so the suggestion UI
      // can display them. suggestedNewTagNames will appear as tags that don't yet
      // exist in the library — the UI will offer [Accept all] [Pick which] [Skip].
      await db.captureParseLog.create({
        data: {
          id: newId(),
          user_id: userId,
          task_id: taskId,
          raw_text: rawText,
          parse_tier: parsed.parse_tier,
          local_confidence: confidence.score,
          ai_used: tier2Result.parsed !== null,
          ai_model: tier2Result.aiModel ?? null,
          ai_input_tokens: tier2Result.inputTokens ?? null,
          ai_output_tokens: tier2Result.outputTokens ?? null,
          ai_cost_usd: tier2Result.costUsd ?? null,
          parse_duration_ms: durationMs,
          title: parsed.title,
          due_date: parsed.due_date ?? null,
          tags: [...autoApplyTagNames, ...suggestedNewTagNames],
          contexts: parsed.contexts,
          project_hint: parsed.project_hint ?? null,
          ai_error: tier2Result.error ?? null,
          source,
        },
      });

      await writeAuditLog(userId, taskId, parsed, durationMs, source);
    } catch (err) {
      log.error({ err, taskId, userId }, "AI enrichment job failed — task retained with Tier 1 title");
    }
  });

  return { taskId, basic_parse: false };
}

export async function previewParse(
  rawText: string,
  userId: string,
): Promise<{ parsed: ParsedCapture; durationMs: number }> {
  try {
    const [userCtx, projectTitles] = await Promise.all([
      getUserContext(userId),
      getUserProjects(userId),
    ]);

    const { parsed, durationMs } = await runPipeline(
      rawText,
      undefined,
      {
        userId,
        userTimezone: userCtx.timezone,
        confidenceThreshold: userCtx.confidenceThreshold,
        aiEnabled: userCtx.aiEnabled,
        projectTitles,
        source: "modal",
      },
      false,
    );

    return { parsed, durationMs };
  } catch (err) {
    log.error({ err, userId }, "Preview parse failed");
    return { parsed: runFallback(rawText), durationMs: 0 };
  }
}
