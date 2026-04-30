"use client";

import * as React from "react";
import { Flag, GripVertical, CheckSquare, Unlock, ChevronRight, RefreshCw, Paperclip } from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import type { TaskRow } from "./task-list";
import { describeRule } from "@/core/recurrence/rrule-helpers";
import { RecurrenceQuickPopover } from "./recurrence-quick-popover";

interface TaskListItemProps {
  task: TaskRow;
  selected: boolean;
  isFocused: boolean;
  isMultiSelected: boolean;
  onSelect: (task: TaskRow, e: React.MouseEvent) => void;
  onMultiToggle: (task: TaskRow, e: React.MouseEvent) => void;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string) => void;
  onDrop?: (targetId: string) => void;
  inTrash?: boolean;
  perspective?: string;
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

function TaskListItemImpl({
  task,
  selected,
  isFocused,
  isMultiSelected,
  onSelect,
  onMultiToggle,
  onDragStart,
  onDragOver,
  onDrop,
  inTrash,
  perspective,
}: TaskListItemProps) {
  const utils = trpc.useUtils();
  const toggleExpandedParent = useTasksStore((s) => s.toggleExpandedParent);
  const expandedParentIds = useTasksStore((s) => s.expandedParentIds);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);

  const [editing, setEditing] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(task.title);

  React.useEffect(() => {
    setTitleDraft(task.title);
  }, [task.title]);

  const update = trpc.tasks.update.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });

  const complete = trpc.tasks.complete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.completed.invalidate();
    },
  });
  const uncomplete = trpc.tasks.uncomplete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.completed.invalidate();
    },
  });
  const del = trpc.tasks.delete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });

  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  React.useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const isCompleted = task.status === "completed";
  const due = task.due_date ? new Date(task.due_date) : null;

  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedParentIds.has(task.id);
  const isProjectView = perspective === "project";

  const checklistItems = task.checklist_items ?? [];
  const checklistTotal = checklistItems.length;
  const checklistDone = checklistItems.filter((ci) => ci.completed_at != null).length;
  const hasChecklist = checklistTotal > 0;
  const attachmentCount = task._count?.attachments ?? 0;

  const isSubtask = task.parent_id != null;
  const showParentRef =
    isSubtask &&
    task.parent != null &&
    (perspective === "today" || perspective === "flagged");

  function commitTitle() {
    setEditing(false);
    const next = titleDraft.trim();
    if (next && next !== task.title) {
      update.mutate({ id: task.id, title: next });
    } else {
      setTitleDraft(task.title);
    }
  }

  return (
    <div
      role="row"
      aria-selected={selected || isMultiSelected}
      data-task-id={task.id}
      draggable={!inTrash}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart?.(task.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(task.id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(task.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onMultiToggle(task, e);
        } else {
          onSelect(task, e);
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-2 border-b border-border-subtle px-3 py-2 transition-colors",
        "hover:bg-surface-hover",
        selected && "bg-accent-primary-subtle",
        isMultiSelected && "bg-accent-primary-subtle",
        isFocused && "ring-1 ring-inset ring-border-focus",
        task.is_blocked && "opacity-50",
        isSubtask && "pl-6",
      )}
    >
      <span className="cursor-grab text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical size={12} aria-hidden />
      </span>
      <Checkbox
        checked={isCompleted}
        onCheckedChange={(v) => {
          if (v) complete.mutate({ id: task.id });
          else uncomplete.mutate({ id: task.id });
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label={isCompleted ? "Mark task incomplete" : "Mark task complete"}
      />
      <button
        type="button"
        aria-label={task.flagged ? "Unflag task" : "Flag task"}
        aria-pressed={task.flagged}
        onClick={(e) => {
          e.stopPropagation();
          update.mutate({ id: task.id, flagged: !task.flagged });
        }}
        className={cn(
          "shrink-0 rounded-sm p-0.5 transition-colors",
          task.flagged ? "text-accent-warning" : "text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-secondary",
        )}
      >
        <Flag size={12} fill={task.flagged ? "currentColor" : "none"} />
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              } else if (e.key === "Escape") {
                setTitleDraft(task.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-sm bg-surface-base px-1 py-0.5 font-ui text-sm text-text-primary outline-none ring-1 ring-border-focus"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!inTrash) setEditing(true);
            }}
            className={cn(
              "block w-full truncate text-left font-ui text-sm",
              isCompleted ? "text-text-tertiary line-through" : "text-text-primary",
            )}
          >
            {task.title}
          </button>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 font-ui text-2xs text-text-tertiary">
          {showParentRef && (
            <span className="inline-flex items-center gap-0.5 text-text-tertiary">
              ↳ {task.parent!.title}
            </span>
          )}
          {task.is_blocked && !task.flagged && (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-surface-raised px-1 py-px font-ui text-2xs text-text-disabled">
              <Unlock size={9} />
              Waiting for earlier task
            </span>
          )}
          {task.project ? (
            <span className="inline-flex items-center gap-1 truncate rounded-sm bg-surface-raised px-1 py-px">
              {task.project.title}
            </span>
          ) : null}
          {task.contexts.map((ct) => (
            <span key={ct.context.id} className="inline-flex items-center rounded-sm bg-accent-info-muted px-1 py-px text-accent-info">
              @{ct.context.name}
            </span>
          ))}
          {task.tags.map((tg) => (
            <span key={tg.tag.id} className="inline-flex items-center rounded-sm border border-border-subtle px-1 py-px">
              #{tg.tag.name}
            </span>
          ))}
          {hasChecklist && (
            <span className="inline-flex items-center gap-0.5">
              <CheckSquare size={10} />
              {checklistDone}/{checklistTotal}
            </span>
          )}
          {attachmentCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(task, e);
              }}
              title={`${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`}
              className="inline-flex items-center gap-0.5 hover:text-text-primary"
            >
              <Paperclip size={10} />
              {attachmentCount}
            </button>
          )}
        </div>
      </div>
      {task.is_blocked && !task.flagged && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            update.mutate({ id: task.id, flagged: true });
          }}
          title="Make this task available now (bypasses sequential order)"
          aria-label="Make this task available now"
          className="shrink-0 rounded-sm p-0.5 text-text-disabled opacity-0 transition-opacity hover:text-accent-info group-hover:opacity-100"
        >
          <Unlock size={12} />
        </button>
      )}
      {task.recurrence_rule && !inTrash && (
        <span
          title={describeRule(
            task.recurrence_rule,
            (task.recurrence_anchor ?? "due_date") as "due_date" | "completion_date",
          )}
          className="shrink-0 text-accent-info"
          aria-label="Recurring task"
        >
          <RefreshCw size={10} />
        </span>
      )}
      {due ? (
        <span className={cn("shrink-0 font-ui text-2xs tabular-nums", dueColorClass(due))}>
          {dueLabel(due)}
        </span>
      ) : null}
      {!inTrash && (
        <RecurrenceQuickPopover
          taskId={task.id}
          hasRule={Boolean(task.recurrence_rule)}
          onOpenCustom={() => setSelectedTaskId(task.id)}
        />
      )}
      {isProjectView && hasSubtasks && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpandedParent(task.id);
          }}
          aria-label={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
          className="shrink-0 rounded-sm p-0.5 text-text-tertiary hover:text-text-secondary"
        >
          <ChevronRight
            size={12}
            className={cn("transition-transform", isExpanded && "rotate-90")}
          />
        </button>
      )}
      {menu && !inTrash ? (
        <div
          role="menu"
          aria-label="Task actions"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-40 rounded-sm border border-border-default bg-surface-overlay py-1 font-ui text-xs text-text-primary shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (isCompleted) uncomplete.mutate({ id: task.id });
              else complete.mutate({ id: task.id });
              setMenu(null);
            }}
            className="block w-full px-3 py-1 text-left hover:bg-surface-hover"
          >
            {isCompleted ? "Reopen task" : "Mark complete"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              update.mutate({ id: task.id, flagged: !task.flagged });
              setMenu(null);
            }}
            className="block w-full px-3 py-1 text-left hover:bg-surface-hover"
          >
            {task.flagged ? "Unflag" : "Flag"}
          </button>
          {task.is_blocked && !task.flagged ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                update.mutate({ id: task.id, flagged: true });
                setMenu(null);
              }}
              className="block w-full px-3 py-1 text-left hover:bg-surface-hover"
            >
              Make this task available now
            </button>
          ) : null}
          {task.project_id ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                update.mutate({ id: task.id, project_id: null });
                setMenu(null);
              }}
              className="block w-full px-3 py-1 text-left hover:bg-surface-hover"
            >
              Move to Inbox
            </button>
          ) : null}
          <div className="my-1 border-t border-border-subtle" />
          <label
            role="menuitem"
            className="block w-full cursor-pointer px-3 py-1 text-left hover:bg-surface-hover"
          >
            Attach file…
            <input
              type="file"
              multiple
              className="sr-only"
              onClick={(e) => e.stopPropagation()}
              onChange={async (e) => {
                setMenu(null);
                const files = Array.from(e.target.files ?? []);
                for (const file of files) {
                  const form = new FormData();
                  form.append("file", file);
                  form.append("task_id", task.id);
                  form.append("parent_type", "Task");
                  form.append("parent_id", task.id);
                  await fetch("/api/attachments/upload", { method: "POST", body: form });
                }
                utils.tasks.list.invalidate();
                utils.attachments.byTaskId.invalidate({ task_id: task.id });
                e.target.value = "";
              }}
            />
          </label>
          <div className="my-1 border-t border-border-subtle" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              del.mutate({ id: task.id });
              setMenu(null);
            }}
            className="block w-full px-3 py-1 text-left text-accent-danger hover:bg-surface-hover"
          >
            Move to trash
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const TaskListItem = React.memo(TaskListItemImpl);
