"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface ParserProposal {
  title?: string;
}

interface DispositionTwoMinFormProps {
  captureId: string;
  rawText: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DispositionTwoMinForm({
  captureId,
  rawText,
  proposal,
  onConfirm,
  onCancel,
}: DispositionTwoMinFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const title = proposal?.title ?? rawText.slice(0, 120);

  const mut = trpc.capture.processToTwoMinuteDone.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.completed.invalidate();
      onConfirm();
    },
  });

  function submit() {
    mut.mutate({ capture_id: captureId, title: title.trim() || rawText.slice(0, 120) });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKey}>
      <div className="flex items-start gap-3 rounded-lg border border-accent-success/30 bg-accent-success/8 px-4 py-3">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-accent-success" aria-hidden />
        <div>
          <p className="font-ui text-sm font-medium text-text-primary">Mark as done immediately</p>
          <p className="mt-0.5 font-ui text-xs text-text-secondary">
            This takes under 2 minutes — do it now and mark complete.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-base px-4 py-3">
        <p className="font-ui text-2xs text-text-tertiary mb-1">Task to complete</p>
        <p className="font-ui text-sm text-text-primary">{title}</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <button type="button" onClick={onCancel} className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={mut.isPending} className="rounded-md bg-accent-success px-3 py-1.5 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {mut.isPending ? "Completing…" : "Mark Complete ↵"}
        </button>
      </div>
    </div>
  );
}
