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
    contextNames: ctx.contextNames,
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
    const tier2 = await runTier2(rawText, tier1, ctx.userId, {
      contextNames: ctx.contextNames,
      projectNames: ctx.projectTitles,
      tagNames: ctx.tagNames,
    });

    if (tier2.parsed) {
      parsed = {
        ...tier2.parsed,
        // Prefer tier1 proposed_body if tier2 didn't produce one
        proposed_body: tier2.parsed.proposed_body ?? tier1.proposed_body,
        // CR rule 8.3 — Tier 2 enhances, doesn't replace Tier 1. For each
        // (date, has_time) pair, prefer Tier 2 only when it produced a
        // date; otherwise carry Tier 1's value through.
        due_date: tier2.parsed.due_date ?? tier1.due_date,
        due_date_has_time: tier2.parsed.due_date
          ? tier2.parsed.due_date_has_time
          : tier1.due_date_has_time,
        defer_date: tier2.parsed.defer_date ?? tier1.defer_date,
        defer_date_has_time: tier2.parsed.defer_date
          ? tier2.parsed.defer_date_has_time
          : tier1.defer_date_has_time,
        follow_up_date: tier2.parsed.follow_up_date ?? tier1.follow_up_date,
        follow_up_date_has_time: tier2.parsed.follow_up_date
          ? tier2.parsed.follow_up_date_has_time
          : tier1.follow_up_date_has_time,
        parse_tier: "local_plus_ai",
        local_confidence: confidence.score,
        confidence: tier2.parsed.confidence ?? confidence.score,
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
        due_date_has_time: tier1.due_date_has_time,
        defer_date: tier1.defer_date,
        defer_date_has_time: tier1.defer_date_has_time,
        follow_up_date: tier1.follow_up_date,
        follow_up_date_has_time: tier1.follow_up_date_has_time,
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
    }
  } else {
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
      confidence: confidence.score,
      basic_parse: false,
      proposed_disposition: tier1.proposed_disposition,
      estimated_minutes: tier1.estimated_minutes,
      proposed_body: tier1.proposed_body,
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
