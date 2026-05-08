import type { PartialParse, LocalParseConfidence, ConfidenceSignal } from "./types";

const VAGUE_WORDS = new Set([
  "thing",
  "stuff",
  "something",
  "everything",
  "anything",
  "whatever",
  "someone",
  "somebody",
  "somehow",
  "somewhere",
]);

const ABSTRACT_WORDS = new Set([
  "mentioned",
  "talked",
  "discussed",
  "thought",
  "think",
  "feel",
  "feeling",
  "maybe",
  "perhaps",
  "possibly",
  "kinda",
  "sort of",
  "kind of",
]);

export function scoreConfidence(raw: string, partial: PartialParse): LocalParseConfidence {
  const signals: ConfidenceSignal[] = [];
  let score = 0;

  // Signal 1: Date was found (+0.30)
  if (partial.due_date || partial.defer_date) {
    signals.push({ name: "date_found", contribution: 0.3 });
    score += 0.3;
  }

  // Signal 2: Clean title quality (+0.25)
  const titleWords = (partial.title ?? "").trim().split(/\s+/).filter(Boolean);
  if (titleWords.length >= 2 && titleWords.length <= 12) {
    signals.push({ name: "title_quality", contribution: 0.25 });
    score += 0.25;
  } else if (titleWords.length === 1 && (titleWords[0]?.length ?? 0) > 3) {
    signals.push({ name: "title_quality_weak", contribution: 0.1 });
    score += 0.1;
  }

  // Signal 3: Reference tokens found (#tag, ~~ctx, >>project) (+0.15)
  const hasReferenceTokens =
    partial.tags.length > 0 || partial.contexts.length > 0 || !!partial.project_hint;
  if (hasReferenceTokens) {
    signals.push({ name: "reference_tokens", contribution: 0.15 });
    score += 0.15;
  }

  // Signal 4: Entity / verb extraction from compromise (+0.10)
  if (partial.entity_refs.length > 0) {
    signals.push({ name: "entities_found", contribution: 0.1 });
    score += 0.1;
  }

  // Signal 5: Disposition detected (+0.05)
  if (partial.proposed_disposition && partial.proposed_disposition !== "unclear") {
    signals.push({ name: "disposition_detected", contribution: 0.05 });
    score += 0.05;
  }

  // Signal 6: Estimated time found (+0.05)
  if (partial.estimated_minutes != null) {
    signals.push({ name: "estimated_time_found", contribution: 0.05 });
    score += 0.05;
  }

  // Signal 7: Vagueness penalty (-0.20 per vague word, max -0.40)
  const lowerRaw = raw.toLowerCase();
  const words = lowerRaw.split(/\W+/);
  let vagueCount = 0;
  for (const w of words) {
    if (VAGUE_WORDS.has(w)) vagueCount++;
  }
  if (vagueCount > 0) {
    const penalty = Math.min(vagueCount * 0.2, 0.4);
    signals.push({ name: "vague_words", contribution: -penalty });
    score -= penalty;
  }

  // Signal 8: Abstract / ambiguous language penalty (-0.15 per phrase, max -0.30)
  let abstractCount = 0;
  for (const phrase of ABSTRACT_WORDS) {
    if (lowerRaw.includes(phrase)) abstractCount++;
  }
  if (abstractCount > 0) {
    const penalty = Math.min(abstractCount * 0.15, 0.3);
    signals.push({ name: "abstract_language", contribution: -penalty });
    score -= penalty;
  }

  // Urgency signals boost (+0.05)
  if (partial.urgency_signals.length > 0) {
    signals.push({ name: "urgency_signals", contribution: 0.05 });
    score += 0.05;
  }

  const finalScore = Math.max(0, Math.min(1, score));
  return { score: finalScore, signals };
}
