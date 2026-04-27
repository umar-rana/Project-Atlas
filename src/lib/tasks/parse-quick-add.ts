/**
 * Parse a quick-add string into structured task fields.
 *
 * Supported tokens:
 *   #tag         → adds tag name
 *   ~~ctxname    → adds context name
 *   >>project    → sets project title (resolved server-side / via id picker)
 *   today | tomorrow | next week | next monday … → due date (basic NL)
 *
 * Tokens are stripped from the title. Anything else becomes part of the title.
 */

export interface ParsedQuickAdd {
  title: string;
  tags: string[];
  contexts: string[];
  project_title?: string;
  due_date?: Date;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextDayOfWeek(target: number, from: Date = new Date()): Date {
  const start = startOfDay(from);
  const diff = (target - start.getDay() + 7) % 7 || 7;
  start.setDate(start.getDate() + diff);
  return start;
}

function parseRelativeDate(phrase: string): Date | undefined {
  const p = phrase.toLowerCase().trim();
  const today = startOfDay(new Date());
  if (p === "today") return today;
  if (p === "tomorrow") {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }
  if (p === "next week") {
    const t = new Date(today);
    t.setDate(t.getDate() + 7);
    return t;
  }
  const m = p.match(/^next (\w+)$/);
  if (m && m[1]) {
    const idx = WEEKDAYS.indexOf(m[1]);
    if (idx >= 0) return nextDayOfWeek(idx);
  }
  return undefined;
}

const NL_DATE_RE =
  /\b(today|tomorrow|next\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i;

const TAG_RE = /(^|\s)#([A-Za-z0-9][A-Za-z0-9_-]*)/g;
const CONTEXT_RE = /(^|\s)~~([A-Za-z0-9][A-Za-z0-9_\- ]*?)(?=\s|$)/g;
const PROJECT_RE = /(^|\s)>>([^#~]+?)(?=(?:\s+#|\s+~~|\s+>>|$))/g;

export function parseQuickAdd(input: string): ParsedQuickAdd {
  const tags: string[] = [];
  const contexts: string[] = [];
  let project_title: string | undefined;
  let due_date: Date | undefined;

  let working = input;

  // Tags
  for (const m of working.matchAll(TAG_RE)) {
    if (m[2]) tags.push(m[2].toLowerCase());
  }
  working = working.replace(TAG_RE, "$1").trim();

  // Contexts
  for (const m of working.matchAll(CONTEXT_RE)) {
    if (m[2]) contexts.push(m[2].trim());
  }
  working = working.replace(CONTEXT_RE, "$1").trim();

  // Project (last wins)
  for (const m of working.matchAll(PROJECT_RE)) {
    if (m[2]) project_title = m[2].trim();
  }
  working = working.replace(PROJECT_RE, "$1").trim();

  // Date
  const dm = working.match(NL_DATE_RE);
  if (dm && dm[1]) {
    const parsed = parseRelativeDate(dm[1]);
    if (parsed) {
      due_date = parsed;
      working = working.replace(NL_DATE_RE, "").trim();
    }
  }

  const title = working.replace(/\s{2,}/g, " ").trim();
  return { title, tags: Array.from(new Set(tags)), contexts: Array.from(new Set(contexts)), project_title, due_date };
}
