"use client";

import * as React from "react";
import { Sparkles, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParserProposal {
  title?: string;
  due_date?: string | null;
  defer_date?: string | null;
  project_hint?: string | null;
  tags?: string[];
  contexts?: string[];
  person_refs?: string[];
  flagged?: boolean;
  parse_tier?: string;
  local_confidence?: number;
}

function deriveProposedDisposition(p: ParserProposal): { key: string; label: string } | null {
  if (p.project_hint) return { key: "project", label: "Project" };
  if (p.person_refs && p.person_refs.length > 0) return { key: "waiting", label: "Waiting For" };
  const lowerTags = (p.tags ?? []).map((t) => t.toLowerCase());
  if (lowerTags.some((t) => t === "someday" || t === "maybe")) {
    return { key: "someday", label: "Someday / Maybe" };
  }
  if (p.title || p.due_date || p.flagged) return { key: "task", label: "Task" };
  return null;
}

interface ProcessingModeCardProps {
  capture: {
    id: string;
    raw_text: string;
    title?: string | null;
    created_at: string | Date;
    migration_source?: string | null;
    ai_parsed?: boolean;
    parser_proposal?: unknown;
  };
  queuePosition: number;
  queueTotal: number;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function fmtRelativeTime(date: string | Date): string {
  try {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function ProcessingModeCard({
  capture,
  queuePosition,
  queueTotal,
}: ProcessingModeCardProps): React.ReactElement {
  const proposal = capture.parser_proposal as ParserProposal | null | undefined;
  const hasProposal = !!proposal;
  const confidencePct =
    proposal?.local_confidence != null ? (proposal.local_confidence * 100).toFixed(0) : null;
  const isAi = proposal?.parse_tier === "local_plus_ai";
  const suggestedDisposition = proposal ? deriveProposedDisposition(proposal) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-ui text-xs text-text-tertiary">
          <Inbox size={12} aria-hidden />
          <span>
            {capture.migration_source ? "Migrated" : "Captured"}{" "}
            {fmtRelativeTime(capture.created_at)}
          </span>
        </div>
        <span className="font-ui text-xs tabular-nums text-text-tertiary">
          {queuePosition} of {queueTotal}
        </span>
      </div>

      <div className="rounded-lg border border-border-default bg-surface-base px-4 py-3">
        <p className="whitespace-pre-wrap font-ui text-sm leading-relaxed text-text-primary">
          {capture.raw_text}
        </p>
      </div>

      {hasProposal && (
        <div className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles
                size={11}
                className={cn(isAi ? "text-accent-info" : "text-text-tertiary")}
                aria-hidden
              />
              <span className="font-ui text-2xs font-medium uppercase tracking-wide text-text-secondary">
                Parser hint
                {confidencePct && (
                  <span className="ml-1.5 font-normal normal-case text-text-tertiary">
                    ({isAi ? "AI" : "Local"} · {confidencePct}% confidence)
                  </span>
                )}
              </span>
            </div>
            {suggestedDisposition && (
              <span className="border-accent-primary/30 bg-accent-primary/8 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-ui text-2xs font-medium text-accent-primary">
                Suggested: {suggestedDisposition.label}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-ui text-xs">
            {proposal?.title && (
              <>
                <dt className="text-text-tertiary">Title</dt>
                <dd className="truncate text-text-primary">{proposal.title}</dd>
              </>
            )}
            {proposal?.project_hint && (
              <>
                <dt className="text-text-tertiary">Project</dt>
                <dd className="text-text-primary">{proposal.project_hint}</dd>
              </>
            )}
            {proposal?.due_date && (
              <>
                <dt className="text-text-tertiary">Due</dt>
                <dd className="text-text-primary">{fmtDate(proposal.due_date)}</dd>
              </>
            )}
            {proposal?.defer_date && (
              <>
                <dt className="text-text-tertiary">Defer</dt>
                <dd className="text-text-primary">{fmtDate(proposal.defer_date)}</dd>
              </>
            )}
            {proposal?.tags && proposal.tags.length > 0 && (
              <>
                <dt className="text-text-tertiary">Tags</dt>
                <dd className="text-text-primary">{proposal.tags.join(", ")}</dd>
              </>
            )}
            {proposal?.contexts && proposal.contexts.length > 0 && (
              <>
                <dt className="text-text-tertiary">Contexts</dt>
                <dd className="text-text-primary">{proposal.contexts.join(", ")}</dd>
              </>
            )}
            {proposal?.flagged && (
              <>
                <dt className="text-text-tertiary">Flagged</dt>
                <dd className="text-accent-warning">Yes</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {(
          [
            { key: "T", label: "Task" },
            { key: "N", label: "Note" },
            { key: "P", label: "Project" },
            { key: "D", label: "Someday" },
            { key: "W", label: "Waiting" },
            { key: "1", label: "2-min" },
            { key: "X", label: "Trash" },
          ] as const
        ).map(({ key, label }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-tertiary"
          >
            <kbd className="font-mono font-bold text-text-secondary">{key}</kbd>
            <span>{label}</span>
          </span>
        ))}
        <span className="ml-2 inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-tertiary">
          <kbd className="font-mono font-bold text-text-secondary">→</kbd>
          <span>Skip</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-tertiary">
          <kbd className="font-mono font-bold text-text-secondary">←</kbd>
          <span>Back</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-tertiary">
          <kbd className="font-mono font-bold text-text-secondary">Esc</kbd>
          <span>Exit</span>
        </span>
      </div>
    </div>
  );
}
