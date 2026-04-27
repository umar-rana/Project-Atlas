import { complete } from "@/core/ai";
import { checkCaptureParseLimits, CAPTURE_PARSE_MODEL, CAPTURE_PARSE_LIMITS } from "@/core/ai/limits";
import {
  CAPTURE_PARSE_SYSTEM_PROMPT,
  buildCaptureParseUserMessage,
} from "@/prompts/capture-parse/v1";
import { createLogger } from "@/core/logging";
import type { PartialParse, ParsedCapture } from "./types";

const CHARS_PER_TOKEN_ESTIMATE = 4;

const log = createLogger({ module: "capture-tier2" });

interface AiParseResult {
  title?: string;
  tags?: string[];
  contexts?: string[];
  due_date?: string | null;
  defer_date?: string | null;
  project_hint?: string | null;
  person_refs?: string[];
  flagged?: boolean;
  notes?: string | null;
}

function safeParseAiResponse(content: string): AiParseResult | null {
  try {
    let json: unknown;
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      json = JSON.parse(fenceMatch[1].trim());
    } else {
      json = JSON.parse(content.trim());
    }
    if (typeof json !== "object" || json === null) return null;
    return json as AiParseResult;
  } catch {
    return null;
  }
}

function mergeWithTier1(tier1: PartialParse, ai: AiParseResult): Omit<ParsedCapture, "parse_tier" | "local_confidence" | "basic_parse"> {
  const due_date = ai.due_date
    ? new Date(ai.due_date)
    : tier1.due_date;

  const defer_date = ai.defer_date
    ? new Date(ai.defer_date)
    : tier1.defer_date;

  const tags = Array.from(
    new Set([
      ...tier1.tags,
      ...(Array.isArray(ai.tags) ? ai.tags.filter((t): t is string => typeof t === "string") : []),
    ]),
  ).map((t) => t.toLowerCase().trim()).filter(Boolean);

  const contexts = Array.from(
    new Set([
      ...tier1.contexts,
      ...(Array.isArray(ai.contexts) ? ai.contexts.filter((c): c is string => typeof c === "string") : []),
    ]),
  ).map((c) => c.trim()).filter(Boolean);

  const person_refs = Array.from(
    new Set([
      ...tier1.person_refs,
      ...(Array.isArray(ai.person_refs) ? ai.person_refs.filter((p): p is string => typeof p === "string") : []),
    ]),
  );

  return {
    title: (typeof ai.title === "string" && ai.title.trim()
      ? ai.title.trim().slice(0, 80)
      : tier1.title ?? "").slice(0, 80),
    notes: typeof ai.notes === "string" ? ai.notes : undefined,
    tags,
    contexts,
    due_date: due_date && !isNaN(due_date.getTime()) ? due_date : undefined,
    defer_date: defer_date && !isNaN(defer_date.getTime()) ? defer_date : undefined,
    project_hint: typeof ai.project_hint === "string" && ai.project_hint
      ? ai.project_hint
      : tier1.project_hint,
    person_refs,
    entity_refs: tier1.entity_refs,
    flagged: ai.flagged === true || tier1.flagged,
  };
}

export interface Tier2Result {
  parsed: Omit<ParsedCapture, "parse_tier" | "local_confidence" | "basic_parse"> | null;
  aiModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: string;
}

export async function runTier2(
  rawText: string,
  tier1: PartialParse,
  userId: string,
): Promise<Tier2Result> {
  const limitCheck = await checkCaptureParseLimits(userId);
  if (!limitCheck.allowed) {
    log.info({ userId, reason: limitCheck.reason }, "Tier 2 skipped — limit reached");
    return { parsed: null, error: limitCheck.reason };
  }

  const hints = {
    title: tier1.title,
    tags: tier1.tags.length > 0 ? tier1.tags : undefined,
    contexts: tier1.contexts.length > 0 ? tier1.contexts : undefined,
    due_date: tier1.due_date?.toISOString(),
    project_hint: tier1.project_hint,
    person_refs: tier1.person_refs.length > 0 ? tier1.person_refs : undefined,
  };

  const cleanHints: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(hints)) {
    if (v !== undefined) cleanHints[k] = v;
  }

  const userMessage = buildCaptureParseUserMessage(rawText, cleanHints);

  const estimatedInputTokens = Math.ceil(
    (CAPTURE_PARSE_SYSTEM_PROMPT.length + userMessage.length) / CHARS_PER_TOKEN_ESTIMATE,
  );
  if (estimatedInputTokens > CAPTURE_PARSE_LIMITS.maxInputTokens) {
    log.info(
      { userId, estimatedInputTokens, cap: CAPTURE_PARSE_LIMITS.maxInputTokens },
      "Tier 2 skipped — input token cap would be exceeded",
    );
    return {
      parsed: null,
      error: `Input token estimate (${estimatedInputTokens}) exceeds cap of ${CAPTURE_PARSE_LIMITS.maxInputTokens}`,
    };
  }

  try {
    const result = await complete({
      task: "capture_parse_v2",
      prompt: userMessage,
      userId,
      options: {
        systemPrompt: CAPTURE_PARSE_SYSTEM_PROMPT,
        maxTokens: 500,
        model: CAPTURE_PARSE_MODEL,
      },
    });

    const aiParsed = safeParseAiResponse(result.content);
    if (!aiParsed) {
      log.warn({ userId }, "Tier 2 AI response could not be parsed as JSON");
      return { parsed: null, error: "AI response parse failed", aiModel: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd };
    }

    const merged = mergeWithTier1(tier1, aiParsed);
    return {
      parsed: merged,
      aiModel: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err, userId }, "Tier 2 AI call failed");
    return { parsed: null, error: message };
  }
}
