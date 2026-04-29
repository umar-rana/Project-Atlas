"use client";

import * as React from "react";
import { ChevronRight, Flag } from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";

interface SubtaskRowSubtask {
  id: string;
  title: string;
  status: string;
  due_date: Date | string | null;
  flagged: boolean;
  estimated_minutes: number | null;
}

interface SubtaskRowProps {
  subtask: SubtaskRowSubtask;
  parentId: string;
  parentTitle: string;
  inTrash?: boolean;
  onInvalidate: () => void;
}

function dueColorClass(due: Date | null): string {
  if (!due) return "text-text-tertiary";
  if (isPast(due) && !isToday(due)) return "text-accent-danger";
  if (isToday(due)) return "text-accent-warning";
  return "text-text-tertiary";
}

function dueLabel(due: Date | null): string | null {
  if (!due) return null;
  if (isToday(due)) return "Today";
  if (isTomorrow(due)) return "Tomorrow";
  return format(due, "MMM d");
}

export function SubtaskRow({ subtask, parentId, parentTitle, inTrash, onInvalidate }: SubtaskRowProps) {
  const navigateToSubtask = useTasksStore((s) => s.navigateToSubtask);
  const utils = trpc.useUtils();

  const completeMut = trpc.tasks.complete.useMutation({ onSettled: onInvalidate });
  const uncompleteMut = trpc.tasks.uncomplete.useMutation({ onSettled: onInvalidate });
  const updateMut = trpc.tasks.update.useMutation({ onSettled: onInvalidate });

  const [editing, setEditing] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(subtask.title);

  React.useEffect(() => {
    setTitleDraft(subtask.title);
  }, [subtask.title]);

  const isCompleted = subtask.status === "completed";
  const due = subtask.due_date ? new Date(subtask.due_date) : null;

  function commitTitle() {
    setEditing(false);
    const next = titleDraft.trim();
    if (next && next !== subtask.title) {
      updateMut.mutate({ id: subtask.id, title: next });
    } else {
      setTitleDraft(subtask.title);
    }
  }

  return (
    <li className="group flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-surface-raised">
      <Checkbox
        checked={isCompleted}
        disabled={inTrash}
        onCheckedChange={(v) => {
          if (v) completeMut.mutate({ id: subtask.id });
          else uncompleteMut.mutate({ id: subtask.id });
        }}
        aria-label={isCompleted ? "Reopen subtask" : "Complete subtask"}
      />

      <button
        type="button"
        onClick={() => { if (!inTrash) updateMut.mutate({ id: subtask.id, flagged: !subtask.flagged }); }}
        aria-label={subtask.flagged ? "Unflag subtask" : "Flag subtask"}
        className={cn(
          "shrink-0 rounded-sm p-0.5 transition-colors",
          subtask.flagged
            ? "text-accent-warning"
            : "text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-secondary",
        )}
      >
        <Flag size={11} fill={subtask.flagged ? "currentColor" : "none"} />
      </button>

      {editing ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
            if (e.key === "Escape") { setTitleDraft(subtask.title); setEditing(false); }
          }}
          className="flex-1 rounded-sm bg-surface-base px-1 py-px font-ui text-xs text-text-primary outline-none ring-1 ring-border-focus"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => { if (!inTrash) setEditing(true); }}
          className={cn(
            "flex-1 truncate text-left font-ui text-xs",
            isCompleted ? "text-text-tertiary line-through" : "text-text-secondary",
          )}
        >
          {subtask.title}
        </button>
      )}

      {due && (
        <span className={cn("shrink-0 font-ui text-2xs tabular-nums", dueColorClass(due))}>
          {dueLabel(due)}
        </span>
      )}

      <button
        type="button"
        onClick={() => navigateToSubtask(subtask.id, parentId, parentTitle)}
        aria-label="Open subtask inspector"
        className="shrink-0 rounded-sm p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
      >
        <ChevronRight size={12} />
      </button>
    </li>
  );
}
