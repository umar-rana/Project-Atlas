import * as chrono from "chrono-node";
import { parseQuickAdd, type ParsedQuickAdd } from "@/lib/tasks/parse-quick-add";

/**
 * Inline task parser used by the "Add a task" inputs on /tasks/* views
 * (Direct Entity Creation Routing CR §3.2).
 *
 * Wraps the existing parseQuickAdd token extractor (#tag / ~~context /
 * >>project / basic relative dates) with chrono-node for richer date
 * phrases ("in three days", "at 3pm", "next Tuesday at 9am", etc.).
 *
 * Returns:
 *   - title   — input text with all parsed tokens and date phrases stripped
 *   - tags    — array of lowercased tag names (deduped)
 *   - contexts — array of trimmed context names (deduped)
 *   - project_title — resolved last-wins from >>project syntax
 *   - due_date — Date, or undefined when nothing parseable
 *   - due_date_has_time — true iff a time-of-day was explicitly parsed
 *     (Capture Processing Refinement CR §3.4 / §3.4.9). When the date
 *     came from a quick-add token alone ("tomorrow"), this is false.
 *     When chrono confirms `isCertain("hour")`, this is true.
 *
 * Per CR rule 8.4 we never auto-create tags / contexts / projects from
 * inline syntax — callers must look up names against existing entities
 * and drop unknowns silently.
 */
export interface InlineTaskParse extends ParsedQuickAdd {
  /** CR rule 8.11 — source of truth for whether display should show time. */
  due_date_has_time?: boolean;
}

const EOD_HOUR_FOR_DATE_ONLY = 17;

function setEodIfMidnight(d: Date): Date {
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    const copy = new Date(d);
    copy.setHours(EOD_HOUR_FOR_DATE_ONLY, 0, 0, 0);
    return copy;
  }
  return d;
}

function isMidnight(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

export function parseInlineTaskText(raw: string): InlineTaskParse {
  // First pass: existing quick-add tokens (#tag / ~~context / >>project /
  // simple NL date words today|tomorrow|next monday). Quick-add date
  // tokens are date-only by definition — has_time stays false unless a
  // later pass detects an explicit time.
  const base: InlineTaskParse = parseQuickAdd(raw);
  base.due_date_has_time = false;

  const ref = new Date();

  if (!base.due_date) {
    // Second pass (no date yet): try chrono-node on the title remainder for
    // richer date+time phrases ("in three days", "next Tuesday at 9am", etc.).
    if (base.title) {
      const parsed = chrono.parse(base.title, ref, { forwardDate: true });
      const best = parsed[0];
      if (best?.start) {
        const date = best.start.date();
        if (date && !isNaN(date.getTime())) {
          // Rule 8.10 — only record has_time when chrono is certain about
          // the hour. Phrases like "tomorrow" alone (no certain hour) get
          // EOD-anchored but stay date-only for display purposes.
          const certainHour = best.start.isCertain("hour");
          base.due_date = certainHour ? date : setEodIfMidnight(date);
          base.due_date_has_time = certainHour;
          const matchedText = best.text;
          if (matchedText) {
            const idx = base.title.indexOf(matchedText);
            if (idx >= 0) {
              base.title = (
                base.title.slice(0, idx) + base.title.slice(idx + matchedText.length)
              )
                .replace(/\s{2,}/g, " ")
                .trim();
            }
          }
        }
      }
    }
  } else if (isMidnight(base.due_date) && base.title) {
    // Third pass: quick-add matched a date-only word (e.g. "tomorrow") and left
    // a time-of-day phrase in the remaining title (e.g. "at 3pm"). Run chrono
    // on the title remainder and, if it resolves an explicit time, apply that
    // time to the already-resolved date rather than falling back to EOD.
    const parsed = chrono.parse(base.title, ref, { forwardDate: true });
    const best = parsed[0];
    if (best?.start && best.start.isCertain("hour")) {
      const chronoDate = best.start.date();
      if (chronoDate && !isNaN(chronoDate.getTime())) {
        // Apply chrono's time components to the quick-add date (preserves
        // the correct calendar day from the quick-add pass).
        const upgraded = new Date(base.due_date);
        upgraded.setHours(chronoDate.getHours(), chronoDate.getMinutes(), 0, 0);
        base.due_date = upgraded;
        base.due_date_has_time = true;
        // Strip the matched time phrase from the title.
        const matchedText = best.text;
        if (matchedText) {
          const idx = base.title.indexOf(matchedText);
          if (idx >= 0) {
            base.title = (
              base.title.slice(0, idx) + base.title.slice(idx + matchedText.length)
            )
              .replace(/\s{2,}/g, " ")
              .trim();
          }
        }
      }
    } else {
      // No explicit time found — apply EOD fallback to the midnight date.
      // has_time stays false (the quick-add word was date-only).
      base.due_date = setEodIfMidnight(base.due_date);
    }
  }

  return base;
}
