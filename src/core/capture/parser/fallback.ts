import type { ParsedCapture } from "./types";

export function runFallback(rawText: string): ParsedCapture {
  const title = rawText.slice(0, 80).replace(/\s+/g, " ").trim();
  const notes = rawText.length > 80 ? rawText : undefined;

  return {
    title,
    notes,
    tags: [],
    contexts: [],
    person_refs: [],
    entity_refs: [],
    flagged: false,
    parse_tier: "fallback_only",
    local_confidence: 0,
    basic_parse: true,
  };
}
