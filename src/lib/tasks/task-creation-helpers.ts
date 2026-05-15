/**
 * View-context defaults for the "Add a task" inputs on /tasks/* views.
 * Direct Entity Creation Routing CR §3.2.3 / rule 8.8.
 *
 *   - The view supplies a default (today=due today, flagged=flagged, etc.).
 *   - The parser overrides the view's default when an explicit phrase is
 *     present in the user's text (parsed date wins over view-default date).
 *
 * Tag/context/project resolution from names → ids is the caller's job
 * because it requires a live tRPC lookup; this helper deals only with
 * deterministic per-view defaults.
 */

export interface TaskCreationDefaults {
  due_date?: Date;
  defer_date?: Date;
  flagged?: boolean;
  project_id?: string | null;
  context_ids?: string[];
  tag_ids?: string[];
}

function todayMidnightLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface ViewContext {
  /** Free-form view identifier passed from the caller, e.g. "today", "flagged". */
  perspective?: "inbox" | "today" | "tomorrow" | "flagged" | "forecast" | "project";
  /** Active project id when the user is inside a project view. */
  projectId?: string | null;
  /** Active context id when the user is filtered by context. */
  contextId?: string;
  /** Active tag name when the user is filtered by tag. */
  tagName?: string;
  /** Explicit due date for forecast columns (ISO yyyy-mm-dd). */
  forecastColumnDate?: string;
}

/**
 * Compute the defaults that should be applied to a task created from the
 * quick-add input in this view. Caller merges these with explicit parser
 * output, with parser values winning per CR rule 8.8.
 */
export function defaultsForView(view: ViewContext): TaskCreationDefaults {
  const out: TaskCreationDefaults = {};
  if (view.projectId !== undefined) out.project_id = view.projectId;
  if (view.contextId) out.context_ids = [view.contextId];

  switch (view.perspective) {
    case "today":
      out.due_date = todayMidnightLocal();
      break;
    case "tomorrow": {
      const t = todayMidnightLocal();
      t.setDate(t.getDate() + 1);
      out.due_date = t;
      break;
    }
    case "forecast":
      if (view.forecastColumnDate) {
        const d = new Date(view.forecastColumnDate);
        if (!isNaN(d.getTime())) out.due_date = d;
      }
      break;
    case "flagged":
      out.flagged = true;
      break;
    default:
      // inbox / project / unknown — no extra defaults beyond projectId / contextId.
      break;
  }

  return out;
}

/**
 * Merge view defaults with parser output, parser wins on every key
 * the parser explicitly produced.
 */
export function mergeDefaults(
  view: TaskCreationDefaults,
  parsed: TaskCreationDefaults,
): TaskCreationDefaults {
  return {
    due_date: parsed.due_date ?? view.due_date,
    defer_date: parsed.defer_date ?? view.defer_date,
    flagged: parsed.flagged ?? view.flagged,
    project_id: parsed.project_id !== undefined ? parsed.project_id : view.project_id,
    context_ids:
      parsed.context_ids && parsed.context_ids.length > 0
        ? parsed.context_ids
        : view.context_ids,
    tag_ids:
      parsed.tag_ids && parsed.tag_ids.length > 0 ? parsed.tag_ids : view.tag_ids,
  };
}
