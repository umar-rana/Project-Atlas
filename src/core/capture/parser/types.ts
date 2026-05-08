export type ParseTier = "local_only" | "local_plus_ai" | "fallback_only";

export type CaptureSource = "modal" | "quick_add" | "email" | "api";

export type ProposedDisposition = "task" | "note" | "reference" | "unclear";

export interface ParsedCapture {
  title: string;
  notes?: string;
  tags: string[];
  contexts: string[];
  due_date?: Date;
  defer_date?: Date;
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
  defer_date?: Date;
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
