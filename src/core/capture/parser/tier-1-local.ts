import * as chrono from "chrono-node";
import { parseQuickAdd } from "@/lib/tasks/parse-quick-add";
import { detectDisposition } from "./disposition-detector";
import { inferContextsFromText } from "./context-mapper";
import { estimateMinutes } from "./time-hints";
import type { PartialParse } from "./types";

const EOD_HOUR = 17;

function setEodIfMidnight(d: Date): Date {
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    const copy = new Date(d);
    copy.setHours(EOD_HOUR, 0, 0, 0);
    return copy;
  }
  return d;
}

const URGENCY_KEYWORDS = [
  "asap",
  "urgent",
  "urgently",
  "critical",
  "deadline",
  "must",
  "immediately",
  "today",
  "now",
  "right away",
  "emergency",
];

const PERSON_RE = /(^|\s)@([A-Za-z][A-Za-z0-9_.-]*)/g;

function fuzzyProjectMatch(hint: string, projectTitles: string[]): string | undefined {
  if (!hint || projectTitles.length === 0) return hint || undefined;
  const lowerHint = hint.toLowerCase();
  const exact = projectTitles.find((t) => t.toLowerCase() === lowerHint);
  if (exact) return exact;
  const partial = projectTitles.find((t) => t.toLowerCase().startsWith(lowerHint));
  if (partial) return partial;
  return hint;
}

function extractPersonRefs(text: string): string[] {
  const refs: string[] = [];
  for (const m of text.matchAll(PERSON_RE)) {
    if (m[2]) refs.push(m[2]);
  }
  return refs;
}

function detectUrgency(text: string): string[] {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.filter((kw) => lower.includes(kw));
}

function extractEntitiesWithNlp(text: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nlp = require("compromise");
    const doc = nlp(text);
    const nouns: string[] = doc.nouns().out("array") as string[];
    const verbs: string[] = doc.verbs().out("array") as string[];
    return [...new Set([...nouns, ...verbs])]
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 2 && s.length < 60)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function parseDateWithChrono(
  text: string,
  timezone: string,
): { date?: Date; hasTime?: boolean; remaining: string } {
  try {
    const ref = new Date();
    const parsed = chrono.parse(text, ref, { forwardDate: true });
    if (parsed.length === 0) return { remaining: text };

    const best = parsed[0];
    if (!best) return { remaining: text };

    const date = best.start.date();
    if (!date || isNaN(date.getTime())) return { remaining: text };

    // CR §3.2.4 / rule 8.10 — `isCertain("hour")` is the source of truth
    // for whether the user actually specified a time-of-day. Phrases like
    // "tonight" / "this evening" are treated as time-bearing (chrono
    // typically marks them certain), while bare dates ("tomorrow") are not.
    let hasTime = best.start.isCertain("hour");
    let hour = best.start.get("hour");
    const minute = best.start.get("minute") ?? 0;
    const text_lower = text.toLowerCase();

    if (!hasTime) {
      // Apply a sensible fallback hour so the stored datetime renders
      // reasonably if any consumer ignores the has_time flag. The flag
      // remains false — display logic MUST gate on it (rule 8.11).
      if (text_lower.includes("morning")) {
        hour = 9;
        hasTime = true;
      } else if (text_lower.includes("afternoon")) {
        hour = 14;
        hasTime = true;
      } else if (text_lower.includes("evening") || text_lower.includes("tonight")) {
        hour = 18;
        hasTime = true;
      } else {
        hour = 17; // EOD anchor for bare dates (no time-of-day surfaced).
      }
      date.setHours(hour, minute, 0, 0);
    }

    const remaining = (text.slice(0, best.index) + text.slice(best.index + best.text.length))
      .replace(/\s{2,}/g, " ")
      .trim();

    void timezone;
    return { date, hasTime, remaining };
  } catch {
    return { remaining: text };
  }
}

export function runTier1(
  rawText: string,
  options: {
    userTimezone: string;
    projectTitles: string[];
    contextNames?: string[];
  },
): PartialParse {
  const personRefs = extractPersonRefs(rawText);
  const urgencySignals = detectUrgency(rawText);

  let textWithoutPersonRefs = rawText.replace(PERSON_RE, "$1").trim();

  const quick = parseQuickAdd(textWithoutPersonRefs);

  let workingText = quick.title;

  // Quick-add date tokens (today / tomorrow / next monday) are date-only
  // by definition — has_time stays false. Chrono may still find an
  // explicit time-of-day in the remaining text below.
  let due_date: Date | undefined = quick.due_date ? setEodIfMidnight(quick.due_date) : undefined;
  let due_date_has_time = false;

  if (!due_date) {
    const chronoResult = parseDateWithChrono(workingText, options.userTimezone);
    if (chronoResult.date) {
      due_date = chronoResult.date;
      due_date_has_time = chronoResult.hasTime ?? false;
      workingText = chronoResult.remaining;
    }
  }

  const resolvedProject = quick.project_title
    ? fuzzyProjectMatch(quick.project_title, options.projectTitles)
    : undefined;

  const entityRefs = extractEntitiesWithNlp(workingText);

  const flagged = urgencySignals.some((s) =>
    ["asap", "urgent", "urgently", "critical", "emergency"].includes(s),
  );

  const proposedDisposition = detectDisposition(rawText);

  const nlpContexts = inferContextsFromText(rawText, options.contextNames ?? []);
  const allContexts = Array.from(new Set([...quick.contexts, ...nlpContexts]));

  const estimatedMinutes = estimateMinutes(rawText);

  // proposed_body: multi-line input → body is everything after first meaningful line
  const lines = rawText.split("\n");
  const bodyLines = lines.slice(1).join("\n").trim();
  const proposedBody = bodyLines.length > 0 ? bodyLines : undefined;

  return {
    title: workingText.slice(0, 80) || rawText.slice(0, 80),
    tags: quick.tags,
    contexts: allContexts,
    due_date,
    due_date_has_time: due_date ? due_date_has_time : undefined,
    project_hint: resolvedProject,
    person_refs: personRefs,
    entity_refs: entityRefs,
    flagged,
    urgency_signals: urgencySignals,
    proposed_disposition: proposedDisposition,
    estimated_minutes: estimatedMinutes,
    proposed_body: proposedBody,
  };
}
