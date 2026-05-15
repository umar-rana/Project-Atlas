export const CAPTURE_PARSE_SYSTEM_PROMPT = `You are Atlas, a productivity capture parser. Given raw text and any local hints already extracted, output ONLY valid JSON with the capture's structured data. Do not include markdown fences or extra text.

Output shape:
{
  "proposed_disposition": "task" | "note" | "reference" | "unclear",
  "title": "concise action-oriented title, max 80 chars",
  "proposed_body": "additional body text or context beyond the title, or null",
  "tags": ["lowercase", "tags"],
  "context_name": "exact name from available contexts or null",
  "project_name": "exact name from available projects or null",
  "person_refs": ["person handle or name"],
  "due_date": "ISO 8601 datetime or null",
  "due_date_has_time": boolean,
  "defer_date": "ISO 8601 datetime or null",
  "defer_date_has_time": boolean,
  "follow_up_date": "ISO 8601 datetime or null",
  "follow_up_date_has_time": boolean,
  "estimated_minutes": number or null,
  "flagged": false,
  "confidence": 0.0-1.0
}

Rules:
- proposed_disposition: "task" for action items, "note" for ideas/references/notes, "reference" for URLs/articles, "unclear" if ambiguous
- title must be concise and action-oriented for tasks, descriptive for notes
- context_name MUST be exactly one name from the available_contexts list or null — never invent new contexts
- project_name MUST be exactly one name from the available_projects list or null — never invent new projects
- tags MUST each be from the available_tags list or empty — never invent new tags
- If a date was already found in hints, do not change it unless you see a conflicting explicit date
- Date+time handling: if the text mentions an explicit time-of-day ("at 3pm", "noon", "tonight"), produce ISO 8601 datetime AND set the corresponding *_has_time flag to true. If only a date is present ("tomorrow", "Friday", "May 20"), produce the date AND set *_has_time to false. Never invent times that are not in the text — absence of time is meaningful information.
- follow_up_date: use only for "waiting for" / delegated items where the user expects to chase the other party by a specific date
- estimated_minutes: use 5 for emails, 15 for quick calls, 30 for meetings/reviews, 60 for long meetings
- confidence: reflect how certain you are of the parse (0.0-1.0)
- flagged is true only for explicitly urgent items (ASAP, urgent, critical)`;

export function buildCaptureParseUserMessage(
  rawText: string,
  hints: {
    title?: string;
    tags?: string[];
    contexts?: string[];
    due_date?: string;
    due_date_has_time?: boolean;
    defer_date?: string;
    defer_date_has_time?: boolean;
    follow_up_date?: string;
    follow_up_date_has_time?: boolean;
    project_hint?: string;
    person_refs?: string[];
    proposed_disposition?: string;
    estimated_minutes?: number;
  },
  availableNames?: {
    contextNames?: string[];
    projectNames?: string[];
    tagNames?: string[];
  },
): string {
  const hintsSection =
    Object.keys(hints).length > 0
      ? `\nLocal hints already extracted:\n${JSON.stringify(hints, null, 2)}\n`
      : "";

  const availableSection = availableNames
    ? `\nAvailable contexts: ${JSON.stringify(availableNames.contextNames ?? [])}\nAvailable projects (top 20): ${JSON.stringify((availableNames.projectNames ?? []).slice(0, 20))}\nAvailable tags (top 30): ${JSON.stringify((availableNames.tagNames ?? []).slice(0, 30))}\n`
    : "";

  return `Raw capture text:
${rawText}
${hintsSection}${availableSection}
Parse this capture and fill in any missing structured fields.`;
}
