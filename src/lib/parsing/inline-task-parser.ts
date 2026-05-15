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
 *
 * Per CR rule 8.4 we never auto-create tags / contexts / projects from
 * inline syntax — callers must look up names against existing entities
 * and drop unknowns silently.
 */
export type InlineTaskParse = ParsedQuickAdd;

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
  // simple NL date words today|tomorrow|next monday). This already strips
  // its own matched substrings from the title.
  const base = parseQuickAdd(raw);

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
          base.due_date = setEodIfMidnight(date);
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
      base.due_date = setEodIfMidnight(base.due_date);
    }
  }

  return base;
}
