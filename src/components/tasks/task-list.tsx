"use client";

import * as React from "react";
import { HelpCircle, Inbox, Keyboard, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import { useShellStore } from "@/lib/shell/store";
import { TaskListItem } from "./task-list-item";
import { TaskQuickAdd } from "./task-quick-add";
import { BulkActionBar } from "./bulk-action-bar";
import { InboxBulkCaptureBar } from "./inbox-bulk-capture-bar";
import { EmptyState } from "@/components/composed/empty-state";
import { InboxWelcomeBanner } from "./inbox-welcome-banner";
import { MigrationSummaryModal } from "./migration-summary-modal";
import { formatEstimatedTime, sumEstimatedMinutes } from "@/core/aggregation/time-format";
import { useMidnightRefresh } from "@/hooks/use-midnight-refresh";

interface TaskListItemWithSubtasksProps {
  task: TaskRow;
  idx: number;
  selectedTaskId: string | null;
  focusedIdx: number;
  selectedTaskIds: Set<string>;
  onSelect: (task: TaskRow, e: React.MouseEvent) => void;
  onMultiToggle: (task: TaskRow, e: React.MouseEvent) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (targetId: string) => void;
  perspective: string;
  quickActionsFocusedTaskId: string | null;
  onDismissQuickActions: () => void;
}

const TaskListItemWithSubtasks = React.memo(function TaskListItemWithSubtasks({
  task,
  idx,
  selectedTaskId,
  focusedIdx,
  selectedTaskIds,
  onSelect,
  onMultiToggle,
  onDragStart,
  onDragOver,
  onDrop,
  perspective,
  quickActionsFocusedTaskId,
  onDismissQuickActions,
}: TaskListItemWithSubtasksProps) {
  const expandedParentIds = useTasksStore((s) => s.expandedParentIds);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const isExpanded = expandedParentIds.has(task.id);
  const isProjectView = perspective === "project";
  const subtasks = task.subtasks ?? [];

  return (
    <>
      <TaskListItem
        task={task}
        selected={selectedTaskId === task.id}
        isFocused={focusedIdx === idx}
        isMultiSelected={selectedTaskIds.has(task.id)}
        onSelect={onSelect}
        onMultiToggle={onMultiToggle}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        inTrash={perspective === "trash"}
        perspective={perspective}
        quickActionsFocused={quickActionsFocusedTaskId === task.id}
        onDismissQuickActions={onDismissQuickActions}
      />
      {isProjectView && isExpanded && subtasks.length > 0 && subtasks.map((st) => {
        const subtaskRow: TaskRow = {
          id: st.id,
          title: st.title,
          notes: null,
          status: st.status,
          flagged: st.flagged ?? false,
          project_id: task.project_id,
          parent_id: task.id,
          defer_date: null,
          due_date: st.due_date ?? null,
          estimated_minutes: st.estimated_minutes ?? null,
          contexts: [],
          tags: [],
          project: task.project,
          parent: { id: task.id, title: task.title },
          subtasks: [],
          checklist_items: [],
          is_blocked: false,
        };
        return (
          <TaskListItem
            key={st.id}
            task={subtaskRow}
            selected={selectedTaskId === st.id}
            isFocused={false}
            isMultiSelected={selectedTaskIds.has(st.id)}
            onSelect={(t, e) => {
              setSelectedTaskId(t.id);
            }}
            onMultiToggle={onMultiToggle}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            inTrash={false}
            perspective={perspective}
          />
        );
      })}
    </>
  );
});

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
  tags: { tag: { id: string; name: string; color: string | null } }[];
  project: { id: string; title: string; color: string | null } | null;
  parent?: { id: string; title: string } | null;
  subtasks?: {
    id: string;
    status: string;
    title: string;
    due_date?: Date | string | null;
    flagged?: boolean;
    estimated_minutes?: number | null;
  }[];
  checklist_items?: {
    id: string;
    title: string;
    completed_at: Date | string | null;
    position: string | number | { toString(): string };
  }[];
  _count?: { attachments?: number };
  is_blocked?: boolean;
  recurrence_rule?: string | null;
  recurrence_anchor?: string | null;
  /** Discriminator — present and set to 'capture' for inbox Capture rows */
  entity_type?: "task" | "capture";
  /** State of the Capture (raw | proposed) — only present when entity_type === 'capture' */
  capture_state?: string;
  created_at?: Date | string;
}

interface TaskListProps {
  perspective: "inbox" | "today" | "tomorrow" | "flagged" | "project" | "context" | "tag" | "trash";
  projectId?: string;
  contextId?: string;
  tagName?: string;
  defaultDueDate?: string;
  title: string;
  description?: string;
  enableQuickAdd?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  highlightId?: string | null;
  headerExtra?: React.ReactNode;
}

export function TaskList({
  perspective,
  projectId,
  contextId,
  tagName,
  defaultDueDate,
  title,
  description,
  enableQuickAdd = true,
  emptyTitle = "Nothing here",
  emptyBody = "Use the quick-add bar to capture a task.",
  highlightId,
  headerExtra,
}: TaskListProps): React.ReactElement {
  const [showDeferred, setShowDeferred] = React.useState(false);

  // Compute once — calling new Date().getTimezoneOffset() inline creates a new
  // object on every render, making the React Query cache key unstable.
  const timezoneOffset = React.useMemo(() => new Date().getTimezoneOffset(), []);

  const query = trpc.tasks.list.useQuery({
    perspective,
    project_id: projectId,
    context_id: contextId,
    tag_name: tagName,
    include_completed: false,
    include_deferred: perspective === "project" ? showDeferred : undefined,
    timezoneOffset,
  });

  const deferredCountQuery = trpc.tasks.countDeferred.useQuery(
    { project_id: projectId! },
    { enabled: perspective === "project" && !!projectId && !showDeferred, staleTime: 30_000 },
  );

  const utils = trpc.useUtils();

  const isMidnightPerspective = perspective === "today" || perspective === "tomorrow";
  const handleMidnight = React.useCallback(() => {
    utils.tasks.list.invalidate();
  }, [utils]);
  useMidnightRefresh(handleMidnight, isMidnightPerspective);

  const moveMut = trpc.tasks.move.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.capture.listInbox.invalidate();
    },
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

  const setShortcutsOverlayOpen = useShellStore((s) => s.setShortcutsOverlayOpen);

  const [hasFinePointer, setHasFinePointer] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setHasFinePointer(mq.matches);
    const handler = (e: MediaQueryListEvent) => setHasFinePointer(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const inboxCapturesQuery = trpc.capture.listInbox.useQuery(
    { limit: 200 },
    { enabled: perspective === "inbox", staleTime: 15_000 },
  );

  const migrationSummaryQuery = trpc.capture.getMigrationSummary.useQuery(undefined, {
    enabled: perspective === "inbox",
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const dismissMigration = trpc.capture.dismissMigrationSummary.useMutation();
  const [migrationModalDismissed, setMigrationModalDismissed] = React.useState(false);

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
    const rawList = (query.data as TaskRow[] | undefined) ?? [];

    let list: TaskRow[];
    if (perspective === "inbox") {
      type RawCapture = { id: string; title: string | null; raw_text: string | null; due_date: string | null; state: string; created_at: string };
      const captureData = (inboxCapturesQuery.data ?? []) as unknown as RawCapture[];
      const captureRows: TaskRow[] = captureData.map((c) => ({
        id: c.id,
        title: c.title ?? c.raw_text ?? "(untitled capture)",
        notes: null,
        status: "active",
        flagged: false,
        project_id: null,
        parent_id: null,
        defer_date: null,
        due_date: c.due_date ?? null,
        estimated_minutes: null,
        contexts: [],
        tags: [],
        project: null,
        created_at: c.created_at,
        entity_type: "capture" as const,
        capture_state: c.state,
      }));
      const taskRows: TaskRow[] = rawList.map((t) => ({ ...t, entity_type: "task" as const }));
      const combined = [...captureRows, ...taskRows];
      combined.sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bd - ad;
      });
      list = combined;
    } else {
      list = rawList;
    }

    const now = new Date();
    const annotated = showDeferred && perspective === "project"
      ? list.map((t) => {
          const d = t.defer_date ? new Date(t.defer_date) : null;
          if (d && d > now) return { ...t, is_blocked: true };
          return t;
        })
      : list;
    if (sortBy === "manual") return annotated;
    const sorted = [...annotated];
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
  }, [query.data, inboxCapturesQuery.data, sortBy, showDeferred, perspective]);
  const dragId = React.useRef<string | null>(null);
  const dropTargetId = React.useRef<string | null>(null);

  const [focusedIdx, setFocusedIdx] = React.useState(0);
  const [quickActionsFocusedTaskId, setQuickActionsFocusedTaskId] = React.useState<string | null>(null);

  // Keep mutable refs so the keyboard handler always reads the latest values
  // without being torn down and re-registered on every data refresh.
  const focusedIdxRef = React.useRef(focusedIdx);
  focusedIdxRef.current = focusedIdx;
  const quickActionsFocusedTaskIdRef = React.useRef(quickActionsFocusedTaskId);
  quickActionsFocusedTaskIdRef.current = quickActionsFocusedTaskId;

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (target?.tagName === "BUTTON" || target?.tagName === "SELECT" || target?.tagName === "A") return;

      const currentTasks = tasksRef.current;
      const currentFocusedIdx = focusedIdxRef.current;
      const currentQuickActionsId = quickActionsFocusedTaskIdRef.current;

      if (currentTasks.length === 0) return;

      if (e.key === "j") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(currentTasks.length - 1, i + 1));
        if (currentQuickActionsId) {
          setQuickActionsFocusedTaskId(null);
        }
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
        if (currentQuickActionsId) {
          setQuickActionsFocusedTaskId(null);
        }
      } else if (e.key === ".") {
        const t = currentTasks[currentFocusedIdx];
        if (t) {
          e.preventDefault();
          setQuickActionsFocusedTaskId(t.id);
        }
      } else if (e.key === "Escape") {
        if (currentQuickActionsId) {
          e.preventDefault();
          setQuickActionsFocusedTaskId(null);
        }
      } else if (e.key === " " || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d")) {
        const t = currentTasks[currentFocusedIdx];
        if (t && t.entity_type !== "capture") {
          e.preventDefault();
          if (t.status === "completed") {
            void utils.client.tasks.uncomplete.mutate({ id: t.id }).then(() => {
              utils.tasks.list.invalidate();
              utils.tasks.counts.invalidate();
              utils.tasks.completed.invalidate();
            });
          } else {
            void utils.client.tasks.complete.mutate({ id: t.id }).then(() => {
              utils.tasks.list.invalidate();
              utils.tasks.counts.invalidate();
              utils.tasks.completed.invalidate();
            });
          }
        }
      } else if (e.key.toLowerCase() === "f") {
        const t = currentTasks[currentFocusedIdx];
        if (t && t.entity_type !== "capture") {
          e.preventDefault();
          void utils.client.tasks.update.mutate({ id: t.id, flagged: !t.flagged }).then(() => {
            utils.tasks.list.invalidate();
          });
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        const t = currentTasks[currentFocusedIdx];
        if (t) setSelectedTaskId(t.id);
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const t = currentTasks[currentFocusedIdx];
        if (t) {
          e.preventDefault();
          setSelectedTaskId(t.id);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // Intentionally empty deps: handler reads all dynamic values via refs.
    // Re-registering only happens on mount/unmount, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = React.useCallback((task: TaskRow) => {
    setSelectedTaskId(task.id);
    setLastClicked(task.id);
    clearSelection();
  }, [setSelectedTaskId, setLastClicked, clearSelection]);

  // Read latest tasks/lastClicked from refs so the callback identity stays
  // stable across renders. Otherwise React.memo on TaskListItem can never
  // skip a render because this prop would change every time.
  const tasksRef = React.useRef(tasks);
  tasksRef.current = tasks;
  const lastClickedRef = React.useRef(lastClickedId);
  lastClickedRef.current = lastClickedId;

  const handleMultiToggle = React.useCallback((task: TaskRow, e: React.MouseEvent) => {
    const currentTasks = tasksRef.current;
    const currentLastClicked = lastClickedRef.current;
    if (e.shiftKey && currentLastClicked) {
      const aIdx = currentTasks.findIndex((t) => t.id === currentLastClicked);
      const bIdx = currentTasks.findIndex((t) => t.id === task.id);
      if (aIdx >= 0 && bIdx >= 0) {
        const [start, end] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        selectMany(currentTasks.slice(start, end + 1).map((t) => t.id));
        return;
      }
    }
    toggleSelected(task.id);
  }, [selectMany, toggleSelected]);

  const handleDrop = React.useCallback((targetId: string) => {
    const sourceId = dragId.current;
    if (!sourceId || sourceId === targetId) return;
    const currentTasks = tasksRef.current;
    const targetIdx = currentTasks.findIndex((t) => t.id === targetId);
    const sourceIdx = currentTasks.findIndex((t) => t.id === sourceId);
    if (targetIdx < 0) return;
    const beforeIdx = sourceIdx > targetIdx ? targetIdx - 1 : targetIdx;
    const afterIdx = sourceIdx > targetIdx ? targetIdx : targetIdx + 1;
    const before = currentTasks[beforeIdx];
    const after = currentTasks[afterIdx];
    moveMut.mutate({
      id: sourceId,
      before_id: before?.id ?? null,
      after_id: after?.id ?? null,
    });
    dragId.current = null;
    dropTargetId.current = null;
  }, [moveMut]);

  const handleDragStart = React.useCallback((id: string) => {
    dragId.current = id;
  }, []);
  const handleDragOver = React.useCallback((id: string) => {
    dropTargetId.current = id;
  }, []);

  const handleDismissQuickActions = React.useCallback(() => {
    setQuickActionsFocusedTaskId(null);
  }, []);

  const incompleteTasks = tasks.filter((t) => t.status !== "completed");
  const totalEstMins = sumEstimatedMinutes(incompleteTasks, false);
  const showTimeAggregate =
    (perspective === "today" || perspective === "tomorrow" || perspective === "project") &&
    incompleteTasks.some((t) => t.estimated_minutes != null && t.estimated_minutes > 0);

  const deferredCount = deferredCountQuery.data?.count ?? 0;

  function buildHeaderStats(): string {
    const base = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
    if (perspective === "project") {
      const incomplete = incompleteTasks.length;
      if (showTimeAggregate) {
        return `${base} · ${incomplete} incomplete · ~${formatEstimatedTime(totalEstMins)} estimated`;
      }
      return `${base} · ${incomplete} incomplete`;
    }
    if (perspective === "today") {
      if (showTimeAggregate) {
        return `${base} · ~${formatEstimatedTime(totalEstMins)} · 0 calendar events`;
      }
      return `${base} · 0 calendar events`;
    }
    if (perspective === "tomorrow") {
      if (showTimeAggregate) {
        return `${base} · ~${formatEstimatedTime(totalEstMins)} estimated`;
      }
      return base;
    }
    return base;
  }

  const showMigrationModal =
    perspective === "inbox" &&
    !migrationModalDismissed &&
    !!migrationSummaryQuery.data;

  return (
    <div className="flex h-full flex-col">
      {showMigrationModal && migrationSummaryQuery.data && (
        <MigrationSummaryModal
          summary={migrationSummaryQuery.data}
          onClose={() => {
            setMigrationModalDismissed(true);
            dismissMigration.mutate();
          }}
        />
      )}
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
          {headerExtra}
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
            {buildHeaderStats()}
          </span>
        </div>
      </header>

      {enableQuickAdd ? (
        <TaskQuickAdd
          defaultProjectId={projectId ?? null}
          defaultContextId={contextId}
          defaultTagName={tagName}
          defaultDueDate={defaultDueDate}
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
        <div className="flex flex-1 flex-col">
          {perspective === "inbox" && <InboxWelcomeBanner />}
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<Inbox size={28} aria-hidden />} title={emptyTitle} body={emptyBody} />
          </div>
        </div>
      ) : (
        <>
          <div role="grid" className="flex-1 overflow-y-auto">
            {tasks.map((task, idx) => (
              <TaskListItemWithSubtasks
                key={task.id}
                task={task}
                idx={idx}
                selectedTaskId={selectedTaskId}
                focusedIdx={focusedIdx}
                selectedTaskIds={selectedTaskIds}
                onSelect={handleSelect}
                onMultiToggle={handleMultiToggle}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                perspective={perspective}
                quickActionsFocusedTaskId={quickActionsFocusedTaskId}
                onDismissQuickActions={handleDismissQuickActions}
              />
            ))}
          </div>
          {hasFinePointer && (
            <div className="flex items-center gap-1.5 border-t border-border-subtle px-3 py-1.5">
              <Keyboard size={11} className="shrink-0 text-text-tertiary" aria-hidden />
              <p className="font-ui text-2xs text-text-tertiary">
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">j</kbd>
                <span className="mx-0.5">/</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">k</kbd>
                <span className="mx-1.5">navigate</span>
                <span className="mx-1">·</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">space</kbd>
                <span className="mx-1.5">complete</span>
                <span className="mx-1">·</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">f</kbd>
                <span className="mx-1.5">flag</span>
                <span className="mx-1">·</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">.</kbd>
                <span className="mx-1.5">quick actions</span>
                <span className="mx-1">·</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">↵</kbd>
                <span className="mx-0.5">/</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">⌘I</kbd>
                <span className="mx-1.5">inspect</span>
                <span className="mx-1">·</span>
                <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">?</kbd>
                <span className="mx-1.5">all shortcuts</span>
              </p>
              <button
                type="button"
                onClick={() => setShortcutsOverlayOpen(true)}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                className="ml-auto shrink-0 text-text-tertiary hover:text-text-secondary"
              >
                <HelpCircle size={13} aria-hidden />
              </button>
            </div>
          )}
        </>
      )}

      {perspective === "project" && (deferredCount > 0 || showDeferred) && (
        <div className="border-t border-border-subtle px-3 py-2">
          <button
            type="button"
            onClick={() => setShowDeferred((v) => !v)}
            className="font-ui text-2xs text-text-tertiary hover:text-text-secondary"
          >
            {showDeferred
              ? "Hide deferred"
              : `Show deferred (${deferredCount})`}
          </button>
        </div>
      )}

      {perspective === "inbox" ? (
        <InboxBulkCaptureBar
          captureIds={[...selectedTaskIds].filter((id) =>
            tasks.some((t) => t.id === id && t.entity_type === "capture"),
          )}
          onClear={clearSelection}
        />
      ) : (
        <BulkActionBar />
      )}
    </div>
  );
}
