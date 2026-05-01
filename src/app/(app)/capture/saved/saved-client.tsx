"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, Pencil, Trash2, X, Check, Plus, Loader2 } from "lucide-react";

type Capture = RouterOutputs["capture"]["list"][number];

function formatDateForInput(value: Date | string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateForDisplay(value: Date | string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  ).toLocaleDateString(undefined, { timeZone: "UTC" });
}

function CaptureEditForm({
  capture,
  onSave,
  onCancel,
}: {
  capture: Capture;
  onSave: (updated: Capture) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(capture.title ?? "");
  const [tagsInput, setTagsInput] = React.useState(capture.tags.join(", "));
  const [dueDate, setDueDate] = React.useState(formatDateForInput(capture.due_date));
  const [actionItems, setActionItems] = React.useState<string[]>(
    capture.action_items.length > 0 ? capture.action_items : [""],
  );

  const utils = trpc.useUtils();
  const updateMutation = trpc.capture.update.useMutation({
    onSuccess: (updated) => {
      void utils.capture.list.invalidate();
      onSave(updated);
    },
  });

  const parsedTags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const validActionItems = actionItems.filter((item) => item.trim().length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      id: capture.id,
      title: title.trim() || undefined,
      tags: parsedTags,
      due_date: dueDate ? new Date(dueDate + "T12:00:00Z").toISOString() : null,
      action_items: validActionItems,
    });
  }

  function addActionItem() {
    setActionItems((prev) => [...prev, ""]);
  }

  function updateActionItem(idx: number, value: string) {
    setActionItems((prev) => prev.map((item, i) => (i === idx ? value : item)));
  }

  function removeActionItem(idx: number) {
    setActionItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
      <div>
        <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a title…"
          className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-primary focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
          Tags <span className="font-normal text-text-tertiary">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="work, home, urgent…"
          className="w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-primary focus:outline-none"
        />
        {parsedTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {parsedTags.map((tag, i) => (
              <span
                key={i}
                className="rounded-full bg-accent-primary/10 px-2 py-0.5 font-ui text-xs text-accent-primary"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:border-accent-primary focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Action items</label>
        <div className="flex flex-col gap-1.5">
          {actionItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateActionItem(idx, e.target.value)}
                placeholder={`Action item ${idx + 1}…`}
                className="flex-1 rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-primary focus:outline-none"
              />
              {actionItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeActionItem(idx)}
                  className="rounded p-1 text-text-tertiary hover:text-accent-danger"
                  aria-label="Remove action item"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addActionItem}
            className="flex items-center gap-1 self-start rounded px-2 py-1 font-ui text-xs text-text-tertiary hover:text-text-secondary"
          >
            <Plus size={12} />
            Add item
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
        >
          {updateMutation.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={updateMutation.isPending}
          className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          Cancel
        </button>
        {updateMutation.isError && (
          <span className="font-ui text-xs text-accent-danger">
            {updateMutation.error.message}
          </span>
        )}
      </div>
    </form>
  );
}

function CaptureCard({ capture: initialCapture }: { capture: Capture }) {
  const [capture, setCapture] = React.useState(initialCapture);
  const [editing, setEditing] = React.useState(false);
  const [deleted, setDeleted] = React.useState(false);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.capture.delete.useMutation({
    onSuccess: () => {
      void utils.capture.list.invalidate();
      setDeleted(true);
    },
  });

  if (deleted) return null;

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-ui text-sm font-medium text-text-primary">
              {capture.title ?? capture.raw_text.slice(0, 80)}
            </p>
            {capture.ai_parsed && (
              <span className="shrink-0 rounded-full bg-accent-info/10 px-1.5 py-0.5 font-ui text-2xs font-medium text-accent-info">
                AI
              </span>
            )}
          </div>

          {capture.title && (
            <p className="mt-0.5 truncate font-ui text-xs text-text-tertiary">{capture.raw_text.slice(0, 100)}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {capture.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {capture.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-accent-primary/10 px-2 py-0.5 font-ui text-xs text-accent-primary"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            {capture.due_date && (
              <span className="font-ui text-xs text-text-tertiary">
                Due {formatDateForDisplay(capture.due_date)}
              </span>
            )}
            <span className="font-ui text-xs text-text-tertiary">
              {new Date(capture.created_at).toLocaleDateString()}
            </span>
          </div>

          {capture.action_items.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5">
              {capture.action_items.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-text-tertiary" />
                  <span className="font-ui text-xs text-text-secondary">{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label="Edit capture"
            className={cn(
              "rounded p-1.5 transition-colors",
              editing
                ? "bg-accent-primary/10 text-accent-primary"
                : "text-text-tertiary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate({ id: capture.id })}
            disabled={deleteMutation.isPending}
            aria-label="Delete capture"
            className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-accent-danger/10 hover:text-accent-danger disabled:opacity-50"
          >
            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {editing && (
        <CaptureEditForm
          capture={capture}
          onSave={(updated) => {
            setCapture(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

export function SavedCapturesClient(): React.ReactElement {
  const captures = trpc.capture.list.useQuery({ limit: 50 }, { staleTime: 30_000 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <a
          href="/capture/logs"
          className="flex items-center gap-1.5 font-ui text-sm text-text-tertiary hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
          Back to capture logs
        </a>
      </div>

      <h1 className="mb-2 font-ui text-xl font-semibold text-text-primary">Saved captures</h1>
      <p className="mb-6 font-ui text-sm text-text-secondary">
        Review and edit tags, due dates, and action items on your captures.
      </p>

      {captures.isLoading ? (
        <div className="flex items-center gap-2 font-ui text-sm text-text-tertiary">
          <Loader2 size={14} className="animate-spin" />
          Loading captures…
        </div>
      ) : !captures.data || captures.data.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-surface-raised p-8 text-center">
          <p className="font-ui text-sm text-text-tertiary">No saved captures yet.</p>
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Use Quick Capture (⌘⇧I) to save your first capture.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {captures.data.map((capture) => (
            <CaptureCard key={capture.id} capture={capture} />
          ))}
        </div>
      )}
    </div>
  );
}
