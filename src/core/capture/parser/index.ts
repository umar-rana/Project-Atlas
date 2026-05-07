import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { runTier1 } from "./tier-1-local";
import { runTier2 } from "./tier-2-ai";
import { scoreConfidence } from "./confidence";
import type { ParsedCapture, ParseContext } from "./types";

const log = createLogger({ module: "capture-parser" });

export interface PipelineResult {
  parsed: ParsedCapture;
  parseLogId: string | undefined;
  durationMs: number;
}

export async function runPipeline(
  rawText: string,
  taskId: string | undefined,
  ctx: ParseContext,
  persistLog = true,
): Promise<PipelineResult> {
  const start = Date.now();

  const tier1 = runTier1(rawText, {
    userTimezone: ctx.userTimezone,
    projectTitles: ctx.projectTitles,
  });

  const confidence = scoreConfidence(rawText, tier1);

  log.debug(
    { userId: ctx.userId, confidence: confidence.score, threshold: ctx.confidenceThreshold },
    "Tier 1 complete",
  );

  let parsed: ParsedCapture;
  let aiModel: string | undefined;
  let aiInputTokens: number | undefined;
  let aiOutputTokens: number | undefined;
  let aiCostUsd: number | undefined;
  let aiError: string | undefined;

  const needsAi = confidence.score < ctx.confidenceThreshold;

  if (needsAi && ctx.aiEnabled) {
    const tier2 = await runTier2(rawText, tier1, ctx.userId);

    if (tier2.parsed) {
      parsed = {
        ...tier2.parsed,
        parse_tier: "local_plus_ai",
        local_confidence: confidence.score,
        basic_parse: false,
      };
      aiModel = tier2.aiModel;
      aiInputTokens = tier2.inputTokens;
      aiOutputTokens = tier2.outputTokens;
      aiCostUsd = tier2.costUsd;
    } else {
      aiError = tier2.error;
      log.warn(
        { userId: ctx.userId, error: tier2.error },
        "Tier 2 failed, preserving Tier 1 parse",
      );
      parsed = {
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
    }
  } else {
    // Either confidence is high enough (no AI needed) or AI is disabled.
    // Both cases return Tier-1 local parse output — not a degraded fallback.
    parsed = {
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
  }

  const durationMs = Date.now() - start;

  let parseLogId: string | undefined;
  if (persistLog) {
    try {
      const logEntry = await db.captureParseLog.create({
        data: {
          id: newId(),
          user_id: ctx.userId,
          task_id: taskId ?? null,
          raw_text: rawText,
          parse_tier: parsed.parse_tier,
          local_confidence: confidence.score,
          ai_used: parsed.parse_tier === "local_plus_ai",
          ai_model: aiModel ?? null,
          ai_input_tokens: aiInputTokens ?? null,
          ai_output_tokens: aiOutputTokens ?? null,
          ai_cost_usd: aiCostUsd ?? null,
          parse_duration_ms: durationMs,
          title: parsed.title ?? null,
          due_date: parsed.due_date ?? null,
          tags: parsed.tags,
          contexts: parsed.contexts,
          project_hint: parsed.project_hint ?? null,
          ai_error: aiError ?? null,
          source: ctx.source,
        },
      });
      parseLogId = logEntry.id;
    } catch (err) {
      log.error({ err, userId: ctx.userId }, "Failed to write CaptureParseLog");
    }
  }

  return { parsed, parseLogId, durationMs };
}
