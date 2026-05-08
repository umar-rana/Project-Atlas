import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import type { Prisma } from "@prisma/client";
import { runTier1 } from "./parser/tier-1-local";
import { runTier2 } from "./parser/tier-2-ai";
import { runFallback } from "./parser/fallback";
import { scoreConfidence } from "./parser/confidence";
import { runPipeline } from "./parser/index";
import { enqueueEnrichment } from "./enrichment-queue";
import { logActivity } from "@/core/audit";
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
  captureId: string;
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
      prefs["ai_capture_enabled"] !== false && capturePrefs["ai_capture_enabled"] !== false;
    const fallbackEnabled = capturePrefs["ai_fallback_enabled"] !== false;
    const aiEnabled = masterEnabled && fallbackEnabled;
    return {
      timezone: user?.timezone ?? "UTC",
      confidenceThreshold: user?.ai_confidence_threshold ?? 0.7,
      aiEnabled,
    };
  } catch {
    return { timezone: "UTC", confidenceThreshold: 0.7, aiEnabled: true };
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

async function getUserContextNames(userId: string): Promise<string[]> {
  try {
    const contexts = await db.context.findMany({
      where: { user_id: userId, deleted_at: null },
      select: { name: true },
      take: 100,
    });
    return contexts.map((c) => c.name);
  } catch {
    return [];
  }
}

async function getUserTagNames(userId: string): Promise<string[]> {
  try {
    const tags = await db.tag.findMany({
      where: { user_id: userId, deleted_at: null },
      select: { name: true },
      orderBy: { usage_count: "desc" },
      take: 100,
    });
    return tags.map((t) => t.name);
  } catch {
    return [];
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

async function writeParseLog(
  userId: string,
  captureId: string,
  parsed: ParsedCapture,
  rawText: string,
  durationMs: number,
  source: CaptureSource,
  aiDetails?: {
    ai_used: boolean;
    ai_model?: string | null;
    ai_input_tokens?: number | null;
    ai_output_tokens?: number | null;
    ai_cost_usd?: number | null;
    ai_error?: string | null;
    allTags?: string[];
  },
): Promise<void> {
  try {
    await db.captureParseLog.create({
      data: {
        id: newId(),
        user_id: userId,
        task_id: null,
        raw_text: rawText,
        parse_tier: parsed.parse_tier,
        local_confidence: parsed.local_confidence,
        ai_used: aiDetails?.ai_used ?? false,
        ai_model: aiDetails?.ai_model ?? null,
        ai_input_tokens: aiDetails?.ai_input_tokens ?? null,
        ai_output_tokens: aiDetails?.ai_output_tokens ?? null,
        ai_cost_usd: aiDetails?.ai_cost_usd ?? null,
        parse_duration_ms: durationMs,
        title: parsed.title,
        due_date: parsed.due_date ?? null,
        tags: aiDetails?.allTags ?? parsed.tags,
        contexts: parsed.contexts,
        project_hint: parsed.project_hint ?? null,
        ai_error: aiDetails?.ai_error ?? null,
        source,
      },
    });
  } catch (err) {
    log.warn({ err, captureId }, "Failed to write parse log for capture");
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
        .findFirst({
          where: { id: projectIdOverride, user_id: userId, deleted_at: null },
          select: { id: true },
        })
        .then((r) => {
          if (!r) throw new Error(`Project ${projectIdOverride} not found or not owned by user`);
        }),
    );
  }

  if (contextIdOverrides?.length) {
    checks.push(
      db.context
        .findMany({
          where: { id: { in: contextIdOverrides }, user_id: userId, deleted_at: null },
          select: { id: true },
        })
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
        .findMany({
          where: { id: { in: tagIdOverrides }, user_id: userId, deleted_at: null },
          select: { id: true },
        })
        .then((rows) => {
          if (rows.length !== tagIdOverrides.length) {
            throw new Error("One or more tag IDs not found or not owned by user");
          }
        }),
    );
  }

  await Promise.all(checks);
}

/**
 * Create a new Capture (state=raw) from raw text and run the parser pipeline.
 * The parser result is stored in parser_proposal and the Capture transitions to
 * state=proposed. No Task is created automatically — the user processes the
 * Capture in Wave 2 (Processing mode).
 */
export async function captureAndCreate(input: CaptureCreateInput): Promise<CaptureCreateResult> {
  const { rawText, userId, source } = input;
  const start = Date.now();

  await validateOverrideOwnership(
    userId,
    input.projectIdOverride,
    input.contextIdOverrides,
    input.tagIdOverrides,
  );

  const [userCtx, projectTitles, contextNames, tagNames] = await Promise.all([
    getUserContext(userId),
    getUserProjects(userId),
    getUserContextNames(userId),
    getUserTagNames(userId),
  ]);

  const tier1 = runTier1(rawText, {
    userTimezone: userCtx.timezone,
    projectTitles,
    contextNames,
  });

  const confidence = scoreConfidence(rawText, tier1);
  const needsAi = confidence.score < userCtx.confidenceThreshold;

  const captureId = newId();

  const rawTitle = (tier1.title ?? rawText).slice(0, 80).replace(/\s+/g, " ").trim() || "Untitled";

  try {
    await db.capture.create({
      data: {
        id: captureId,
        user_id: userId,
        raw_text: rawText,
        title: rawTitle,
        tags: tier1.tags,
        due_date: tier1.due_date ?? null,
        action_items: [],
        ai_parsed: false,
        state: "raw",
      },
    });
  } catch (err) {
    log.error({ err, userId }, "Failed to create Capture record in captureAndCreate");
    throw err;
  }

  await logActivity({
    user_id: userId,
    entity_type: "Capture",
    entity_id: captureId,
    action: "capture_state_changed",
    meta: { from: null, to: "raw", source },
  });

  if (!needsAi || !userCtx.aiEnabled) {
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
      confidence: confidence.score,
      basic_parse: false,
      proposed_disposition: tier1.proposed_disposition,
      estimated_minutes: tier1.estimated_minutes,
      proposed_body: tier1.proposed_body,
    };

    const durationMs = Date.now() - start;

    enqueueEnrichment(async () => {
      try {
        await db.capture.update({
          where: { id: captureId },
          data: {
            state: "proposed",
            ai_parsed: false,
            parser_proposal: parsed as unknown as Prisma.InputJsonValue,
          },
        });

        await logActivity({
          user_id: userId,
          entity_type: "Capture",
          entity_id: captureId,
          action: "capture_state_changed",
          meta: { from: "raw", to: "proposed", parse_tier: parsed.parse_tier },
        });

        await writeParseLog(userId, captureId, parsed, rawText, durationMs, source, {
          ai_used: false,
        });
      } catch (err) {
        log.error({ err, captureId }, "Failed to finalize local-only capture as proposed");
      }
    });

    return { captureId, basic_parse: false };
  }

  enqueueEnrichment(async () => {
    const enrichStart = Date.now();
    try {
      const tier2Result = await runTier2(rawText, tier1, userId, {
        contextNames,
        projectNames: projectTitles,
        tagNames,
      });
      const parsed: ParsedCapture = tier2Result.parsed
        ? {
            ...tier2Result.parsed,
            proposed_body: tier2Result.parsed.proposed_body ?? tier1.proposed_body,
            parse_tier: "local_plus_ai",
            local_confidence: confidence.score,
            confidence: tier2Result.parsed.confidence ?? confidence.score,
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
            confidence: confidence.score,
            basic_parse: false,
            proposed_disposition: tier1.proposed_disposition,
            estimated_minutes: tier1.estimated_minutes,
            proposed_body: tier1.proposed_body,
          };

      const explicitTagNames = new Set(tier1.tags.map((t) => t.toLowerCase()));
      const allParsedTagNames = parsed.tags;
      const aiOnlyTagNames = allParsedTagNames.filter(
        (t) => !explicitTagNames.has(t.toLowerCase()),
      );
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

      const allTagsForProposal = [...autoApplyTagNames, ...suggestedNewTagNames];

      const durationMs = Date.now() - enrichStart + (Date.now() - start);

      await db.capture.update({
        where: { id: captureId },
        data: {
          state: "proposed",
          ai_parsed: tier2Result.parsed !== null,
          title: parsed.title,
          due_date: parsed.due_date ?? null,
          tags: autoApplyTagNames,
          parser_proposal: {
            ...parsed,
            tags: allTagsForProposal,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await logActivity({
        user_id: userId,
        entity_type: "Capture",
        entity_id: captureId,
        action: "capture_state_changed",
        meta: {
          from: "raw",
          to: "proposed",
          parse_tier: parsed.parse_tier,
          ai_used: tier2Result.parsed !== null,
        },
      });

      await writeParseLog(userId, captureId, parsed, rawText, durationMs, source, {
        ai_used: tier2Result.parsed !== null,
        ai_model: tier2Result.aiModel ?? null,
        ai_input_tokens: tier2Result.inputTokens ?? null,
        ai_output_tokens: tier2Result.outputTokens ?? null,
        ai_cost_usd: tier2Result.costUsd ?? null,
        ai_error: tier2Result.error ?? null,
        allTags: allTagsForProposal,
      });
    } catch (err) {
      log.error(
        { err, captureId, userId },
        "AI enrichment job failed — capture retained in raw state",
      );
      try {
        const fallbackParsed = runFallback(rawText);
        await db.capture.update({
          where: { id: captureId },
          data: {
            state: "proposed",
            parser_proposal: fallbackParsed as unknown as Prisma.InputJsonValue,
          },
        });
        await logActivity({
          user_id: userId,
          entity_type: "Capture",
          entity_id: captureId,
          action: "capture_state_changed",
          meta: { from: "raw", to: "proposed", parse_tier: "fallback_only", ai_error: String(err) },
        });
      } catch {
        // ignore secondary failure
      }
    }
  });

  return { captureId, basic_parse: false };
}

export async function previewParse(
  rawText: string,
  userId: string,
): Promise<{ parsed: ParsedCapture; durationMs: number }> {
  try {
    const [userCtx, projectTitles, contextNames, tagNames] = await Promise.all([
      getUserContext(userId),
      getUserProjects(userId),
      getUserContextNames(userId),
      getUserTagNames(userId),
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
        contextNames,
        tagNames,
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
