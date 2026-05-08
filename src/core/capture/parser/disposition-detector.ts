import type { ProposedDisposition } from "./types";

const ACTION_VERB_PATTERNS = [
  /^(call|email|send|text|ask|buy|check|reply|remind|schedule|book|pay|confirm|tell|write|finish|complete|update|review|fix|clean|pick\s*up|drop\s*off|submit|fill|order|arrange|prepare|set\s*up|follow\s*up|research|find|get|print|sign|return|cancel|renew|register|apply)\b/i,
];

const NOTE_PREFIXES = [
  /^(idea[:\s]|note[:\s]|remember[:\s]|thought[:\s]|insight[:\s]|lesson[:\s]|reference[:\s]|resource[:\s])/i,
];

const REFERENCE_PATTERNS = [
  /https?:\/\//i,
  /^(read|article|book|blog|link|watch|listen)\b/i,
  /\.(pdf|doc|docx|epub|mp4|mp3)\b/i,
];

const SOMEDAY_PATTERNS = [
  /\b(someday|maybe|one day|eventually|when i have time|if i get a chance)\b/i,
];

const WAITING_PATTERNS = [
  /\b(waiting for|waiting on|delegated to|asked .+ to|follow\s*up with)\b/i,
];

export function detectDisposition(rawText: string): ProposedDisposition {
  const text = rawText.trim();

  if (REFERENCE_PATTERNS.some((re) => re.test(text))) {
    return "reference";
  }

  if (NOTE_PREFIXES.some((re) => re.test(text))) {
    return "note";
  }

  if (SOMEDAY_PATTERNS.some((re) => re.test(text))) {
    return "unclear";
  }

  if (WAITING_PATTERNS.some((re) => re.test(text))) {
    return "unclear";
  }

  if (ACTION_VERB_PATTERNS.some((re) => re.test(text))) {
    return "task";
  }

  const wordCount = text.split(/\s+/).length;
  if (wordCount > 20) {
    return "note";
  }

  if (wordCount >= 2) {
    return "task";
  }

  return "unclear";
}
