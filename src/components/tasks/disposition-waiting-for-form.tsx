"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface ParserProposal {
  title?: string;
}

interface DispositionWaitingForFormProps {
  captureId: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DispositionWaitingForForm({
  captureId,
  proposal,
  onConfirm,
  onCancel,
}: DispositionWaitingForFormProps): React.ReactElement {
  const utils = trpc.useUtils();

  const [title, setTitle] = React.useState(proposal?.title ?? "");
  const [delegatedTo, setDelegatedTo] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (proposal?.title) setTitle(proposal.title);
  }, [proposal]);

  const mut = trpc.capture.processToWaitingFor.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.counts.invalidate();
      onConfirm();
    },
  });

  function submit() {
    if (!title.trim()) return;
    mut.mutate({
      capture_id: captureId,
      title: title.trim(),
      delegated_to_text: delegatedTo || undefined,
      follow_up_date: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      notes: notes || undefined,
    });
  }

  function submitDefaults() {
    const defaultTitle = proposal?.title?.trim() ?? title.trim();
    if (!defaultTitle) return;
    mut.mutate({
      capture_id: captureId,
      title: defaultTitle,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitDefaults(); }
    else if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA") { e.preventDefault(); submit(); }
    } else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }

  const inputCls = "w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus";
  const labelCls = "mb-1 block font-ui text-2xs font-medium text-text-secondary";

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKey}>
      <div>
        <label className={labelCls}>Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Waiting for title…" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Waiting on (person)</label>
          <input value={delegatedTo} onChange={(e) => setDelegatedTo(e.target.value)} className={inputCls} placeholder="Name or description…" />
        </div>
        <div>
          <label className={labelCls}>Follow-up date</label>
          <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} placeholder="Optional notes…" />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <button type="button" onClick={onCancel} className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover">Cancel</button>
        <div className="flex gap-2">
          <button type="button" onClick={submitDefaults} disabled={mut.isPending} className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50">⌘↵ Defaults</button>
          <button type="button" onClick={submit} disabled={mut.isPending || !title.trim()} className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50">
            {mut.isPending ? "Creating…" : "Add to Waiting For ↵"}
          </button>
        </div>
      </div>
    </div>
  );
}
