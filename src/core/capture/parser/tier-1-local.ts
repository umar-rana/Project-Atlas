import * as chrono from "chrono-node";
import { parseQuickAdd } from "@/lib/tasks/parse-quick-add";
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

function parseDateWithChrono(text: string, timezone: string): { date?: Date; remaining: string } {
  try {
    const ref = new Date();
    const parsed = chrono.parse(text, ref, { forwardDate: true });
    if (parsed.length === 0) return { remaining: text };

    const best = parsed[0];
    if (!best) return { remaining: text };

    const date = best.start.date();
    if (!date || isNaN(date.getTime())) return { remaining: text };

    let hour = best.start.get("hour");
    const minute = best.start.get("minute") ?? 0;

    if (!best.start.isCertain("hour")) {
      const text_lower = text.toLowerCase();
      if (text_lower.includes("morning")) {
        hour = 9;
      } else if (text_lower.includes("afternoon")) {
        hour = 14;
      } else if (text_lower.includes("evening") || text_lower.includes("tonight")) {
        hour = 18;
      } else {
        hour = 17;
      }
      date.setHours(hour, minute, 0, 0);
    }

    const remaining = (text.slice(0, best.index) + text.slice(best.index + best.text.length))
      .replace(/\s{2,}/g, " ")
      .trim();

    void timezone;
    return { date, remaining };
  } catch {
    return { remaining: text };
  }
}

export function runTier1(
  rawText: string,
  options: {
    userTimezone: string;
    projectTitles: string[];
  },
): PartialParse {
  const personRefs = extractPersonRefs(rawText);
  const urgencySignals = detectUrgency(rawText);

  let textWithoutPersonRefs = rawText.replace(PERSON_RE, "$1").trim();

  const quick = parseQuickAdd(textWithoutPersonRefs);

  let workingText = quick.title;

  let due_date: Date | undefined = quick.due_date ? setEodIfMidnight(quick.due_date) : undefined;

  if (!due_date) {
    const chronoResult = parseDateWithChrono(workingText, options.userTimezone);
    if (chronoResult.date) {
      due_date = chronoResult.date;
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

  return {
    title: workingText.slice(0, 80) || rawText.slice(0, 80),
    tags: quick.tags,
    contexts: quick.contexts,
    due_date,
    project_hint: resolvedProject,
    person_refs: personRefs,
    entity_refs: entityRefs,
    flagged,
    urgency_signals: urgencySignals,
  };
}
