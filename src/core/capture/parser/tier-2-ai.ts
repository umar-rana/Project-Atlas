import { complete } from "@/core/ai";
import {
  checkCaptureParseLimits,
  CAPTURE_PARSE_MODEL,
  CAPTURE_PARSE_LIMITS,
} from "@/core/ai/limits";
import {
  CAPTURE_PARSE_SYSTEM_PROMPT,
  buildCaptureParseUserMessage,
} from "@/prompts/capture-parse/v1";
import { createLogger } from "@/core/logging";
import type { PartialParse, ParsedCapture, ProposedDisposition } from "./types";

const CHARS_PER_TOKEN_ESTIMATE = 4;

const log = createLogger({ module: "capture-tier2" });

interface AiParseResult {
  proposed_disposition?: string | null;
  title?: string;
  proposed_body?: string | null;
  tags?: string[];
  context_name?: string | null;
  project_name?: string | null;
  person_refs?: string[];
  due_date?: string | null;
  due_date_has_time?: boolean | null;
  defer_date?: string | null;
  defer_date_has_time?: boolean | null;
  follow_up_date?: string | null;
  follow_up_date_has_time?: boolean | null;
  estimated_minutes?: number | null;
  flagged?: boolean;
  confidence?: number | null;
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

function isValidDisposition(v: unknown): v is ProposedDisposition {
  return v === "task" || v === "note" || v === "reference" || v === "unclear";
}

function mergeWithTier1(
  tier1: PartialParse,
  ai: AiParseResult,
  availableContextNames: string[],
  availableProjectNames: string[],
  availableTagNames: string[],
): Omit<ParsedCapture, "parse_tier" | "local_confidence" | "basic_parse"> {
  // Date+time merging (CR rule 8.3 — Tier 2 enhances; rule 8.10 — don't
  // invent times). When the AI produced a date, trust its has_time flag
  // (defaulting to false if it forgot — never to true). When Tier 1's
  // date wins, carry Tier 1's flag with it.
  const aiDueDate = ai.due_date ? new Date(ai.due_date) : undefined;
  const aiDeferDate = ai.defer_date ? new Date(ai.defer_date) : undefined;
  const aiFollowUpDate = ai.follow_up_date ? new Date(ai.follow_up_date) : undefined;

  const due_date = aiDueDate && !isNaN(aiDueDate.getTime()) ? aiDueDate : tier1.due_date;
  const due_date_has_time =
    aiDueDate && !isNaN(aiDueDate.getTime())
      ? ai.due_date_has_time === true
      : tier1.due_date_has_time;

  const defer_date = aiDeferDate && !isNaN(aiDeferDate.getTime()) ? aiDeferDate : tier1.defer_date;
  const defer_date_has_time =
    aiDeferDate && !isNaN(aiDeferDate.getTime())
      ? ai.defer_date_has_time === true
      : tier1.defer_date_has_time;

  const follow_up_date =
    aiFollowUpDate && !isNaN(aiFollowUpDate.getTime()) ? aiFollowUpDate : tier1.follow_up_date;
  const follow_up_date_has_time =
    aiFollowUpDate && !isNaN(aiFollowUpDate.getTime())
      ? ai.follow_up_date_has_time === true
      : tier1.follow_up_date_has_time;

  const normalizedAvailableTags = new Set(availableTagNames.map((t) => t.toLowerCase()));
  const normalizedAvailableContexts = availableContextNames.map((c) => ({
    lower: c.toLowerCase(),
    original: c,
  }));
  const normalizedAvailableProjects = availableProjectNames.map((p) => ({
    lower: p.toLowerCase(),
    original: p,
  }));

  const aiTags = Array.isArray(ai.tags)
    ? ai.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t && normalizedAvailableTags.has(t))
    : [];

  const tags = Array.from(new Set([...tier1.tags, ...aiTags]))
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);

  let aiContext: string | undefined;
  if (typeof ai.context_name === "string" && ai.context_name) {
    const lowerAiCtx = ai.context_name.toLowerCase();
    const match = normalizedAvailableContexts.find((c) => c.lower === lowerAiCtx);
    if (match) aiContext = match.original;
  }

  const contexts = Array.from(
    new Set([...tier1.contexts, ...(aiContext ? [aiContext] : [])]),
  )
    .map((c) => c.trim())
    .filter(Boolean);

  const person_refs = Array.from(
    new Set([
      ...tier1.person_refs,
      ...(Array.isArray(ai.person_refs)
        ? ai.person_refs.filter((p): p is string => typeof p === "string")
        : []),
    ]),
  );

  let project_hint: string | undefined = tier1.project_hint;
  if (typeof ai.project_name === "string" && ai.project_name) {
    const lowerAiProj = ai.project_name.toLowerCase();
    const match = normalizedAvailableProjects.find((p) => p.lower === lowerAiProj);
    if (match) project_hint = match.original;
  }

  const proposed_disposition: ProposedDisposition | undefined = isValidDisposition(
    ai.proposed_disposition,
  )
    ? ai.proposed_disposition
    : tier1.proposed_disposition;

  const estimated_minutes =
    typeof ai.estimated_minutes === "number" && ai.estimated_minutes > 0
      ? ai.estimated_minutes
      : tier1.estimated_minutes;

  const proposed_body =
    typeof ai.proposed_body === "string" && ai.proposed_body
      ? ai.proposed_body
      : typeof ai.notes === "string" && ai.notes
        ? ai.notes
        : undefined;

  const confidence =
    typeof ai.confidence === "number" ? Math.max(0, Math.min(1, ai.confidence)) : undefined;

  return {
    title: (typeof ai.title === "string" && ai.title.trim()
      ? ai.title.trim().slice(0, 80)
      : (tier1.title ?? "")
    ).slice(0, 80),
    notes: proposed_body,
    proposed_body,
    tags,
    contexts,
    due_date: due_date && !isNaN(due_date.getTime()) ? due_date : undefined,
    due_date_has_time:
      due_date && !isNaN(due_date.getTime()) ? (due_date_has_time ?? false) : undefined,
    defer_date: defer_date && !isNaN(defer_date.getTime()) ? defer_date : undefined,
    defer_date_has_time:
      defer_date && !isNaN(defer_date.getTime()) ? (defer_date_has_time ?? false) : undefined,
    follow_up_date:
      follow_up_date && !isNaN(follow_up_date.getTime()) ? follow_up_date : undefined,
    follow_up_date_has_time:
      follow_up_date && !isNaN(follow_up_date.getTime())
        ? (follow_up_date_has_time ?? false)
        : undefined,
    project_hint,
    person_refs,
    entity_refs: tier1.entity_refs,
    flagged: ai.flagged === true || tier1.flagged,
    proposed_disposition,
    estimated_minutes,
    confidence,
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
  availableNames?: {
    contextNames?: string[];
    projectNames?: string[];
    tagNames?: string[];
  },
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
    due_date_has_time: tier1.due_date ? (tier1.due_date_has_time ?? false) : undefined,
    defer_date: tier1.defer_date?.toISOString(),
    defer_date_has_time: tier1.defer_date ? (tier1.defer_date_has_time ?? false) : undefined,
    follow_up_date: tier1.follow_up_date?.toISOString(),
    follow_up_date_has_time: tier1.follow_up_date
      ? (tier1.follow_up_date_has_time ?? false)
      : undefined,
    project_hint: tier1.project_hint,
    person_refs: tier1.person_refs.length > 0 ? tier1.person_refs : undefined,
    proposed_disposition: tier1.proposed_disposition,
    estimated_minutes: tier1.estimated_minutes,
  };

  const cleanHints: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(hints)) {
    if (v !== undefined) cleanHints[k] = v;
  }

  const userMessage = buildCaptureParseUserMessage(rawText, cleanHints, availableNames);

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
        maxTokens: 600,
        model: CAPTURE_PARSE_MODEL,
      },
    });

    const aiParsed = safeParseAiResponse(result.content);
    if (!aiParsed) {
      log.warn({ userId }, "Tier 2 AI response could not be parsed as JSON");
      return {
        parsed: null,
        error: "AI response parse failed",
        aiModel: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      };
    }

    const merged = mergeWithTier1(
      tier1,
      aiParsed,
      availableNames?.contextNames ?? [],
      availableNames?.projectNames ?? [],
      availableNames?.tagNames ?? [],
    );
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
