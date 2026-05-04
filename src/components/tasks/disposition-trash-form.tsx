"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface DispositionTrashFormProps {
  captureId: string;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DispositionTrashForm({
  captureId,
  title,
  onConfirm,
  onCancel,
}: DispositionTrashFormProps): React.ReactElement {
  const utils = trpc.useUtils();

  const mut = trpc.capture.processToTrash.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.counts.invalidate();
      onConfirm();
    },
  });

  function submit() {
    mut.mutate({ capture_id: captureId });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKey}>
      <div className="flex items-start gap-3 rounded-lg border border-accent-danger/30 bg-accent-danger/8 px-4 py-3">
        <Trash2 size={20} className="mt-0.5 shrink-0 text-accent-danger" aria-hidden />
        <div>
          <p className="font-ui text-sm font-medium text-text-primary">Discard this capture</p>
          <p className="mt-0.5 font-ui text-xs text-text-secondary">
            The capture will be marked as trashed. No task or note will be created.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-base px-4 py-3">
        <p className="font-ui text-2xs text-text-tertiary mb-1">Capture to discard</p>
        <p className="font-ui text-sm text-text-primary">{title}</p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <button type="button" onClick={onCancel} className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover">
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={mut.isPending} className="rounded-md bg-accent-danger px-3 py-1.5 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {mut.isPending ? "Discarding…" : "Trash Capture ↵"}
        </button>
      </div>
    </div>
  );
}
