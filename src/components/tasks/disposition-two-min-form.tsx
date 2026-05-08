"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface ParserProposal {
  title?: string;
  notes?: string | null;
  proposed_body?: string | null;
  project_hint?: string | null;
  tags?: string[];
  contexts?: string[];
  estimated_minutes?: number | null;
}

interface DispositionTwoMinFormProps {
  captureId: string;
  rawText: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function deriveTitle(proposal: ParserProposal | null | undefined, rawText: string): string {
  if (proposal?.title?.trim()) return proposal.title.trim();
  const firstLine = rawText.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 120) return firstLine;
  return rawText.slice(0, 120).trim();
}

export function DispositionTwoMinForm({
  captureId,
  rawText,
  proposal,
  onConfirm,
  onCancel,
}: DispositionTwoMinFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery({ status: "active" }, { staleTime: 60_000 });
  const tags = trpc.tags.list.useQuery({ limit: 200 }, { staleTime: 60_000 });
  const contexts = trpc.contexts.list.useQuery(undefined, { staleTime: 60_000 });

  const title = deriveTitle(proposal, rawText);

  // Resolve IDs from proposal names when reference data is available
  const projectId = React.useMemo(() => {
    if (!proposal?.project_hint || !projects.data) return undefined;
    return projects.data.find(
      (p) => p.title.toLowerCase() === (proposal.project_hint ?? "").toLowerCase(),
    )?.id;
  }, [proposal?.project_hint, projects.data]);

  const tagIds = React.useMemo(() => {
    if (!proposal?.tags || !tags.data) return [];
    return proposal.tags
      .map((tName) => tags.data.find((t) => t.name === tName.toLowerCase())?.id)
      .filter((id): id is string => !!id);
  }, [proposal?.tags, tags.data]);

  const contextIds = React.useMemo(() => {
    if (!proposal?.contexts || !contexts.data) return [];
    return proposal.contexts
      .map((cName) => contexts.data.find((c) => c.name.toLowerCase() === cName.toLowerCase())?.id)
      .filter((id): id is string => !!id);
  }, [proposal?.contexts, contexts.data]);

  const mut = trpc.capture.processToTwoMinuteDone.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.completed.invalidate();
      onConfirm();
    },
    onError: (err) => {
      const msg = err.message || "Failed to complete task. Please try again.";
      import("@/lib/toast").then(({ toast }) => toast.error(msg));
    },
  });

  function submit() {
    const finalTitle = title || rawText.slice(0, 120);
    mut.mutate({
      capture_id: captureId,
      title: finalTitle,
      notes: (proposal?.proposed_body ?? proposal?.notes) || undefined,
      project_id: projectId,
      context_ids: contextIds,
      tag_ids: tagIds,
      estimated_minutes: proposal?.estimated_minutes ?? undefined,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKey}>
      <div className="border-accent-success/30 bg-accent-success/8 flex items-start gap-3 rounded-lg border px-4 py-3">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-accent-success" aria-hidden />
        <div>
          <p className="font-ui text-sm font-medium text-text-primary">Mark as done immediately</p>
          <p className="mt-0.5 font-ui text-xs text-text-secondary">
            This takes under 2 minutes — do it now and mark complete.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-base px-4 py-3">
        <p className="mb-1 font-ui text-2xs text-text-tertiary">Task to complete</p>
        <p className="font-ui text-sm text-text-primary">{title}</p>
        {proposal?.estimated_minutes && (
          <p className="mt-1 font-ui text-2xs text-text-tertiary">
            ~{proposal.estimated_minutes} min
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={mut.isPending}
          className="rounded-md bg-accent-success px-3 py-1.5 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {mut.isPending ? "Completing…" : "Mark Complete ↵"}
        </button>
      </div>
    </div>
  );
}
