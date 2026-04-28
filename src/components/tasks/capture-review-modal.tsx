"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ParsedCaptureFields {
  title: string;
  notes?: string | null;
  due_date?: string | null;
  defer_date?: string | null;
  project_hint?: string | null;
  tags: string[];
  contexts: string[];
  flagged: boolean;
  parse_tier: "local_only" | "local_plus_ai" | "fallback_only";
  local_confidence: number;
  overridden_fields?: string[];
}

interface CaptureReviewModalProps {
  open: boolean;
  parsed: ParsedCaptureFields;
  onSave: (fields: ParsedCaptureFields) => void;
  onSaveAndNew: (fields: ParsedCaptureFields) => void;
  onCancel: () => void;
  confidenceThreshold?: number;
  submitting?: boolean;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return iso.split("T")[0] ?? "";
  } catch {
    return "";
  }
}

function detectOverrides(
  parsed: ParsedCaptureFields,
  edited: Omit<ParsedCaptureFields, "overridden_fields" | "parse_tier" | "local_confidence">,
): string[] {
  const changed: string[] = [];
  if (edited.title !== parsed.title) changed.push("title");
  if ((edited.due_date ?? null) !== (parsed.due_date ?? null)) changed.push("due_date");
  if ((edited.defer_date ?? null) !== (parsed.defer_date ?? null)) changed.push("defer_date");
  if ((edited.project_hint ?? "") !== (parsed.project_hint ?? "")) changed.push("project");
  if (JSON.stringify(edited.tags) !== JSON.stringify(parsed.tags)) changed.push("tags");
  if (JSON.stringify(edited.contexts) !== JSON.stringify(parsed.contexts)) changed.push("contexts");
  if (edited.flagged !== parsed.flagged) changed.push("flagged");
  if ((edited.notes ?? "") !== (parsed.notes ?? "")) changed.push("notes");
  return changed;
}

export function CaptureReviewModal({
  open,
  parsed,
  onSave,
  onSaveAndNew,
  onCancel,
  confidenceThreshold = 0.7,
  submitting = false,
}: CaptureReviewModalProps): React.ReactElement {
  const [title, setTitle] = React.useState(parsed.title);
  const [dueDate, setDueDate] = React.useState(fmtDate(parsed.due_date));
  const [deferDate, setDeferDate] = React.useState(fmtDate(parsed.defer_date));
  const [projectHint, setProjectHint] = React.useState(parsed.project_hint ?? "");
  const [tagsInput, setTagsInput] = React.useState(parsed.tags.join(", "));
  const [contextsInput, setContextsInput] = React.useState(parsed.contexts.join(", "));
  const [flagged, setFlagged] = React.useState(parsed.flagged);
  const [notes, setNotes] = React.useState(parsed.notes ?? "");

  React.useEffect(() => {
    setTitle(parsed.title);
    setDueDate(fmtDate(parsed.due_date));
    setDeferDate(fmtDate(parsed.defer_date));
    setProjectHint(parsed.project_hint ?? "");
    setTagsInput(parsed.tags.join(", "));
    setContextsInput(parsed.contexts.join(", "));
    setFlagged(parsed.flagged);
    setNotes(parsed.notes ?? "");
  }, [parsed]);

  function buildFields(): ParsedCaptureFields {
    const edited = {
      title: title.trim() || parsed.title,
      notes: notes || null,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      defer_date: deferDate ? new Date(deferDate).toISOString() : null,
      project_hint: projectHint.trim() || null,
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      contexts: contextsInput.split(",").map((c) => c.trim()).filter(Boolean),
      flagged,
    };
    const overridden_fields = detectOverrides(parsed, edited);
    return {
      ...edited,
      parse_tier: parsed.parse_tier,
      local_confidence: parsed.local_confidence,
      overridden_fields: overridden_fields.length > 0 ? overridden_fields : undefined,
    };
  }

  const tierLabel =
    parsed.parse_tier === "local_only"
      ? "Local"
      : parsed.parse_tier === "local_plus_ai"
      ? "Local + AI"
      : "AI";

  const confidencePct = (parsed.local_confidence * 100).toFixed(1);
  const isUncertain = parsed.local_confidence < confidenceThreshold;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent-info" aria-hidden />
            Review capture
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-1.5">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-2xs font-medium",
            isUncertain
              ? "bg-accent-warning/15 text-accent-warning"
              : "bg-accent-success/15 text-accent-success",
          )}>
            <Sparkles size={9} />
            Parsed via: {tierLabel} (confidence: {confidencePct}%)
          </span>
        </div>

        <div className="flex flex-col gap-3 px-4 pb-2">
          <div>
            <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </div>
            <div>
              <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Defer date</label>
              <input
                type="date"
                value={deferDate}
                onChange={(e) => setDeferDate(e.target.value)}
                className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Project (hint)</label>
            <input
              value={projectHint}
              onChange={(e) => setProjectHint(e.target.value)}
              placeholder="e.g. Work, Personal…"
              className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Tags</label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="tag1, tag2…"
                className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </div>
            <div>
              <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Contexts</label>
              <input
                value={contextsInput}
                onChange={(e) => setContextsInput(e.target.value)}
                placeholder="home, work…"
                className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-ui text-2xs font-medium text-text-secondary">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes…"
              className="w-full resize-none rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={flagged}
              onClick={() => setFlagged((v) => !v)}
              className={cn(
                "relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                flagged ? "bg-accent-warning" : "bg-border-subtle",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform",
                  flagged ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
            <span className="font-ui text-xs text-text-secondary">Flagged</span>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSaveAndNew(buildFields())}
            disabled={submitting}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save & New"}
          </button>
          <button
            type="button"
            onClick={() => onSave(buildFields())}
            disabled={submitting}
            className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
