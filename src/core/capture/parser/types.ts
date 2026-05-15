export type ParseTier = "local_only" | "local_plus_ai" | "fallback_only";

export type CaptureSource = "modal" | "quick_add" | "email" | "api";

export type ProposedDisposition = "task" | "note" | "reference" | "unclear";

export interface ParsedCapture {
  title: string;
  notes?: string;
  tags: string[];
  contexts: string[];
  due_date?: Date;
  /** True iff the parser was certain the user specified a time-of-day for due_date. CR §3.4 / rule 8.11. */
  due_date_has_time?: boolean;
  defer_date?: Date;
  /** True iff time-of-day was explicit for defer_date. */
  defer_date_has_time?: boolean;
  /** Follow-up date (used by Waiting For disposition). */
  follow_up_date?: Date;
  /** True iff time-of-day was explicit for follow_up_date. */
  follow_up_date_has_time?: boolean;
  project_hint?: string;
  person_refs: string[];
  entity_refs: string[];
  flagged: boolean;
  parse_tier: ParseTier;
  local_confidence: number;
  basic_parse: boolean;
  proposed_disposition?: ProposedDisposition;
  estimated_minutes?: number;
  proposed_body?: string;
  confidence?: number;
}

export interface PartialParse {
  title?: string;
  tags: string[];
  contexts: string[];
  due_date?: Date;
  due_date_has_time?: boolean;
  defer_date?: Date;
  defer_date_has_time?: boolean;
  follow_up_date?: Date;
  follow_up_date_has_time?: boolean;
  project_hint?: string;
  person_refs: string[];
  entity_refs: string[];
  flagged: boolean;
  urgency_signals: string[];
  proposed_disposition?: ProposedDisposition;
  estimated_minutes?: number;
  proposed_body?: string;
}

export interface ConfidenceSignal {
  name: string;
  contribution: number;
}

export interface LocalParseConfidence {
  score: number;
  signals: ConfidenceSignal[];
}

export interface ParseContext {
  userId: string;
  userTimezone: string;
  confidenceThreshold: number;
  aiEnabled: boolean;
  projectTitles: string[];
  contextNames: string[];
  tagNames: string[];
  source: CaptureSource;
}
