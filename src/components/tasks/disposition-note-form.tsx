"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface ParserProposal {
  title?: string;
  project_hint?: string | null;
}

interface DispositionNoteFormProps {
  captureId: string;
  rawText: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const PURPOSE_OPTIONS = [
  { value: "note", label: "Note" },
  { value: "meeting_note", label: "Meeting Note" },
  { value: "project_brief", label: "Project Brief" },
  { value: "reading_note", label: "Reading Note" },
] as const;

type Purpose = (typeof PURPOSE_OPTIONS)[number]["value"];

export function DispositionNoteForm({
  captureId,
  rawText,
  proposal,
  onConfirm,
  onCancel,
}: DispositionNoteFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery({ status: "active" }, { staleTime: 60_000 });

  const [title, setTitle] = React.useState(proposal?.title ?? rawText.slice(0, 80));
  const [purpose, setPurpose] = React.useState<Purpose>("note");
  const [projectId, setProjectId] = React.useState("");

  React.useEffect(() => {
    if (!proposal) return;
    if (proposal.title) setTitle(proposal.title);
    if (proposal.project_hint && projects.data) {
      const match = projects.data.find(
        (p) => p.title.toLowerCase() === (proposal.project_hint ?? "").toLowerCase(),
      );
      if (match) setProjectId(match.id);
    }
  }, [proposal, projects.data]);

  const mut = trpc.capture.processToNote.useMutation({
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
      purpose,
      project_id: projectId || undefined,
    });
  }

  function submitDefaults() {
    const defaultTitle = proposal?.title?.trim() ?? rawText.slice(0, 80);
    mut.mutate({
      capture_id: captureId,
      title: defaultTitle,
      purpose: "note",
      project_id: undefined,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitDefaults();
    } else if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA" && target.tagName !== "SELECT") {
        e.preventDefault();
        submit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  const inputCls =
    "w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus";
  const labelCls = "mb-1 block font-ui text-2xs font-medium text-text-secondary";

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKey}>
      <div>
        <label className={labelCls}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="Note title…"
        />
      </div>

      <div>
        <label className={labelCls}>Purpose</label>
        <div className="flex flex-wrap gap-2">
          {PURPOSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPurpose(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 font-ui text-xs transition-colors",
                purpose === opt.value
                  ? "bg-accent-primary/10 border-accent-primary text-accent-primary"
                  : "border-border-default text-text-secondary hover:bg-surface-hover",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Project (optional)</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={inputCls}
        >
          <option value="">No project</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-border-subtle bg-surface-raised px-3 py-2">
        <p className="mb-1 font-ui text-2xs text-text-tertiary">Note body (from capture)</p>
        <p className="line-clamp-4 whitespace-pre-wrap font-ui text-xs text-text-secondary">
          {rawText}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submitDefaults}
            disabled={mut.isPending}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            title="⌘↵ Accept parser defaults"
          >
            ⌘↵ Defaults
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mut.isPending || !title.trim()}
            className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {mut.isPending ? "Creating…" : "Create Note ↵"}
          </button>
        </div>
      </div>
    </div>
  );
}
