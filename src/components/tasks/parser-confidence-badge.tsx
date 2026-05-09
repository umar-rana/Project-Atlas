import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParserProposalLike {
  local_confidence?: number | null;
  proposed_disposition?: string | null;
}

const DISPOSITION_LABELS: Record<string, string> = {
  task: "Task",
  note: "Note",
  reference: "Reference",
  unclear: "Unclear",
};

type ConfidenceLevel = "high" | "medium" | "low";

function getConfidenceLevel(score: number | null | undefined): ConfidenceLevel | null {
  if (score == null) return null;
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const CONFIDENCE_CLASS: Record<ConfidenceLevel, string> = {
  high: "border-accent-success/40 bg-accent-success/10 text-accent-success",
  medium: "border-accent-warning/40 bg-accent-warning/10 text-accent-warning",
  low: "border-border-default bg-surface-raised text-text-tertiary",
};

export function isParserProposalLike(value: unknown): value is ParserProposalLike {
  return (
    value != null &&
    typeof value === "object" &&
    ("local_confidence" in value || "proposed_disposition" in value)
  );
}

export function ParserConfidenceBadge({
  proposal,
  className,
}: {
  proposal: unknown;
  className?: string;
}): React.ReactElement | null {
  if (!isParserProposalLike(proposal)) return null;
  const score = typeof proposal.local_confidence === "number" ? proposal.local_confidence : null;
  const level = getConfidenceLevel(score);
  const disposition =
    typeof proposal.proposed_disposition === "string" ? proposal.proposed_disposition : null;
  const dispoLabel =
    disposition && DISPOSITION_LABELS[disposition] ? DISPOSITION_LABELS[disposition] : null;

  if (!level && !dispoLabel) return null;

  const pct = score != null ? Math.round(score * 100) : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {level && (
        <span
          title={pct != null ? `Parser confidence: ${pct}%` : undefined}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-ui text-2xs font-medium",
            CONFIDENCE_CLASS[level],
          )}
        >
          {CONFIDENCE_LABEL[level]}
          {pct != null && <span className="opacity-70">· {pct}%</span>}
        </span>
      )}
      {dispoLabel && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent-info/40 bg-accent-info/10 px-2 py-0.5 font-ui text-2xs font-medium text-accent-info">
          <Sparkles size={9} aria-hidden />
          Suggested: {dispoLabel}
        </span>
      )}
    </div>
  );
}
