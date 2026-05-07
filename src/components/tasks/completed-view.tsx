"use client";

import * as React from "react";
import { CheckCircle2, RotateCcw, Trash2, Flame } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { useTasksStore } from "@/lib/tasks/store";
import { useLocale } from "@/core/locale/hooks";
import { formatDateTime as localeFormatDateTime } from "@/core/locale/formatters";

type DateRange = "today" | "week" | "month" | "year" | "all" | "custom";
type SortBy = "completed_at" | "title" | "due_date";

type CompletedTask = {
  id: string;
  title: string;
  status: string;
  flagged: boolean;
  completed_at: Date | string | null;
  due_date: Date | string | null;
  project: { id: string; title: string; color: string | null } | null;
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "Last 30 days",
  year: "Last year",
  all: "All time",
  custom: "Custom range",
};

export function CompletedView(): React.ReactElement {
  const locale = useLocale();
  const utils = trpc.useUtils();
  const [dateRange, setDateRange] = React.useState<DateRange>("week");
  const [customFrom, setCustomFrom] = React.useState<string>("");
  const [customTo, setCustomTo] = React.useState<string>("");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<SortBy>("completed_at");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);

  const projects = trpc.projects.list.useQuery({ include_all_statuses: true });

  const query = trpc.tasks.completed.useQuery({
    date_range: dateRange,
    from_date: dateRange === "custom" && customFrom ? new Date(customFrom) : undefined,
    to_date: dateRange === "custom" && customTo ? new Date(customTo) : undefined,
    project_id: projectId ?? undefined,
    sort: sortBy,
  });

  const bulkUncomplete = trpc.tasks.bulkUncomplete.useMutation({
    onSuccess: (data) => {
      utils.tasks.completed.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`${data.count} task${data.count !== 1 ? "s" : ""} reopened`);
    },
    onError: () => toast.error("Failed to reopen tasks"),
  });

  const uncomplete = trpc.tasks.uncomplete.useMutation({
    onSuccess: () => {
      utils.tasks.completed.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.list.invalidate();
    },
  });

  const bulkDelete = trpc.tasks.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.tasks.completed.invalidate();
      utils.tasks.counts.invalidate();
      setSelectedIds(new Set());
      toast.success(`${data.count} task${data.count !== 1 ? "s" : ""} moved to trash`);
    },
    onError: () => toast.error("Failed to delete tasks"),
  });

  const bulkPermanentDelete = trpc.tasks.bulkPermanentDelete.useMutation({
    onSuccess: (data) => {
      utils.tasks.completed.invalidate();
      utils.tasks.counts.invalidate();
      setSelectedIds(new Set());
      toast.success(`${data.count} task${data.count !== 1 ? "s" : ""} permanently deleted`);
    },
    onError: () => toast.error("Failed to permanently delete tasks"),
  });

  const tasks = (query.data ?? []) as CompletedTask[];

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const ids: string[] = [];
    for (const t of tasks) ids.push(t.id);
    setSelectedIds(new Set(ids));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleBulkUncomplete() {
    if (selectedIds.size === 0) return;
    bulkUncomplete.mutate({ ids: Array.from(selectedIds) });
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Move ${selectedIds.size} task${selectedIds.size !== 1 ? "s" : ""} to trash?`))
      return;
    bulkDelete.mutate({ ids: Array.from(selectedIds) });
  }

  function handleBulkPermanentDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Permanently delete ${selectedIds.size} task${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`,
      )
    )
      return;
    bulkPermanentDelete.mutate({ ids: Array.from(selectedIds) });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CheckCircle2 size={14} className="shrink-0 text-text-tertiary" />
          <h1 className="truncate font-ui text-base font-semibold text-text-primary">Completed</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="rounded-sm border border-border-subtle bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-border-focus"
          >
            {(Object.entries(DATE_RANGE_LABELS) as [DateRange, string][]).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {dateRange === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-sm border border-border-subtle bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-border-focus"
                aria-label="From date"
              />
              <span className="font-ui text-2xs text-text-tertiary">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-sm border border-border-subtle bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-border-focus"
                aria-label="To date"
              />
            </>
          )}

          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="rounded-sm border border-border-subtle bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-border-focus"
          >
            <option value="">All projects</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-sm border border-border-subtle bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-border-focus"
          >
            <option value="completed_at">Completed at</option>
            <option value="title">Title</option>
            <option value="due_date">Due date</option>
          </select>

          <span className="font-mono text-2xs tabular-nums text-text-tertiary">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>
      </header>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-sunken px-3 py-1.5">
          <span className="font-ui text-2xs text-text-secondary">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={handleBulkUncomplete}
            disabled={bulkUncomplete.isPending}
            className="inline-flex items-center gap-1 rounded-sm border border-border-default px-2 py-0.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            <RotateCcw size={10} />
            Reopen
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDelete.isPending}
            className="inline-flex items-center gap-1 rounded-sm border border-accent-danger px-2 py-0.5 font-ui text-2xs text-accent-danger hover:bg-accent-danger-muted disabled:opacity-50"
          >
            <Trash2 size={10} />
            Trash
          </button>
          <button
            type="button"
            onClick={handleBulkPermanentDelete}
            disabled={bulkPermanentDelete.isPending}
            className="hover:bg-accent-danger/20 inline-flex items-center gap-1 rounded-sm border border-accent-danger bg-accent-danger-muted px-2 py-0.5 font-ui text-2xs text-accent-danger disabled:opacity-50"
          >
            <Flame size={10} />
            Delete forever
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto font-ui text-2xs text-text-tertiary hover:text-text-secondary"
          >
            Clear
          </button>
        </div>
      )}

      {query.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <CheckCircle2 size={28} className="text-text-disabled" />
          <p className="font-ui text-sm text-text-tertiary">No completed tasks yet</p>
          <p className="font-ui text-2xs text-text-disabled">
            Complete some tasks to see them here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {selectedIds.size === 0 && tasks.length > 0 && (
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1">
              <button
                type="button"
                onClick={selectAll}
                className="font-ui text-2xs text-text-tertiary hover:text-text-secondary"
              >
                Select all
              </button>
            </div>
          )}
          {tasks.map((task) => {
            const isSelected = selectedIds.has(task.id);
            const completedAt = task.completed_at ? new Date(task.completed_at) : null;

            return (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 border-b border-border-subtle px-3 py-2 transition-colors hover:bg-surface-hover",
                  isSelected && "bg-accent-primary-subtle",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(task.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Select task"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-ui text-sm text-text-tertiary line-through">
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 font-ui text-2xs text-text-disabled">
                    {task.project && (
                      <span className="inline-flex items-center rounded-sm bg-surface-raised px-1 py-px">
                        {task.project.title}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {completedAt && (
                    <span className="font-ui text-2xs tabular-nums text-text-disabled">
                      {localeFormatDateTime(completedAt, locale)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      uncomplete.mutate({ id: task.id });
                    }}
                    aria-label="Reopen task"
                    className="rounded-sm p-0.5 text-text-disabled opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
