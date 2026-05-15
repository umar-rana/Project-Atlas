"use client";

import * as React from "react";
import { ChevronRight, Flag, Trash2 } from "lucide-react";
import { isPast, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useTasksStore } from "@/lib/tasks/store";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate, formatTime as localeFormatTime } from "@/core/locale/formatters";
import type { LocaleSettings } from "@/core/locale/formatters";

type TaskDetail = NonNullable<RouterOutputs["tasks"]["get"]>;

interface SubtaskRowSubtask {
  id: string;
  title: string;
  status: string;
  due_date: Date | string | null;
  due_date_has_time?: boolean;
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

function dueLabel(
  due: Date | null,
  locale: LocaleSettings,
  hasTime: boolean,
): string | null {
  if (!due) return null;
  let base: string;
  if (isToday(due)) base = "Today";
  else if (isTomorrow(due)) base = "Tomorrow";
  else base = localeFormatDate(due, locale);
  if (!hasTime) return base;
  const t = localeFormatTime(due, locale);
  return t ? `${base} at ${t}` : base;
}

export function SubtaskRow({
  subtask,
  parentId,
  parentTitle,
  inTrash,
  onInvalidate,
}: SubtaskRowProps) {
  const locale = useLocale();
  const navigateToSubtask = useTasksStore((s) => s.navigateToSubtask);
  const utils = trpc.useUtils();

  const completeMut = trpc.tasks.complete.useMutation({ onSettled: onInvalidate });
  const uncompleteMut = trpc.tasks.uncomplete.useMutation({ onSettled: onInvalidate });
  const updateMut = trpc.tasks.update.useMutation({ onSettled: onInvalidate });
  const deleteMut = trpc.tasks.delete.useMutation({
    onMutate: async () => {
      await utils.tasks.get.cancel({ id: parentId });
      const prev = utils.tasks.get.getData({ id: parentId });
      utils.tasks.get.setData(
        { id: parentId },
        (old: TaskDetail | undefined): TaskDetail | undefined => {
          if (!old) return old;
          return { ...old, subtasks: old.subtasks.filter((s) => s.id !== subtask.id) };
        },
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        utils.tasks.get.setData({ id: parentId }, ctx.prev);
      }
    },
    onSettled: onInvalidate,
  });

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
        onClick={() => {
          if (!inTrash) updateMut.mutate({ id: subtask.id, flagged: !subtask.flagged });
        }}
        aria-label={subtask.flagged ? "Unflag subtask" : "Flag subtask"}
        className={cn(
          "shrink-0 rounded-sm p-0.5 transition-colors",
          subtask.flagged
            ? "text-accent-warning"
            : "text-text-tertiary opacity-0 hover:text-text-secondary group-hover:opacity-100",
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
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
            if (e.key === "Escape") {
              setTitleDraft(subtask.title);
              setEditing(false);
            }
          }}
          className="flex-1 rounded-sm bg-surface-base px-1 py-px font-ui text-xs text-text-primary outline-none ring-1 ring-border-focus"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => {
            if (!inTrash) setEditing(true);
          }}
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
          {dueLabel(due, locale, subtask.due_date_has_time === true)}
        </span>
      )}

      {!inTrash && (
        <button
          type="button"
          onClick={() => deleteMut.mutate({ id: subtask.id })}
          aria-label="Delete subtask"
          className="shrink-0 text-text-tertiary opacity-0 transition-opacity hover:text-accent-danger group-hover:opacity-100"
        >
          <Trash2 size={11} />
        </button>
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
