"use client";

import * as React from "react";
import { Inbox, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import { TaskListItem } from "./task-list-item";
import { TaskQuickAdd } from "./task-quick-add";
import { BulkActionBar } from "./bulk-action-bar";
import { EmptyState } from "@/components/composed/empty-state";

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  flagged: boolean;
  project_id: string | null;
  parent_id: string | null;
  defer_date: Date | string | null;
  due_date: Date | string | null;
  estimated_minutes: number | null;
  contexts: { context: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string } }[];
  project: { id: string; title: string; color: string | null } | null;
  subtasks?: { id: string; status: string; title: string }[];
  is_blocked?: boolean;
}

interface TaskListProps {
  perspective: "inbox" | "today" | "flagged" | "project" | "context" | "tag" | "trash";
  projectId?: string;
  contextId?: string;
  tagName?: string;
  title: string;
  description?: string;
  enableQuickAdd?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  highlightId?: string | null;
}

export function TaskList({
  perspective,
  projectId,
  contextId,
  tagName,
  title,
  description,
  enableQuickAdd = true,
  emptyTitle = "Nothing here",
  emptyBody = "Use the quick-add bar to capture a task.",
  highlightId,
}: TaskListProps): React.ReactElement {
  const query = trpc.tasks.list.useQuery({
    perspective,
    project_id: projectId,
    context_id: contextId,
    tag_name: tagName,
    include_completed: false,
  });

  const utils = trpc.useUtils();
  const moveMut = trpc.tasks.move.useMutation({
    onSettled: () => utils.tasks.list.invalidate(),
  });

  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const selectedTaskIds = useTasksStore((s) => s.selectedTaskIds);
  const toggleSelected = useTasksStore((s) => s.toggleSelected);
  const selectMany = useTasksStore((s) => s.selectMany);
  const lastClickedId = useTasksStore((s) => s.lastClickedId);
  const clearSelection = useTasksStore((s) => s.clearSelection);
  const setLastClicked = useTasksStore((s) => s.setLastClicked);

  const [sortBy, setSortBy] = React.useState<"manual" | "due" | "title" | "flagged">("manual");

  const inboxHintsQuery = trpc.capture.inboxProjectHints.useQuery(undefined, {
    enabled: perspective === "inbox",
    staleTime: 30_000,
  });
  const projectsQuery = trpc.projects.list.useQuery({ status: "active" }, {
    enabled: perspective === "inbox",
    staleTime: 60_000,
  });
  const bulkUpdateMut = trpc.tasks.update.useMutation({
    onSettled: () => utils.tasks.list.invalidate(),
  });

  const [dismissedBulkHints, setDismissedBulkHints] = React.useState<Set<string>>(new Set());
  const [bulkFallbackProjectId, setBulkFallbackProjectId] = React.useState("");

  const bulkPrompt = React.useMemo(() => {
    if (perspective !== "inbox") return null;
    const hints = inboxHintsQuery.data ?? {};
    const hintCounts: Record<string, string[]> = {};
    for (const [taskId, hint] of Object.entries(hints)) {
      if (!hintCounts[hint]) hintCounts[hint] = [];
      hintCounts[hint].push(taskId);
    }
    for (const [hint, ids] of Object.entries(hintCounts)) {
      if (ids.length >= 4 && !dismissedBulkHints.has(hint)) {
        const project = (projectsQuery.data ?? []).find(
          (p) => p.title.toLowerCase() === hint.toLowerCase(),
        );
        return { hint, taskIds: ids, project: project ?? null };
      }
    }
    return null;
  }, [perspective, inboxHintsQuery.data, projectsQuery.data, dismissedBulkHints]);

  const highlightApplied = React.useRef(false);
  React.useEffect(() => {
    if (!highlightId || highlightApplied.current || query.isLoading) return;
    const match = (query.data as TaskRow[] | undefined)?.find((t) => t.id === highlightId);
    if (!match) return;
    highlightApplied.current = true;
    setSelectedTaskId(highlightId);
    requestAnimationFrame(() => {
      document.querySelector(`[data-task-id="${highlightId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [highlightId, query.data, query.isLoading, setSelectedTaskId]);

  const tasks = React.useMemo<TaskRow[]>(() => {
    const list = (query.data as TaskRow[] | undefined) ?? [];
    if (sortBy === "manual") return list;
    const sorted = [...list];
    if (sortBy === "due") {
      sorted.sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
    } else if (sortBy === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "flagged") {
      sorted.sort((a, b) => Number(b.flagged) - Number(a.flagged));
    }
    return sorted;
  }, [query.data, sortBy]);
  const dragId = React.useRef<string | null>(null);
  const dropTargetId = React.useRef<string | null>(null);

  const [focusedIdx, setFocusedIdx] = React.useState(0);

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (tasks.length === 0) return;

      if (e.key === "j") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(tasks.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === " " || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d")) {
        const t = tasks[focusedIdx];
        if (t) {
          e.preventDefault();
          if (t.status === "completed") {
            // uncomplete via mutate from item — keep simple via direct call
            void utils.client.tasks.uncomplete.mutate({ id: t.id }).then(() => {
              utils.tasks.list.invalidate();
              utils.tasks.counts.invalidate();
            });
          } else {
            void utils.client.tasks.complete.mutate({ id: t.id }).then(() => {
              utils.tasks.list.invalidate();
              utils.tasks.counts.invalidate();
            });
          }
        }
      } else if (e.key.toLowerCase() === "f") {
        const t = tasks[focusedIdx];
        if (t) {
          e.preventDefault();
          void utils.client.tasks.update.mutate({ id: t.id, flagged: !t.flagged }).then(() => {
            utils.tasks.list.invalidate();
          });
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        const t = tasks[focusedIdx];
        if (t) setSelectedTaskId(t.id);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [tasks, focusedIdx, utils, setSelectedTaskId]);

  function handleSelect(task: TaskRow) {
    setSelectedTaskId(task.id);
    setLastClicked(task.id);
    clearSelection();
  }

  function handleMultiToggle(task: TaskRow, e: React.MouseEvent) {
    if (e.shiftKey && lastClickedId) {
      const aIdx = tasks.findIndex((t) => t.id === lastClickedId);
      const bIdx = tasks.findIndex((t) => t.id === task.id);
      if (aIdx >= 0 && bIdx >= 0) {
        const [start, end] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        selectMany(tasks.slice(start, end + 1).map((t) => t.id));
        return;
      }
    }
    toggleSelected(task.id);
  }

  function handleDrop(targetId: string) {
    const sourceId = dragId.current;
    if (!sourceId || sourceId === targetId) return;
    const targetIdx = tasks.findIndex((t) => t.id === targetId);
    const sourceIdx = tasks.findIndex((t) => t.id === sourceId);
    if (targetIdx < 0) return;
    const beforeIdx = sourceIdx > targetIdx ? targetIdx - 1 : targetIdx;
    const afterIdx = sourceIdx > targetIdx ? targetIdx : targetIdx + 1;
    const before = tasks[beforeIdx];
    const after = tasks[afterIdx];
    moveMut.mutate({
      id: sourceId,
      before_id: before?.id ?? null,
      after_id: after?.id ?? null,
    });
    dragId.current = null;
    dropTargetId.current = null;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="min-w-0">
          {title ? (
            <h1 className="truncate font-ui text-base font-semibold text-text-primary">{title}</h1>
          ) : null}
          {description ? (
            <p className="font-ui text-2xs text-text-tertiary">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 font-ui text-2xs text-text-tertiary">
            Sort
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-sm border border-border-subtle bg-surface-base px-1 py-0.5 font-ui text-2xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-border-focus"
            >
              <option value="manual">Manual</option>
              <option value="due">Due date</option>
              <option value="title">Title</option>
              <option value="flagged">Flagged</option>
            </select>
          </label>
          <span className="font-mono text-2xs text-text-tertiary tabular-nums">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>
      </header>

      {enableQuickAdd ? (
        <TaskQuickAdd
          defaultProjectId={projectId ?? null}
          defaultContextId={contextId}
          defaultTagName={tagName}
        />
      ) : null}

      {bulkPrompt && (
        <div className="flex items-start gap-3 border-b border-accent-info/20 bg-accent-info/5 px-3 py-2.5">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-accent-info" aria-hidden />
          <p className="flex-1 font-ui text-xs text-text-primary">
            <span className="font-semibold">{bulkPrompt.taskIds.length} tasks</span> suggested for{" "}
            <span className="font-semibold">{bulkPrompt.hint}</span>.
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {bulkPrompt.project ? (
              <button
                type="button"
                onClick={() => {
                  if (!bulkPrompt.project) return;
                  for (const taskId of bulkPrompt.taskIds) {
                    bulkUpdateMut.mutate({ id: taskId, project_id: bulkPrompt.project.id });
                  }
                  setDismissedBulkHints((prev) => new Set([...prev, bulkPrompt.hint]));
                }}
                disabled={bulkUpdateMut.isPending}
                className="rounded-sm border border-accent-success/40 bg-accent-success/10 px-2 py-1 font-ui text-2xs font-medium text-accent-success hover:bg-accent-success/20 disabled:opacity-50"
              >
                Accept all
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <select
                  value={bulkFallbackProjectId}
                  onChange={(e) => setBulkFallbackProjectId(e.target.value)}
                  className="rounded border border-border-default bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
                >
                  <option value="">Choose project…</option>
                  {(projectsQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!bulkFallbackProjectId) return;
                    for (const taskId of bulkPrompt.taskIds) {
                      bulkUpdateMut.mutate({ id: taskId, project_id: bulkFallbackProjectId });
                    }
                    setBulkFallbackProjectId("");
                    setDismissedBulkHints((prev) => new Set([...prev, bulkPrompt.hint]));
                  }}
                  disabled={!bulkFallbackProjectId || bulkUpdateMut.isPending}
                  className="rounded-sm border border-accent-success/40 bg-accent-success/10 px-2 py-1 font-ui text-2xs font-medium text-accent-success hover:bg-accent-success/20 disabled:opacity-50"
                >
                  Accept all
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setDismissedBulkHints((prev) => new Set([...prev, bulkPrompt.hint]))}
              className="rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-text-tertiary hover:border-border-default"
            >
              Review individually
            </button>
            <button
              type="button"
              aria-label="Dismiss suggestion"
              onClick={() => setDismissedBulkHints((prev) => new Set([...prev, bulkPrompt.hint]))}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={<Inbox size={28} aria-hidden />} title={emptyTitle} body={emptyBody} />
        </div>
      ) : (
        <div role="grid" className="flex-1 overflow-y-auto">
          {tasks.map((task, idx) => (
            <TaskListItem
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              isFocused={focusedIdx === idx}
              isMultiSelected={selectedTaskIds.has(task.id)}
              onSelect={() => handleSelect(task)}
              onMultiToggle={(e) => handleMultiToggle(task, e)}
              onDragStart={(id) => (dragId.current = id)}
              onDragOver={(id) => (dropTargetId.current = id)}
              onDrop={(targetId) => handleDrop(targetId)}
              inTrash={perspective === "trash"}
            />
          ))}
        </div>
      )}

      <BulkActionBar />
    </div>
  );
}
