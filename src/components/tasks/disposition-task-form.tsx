"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface ParserProposal {
  title?: string;
  due_date?: string | null;
  defer_date?: string | null;
  project_hint?: string | null;
  tags?: string[];
  contexts?: string[];
  flagged?: boolean;
  estimated_minutes?: number | null;
}

interface DispositionTaskFormProps {
  captureId: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function fmtDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return iso.split("T")[0] ?? "";
  } catch {
    return "";
  }
}

function toIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  return new Date(dateStr).toISOString();
}

export function DispositionTaskForm({
  captureId,
  proposal,
  onConfirm,
  onCancel,
}: DispositionTaskFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery({ status: "active" }, { staleTime: 60_000 });
  const contexts = trpc.contexts.list.useQuery(undefined, { staleTime: 60_000 });
  const tags = trpc.tags.list.useQuery({ limit: 200 }, { staleTime: 60_000 });

  const [title, setTitle] = React.useState(proposal?.title ?? "");
  const [projectId, setProjectId] = React.useState("");
  const [contextIds, setContextIds] = React.useState<string[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [dueDate, setDueDate] = React.useState(fmtDateInput(proposal?.due_date));
  const [deferDate, setDeferDate] = React.useState(fmtDateInput(proposal?.defer_date));
  const [estimatedMinutes, setEstimatedMinutes] = React.useState(
    proposal?.estimated_minutes != null ? String(proposal.estimated_minutes) : "",
  );
  const [flagged, setFlagged] = React.useState(proposal?.flagged ?? false);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!proposal) return;
    if (proposal.title) setTitle(proposal.title);
    if (proposal.due_date) setDueDate(fmtDateInput(proposal.due_date));
    if (proposal.defer_date) setDeferDate(fmtDateInput(proposal.defer_date));
    if (proposal.flagged) setFlagged(true);
    if (proposal.estimated_minutes != null) setEstimatedMinutes(String(proposal.estimated_minutes));
    if (proposal.project_hint && projects.data) {
      const match = projects.data.find(
        (p) => p.title.toLowerCase() === (proposal.project_hint ?? "").toLowerCase(),
      );
      if (match) setProjectId(match.id);
    }
    if (proposal.tags && tags.data) {
      const ids = proposal.tags
        .map((tName) => tags.data.find((t) => t.name === tName.toLowerCase())?.id)
        .filter((id): id is string => !!id);
      setTagIds(ids);
    }
    if (proposal.contexts && contexts.data) {
      const ids = proposal.contexts
        .map((cName) => contexts.data.find((c) => c.name.toLowerCase() === cName.toLowerCase())?.id)
        .filter((id): id is string => !!id);
      setContextIds(ids);
    }
  }, [proposal, projects.data, tags.data, contexts.data]);

  const mut = trpc.capture.processToTask.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      onConfirm();
    },
  });

  function submit() {
    if (!title.trim()) return;
    mut.mutate({
      capture_id: captureId,
      title: title.trim(),
      notes: notes || undefined,
      project_id: projectId || undefined,
      context_ids: contextIds,
      tag_ids: tagIds,
      due_date: toIso(dueDate),
      defer_date: toIso(deferDate),
      estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
      flagged,
    });
  }

  function submitDefaults() {
    const defaultTitle = proposal?.title?.trim() ?? title.trim();
    if (!defaultTitle) return;
    let defaultProjectId: string | undefined;
    if (proposal?.project_hint && projects.data) {
      const match = projects.data.find(
        (p) => p.title.toLowerCase() === (proposal.project_hint ?? "").toLowerCase(),
      );
      defaultProjectId = match?.id;
    }
    let defaultTagIds: string[] = [];
    if (proposal?.tags && tags.data) {
      defaultTagIds = proposal.tags
        .map((tName) => tags.data.find((t) => t.name === tName.toLowerCase())?.id)
        .filter((id): id is string => !!id);
    }
    let defaultContextIds: string[] = [];
    if (proposal?.contexts && contexts.data) {
      defaultContextIds = proposal.contexts
        .map((cName) => contexts.data.find((c) => c.name.toLowerCase() === cName.toLowerCase())?.id)
        .filter((id): id is string => !!id);
    }
    mut.mutate({
      capture_id: captureId,
      title: defaultTitle,
      project_id: defaultProjectId,
      context_ids: defaultContextIds,
      tag_ids: defaultTagIds,
      due_date: proposal?.due_date ?? undefined,
      defer_date: proposal?.defer_date ?? undefined,
      flagged: proposal?.flagged ?? false,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitDefaults();
    } else if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA") {
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
          placeholder="Task title…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputCls}
          >
            <option value="">Inbox (no project)</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Estimated time (mins)</label>
          <input
            type="number"
            min={0}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            className={inputCls}
            placeholder="—"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Defer date</label>
          <input
            type="date"
            value={deferDate}
            onChange={(e) => setDeferDate(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Contexts</label>
          <select
            multiple
            value={contextIds}
            onChange={(e) => setContextIds(Array.from(e.target.selectedOptions, (o) => o.value))}
            className={cn(inputCls, "h-20")}
          >
            {(contexts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tags</label>
          <select
            multiple
            value={tagIds}
            onChange={(e) => setTagIds(Array.from(e.target.selectedOptions, (o) => o.value))}
            className={cn(inputCls, "h-20")}
          >
            {(tags.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={cn(inputCls, "resize-none")}
          placeholder="Optional notes…"
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
            {mut.isPending ? "Creating…" : "Create Task ↵"}
          </button>
        </div>
      </div>
    </div>
  );
}
