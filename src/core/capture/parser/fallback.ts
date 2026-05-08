import { detectDisposition } from "./disposition-detector";
import type { ParsedCapture } from "./types";

export function runFallback(rawText: string): ParsedCapture {
  const lines = rawText.split("\n");
  const title = (lines[0] ?? rawText).slice(0, 80).replace(/\s+/g, " ").trim();
  const bodyLines = lines.slice(1).join("\n").trim();
  const proposedBody = bodyLines.length > 0 ? bodyLines : undefined;
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
    confidence: 0,
    basic_parse: true,
    proposed_disposition: detectDisposition(rawText),
    proposed_body: proposedBody,
  };
}
