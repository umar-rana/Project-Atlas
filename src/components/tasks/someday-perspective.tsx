"use client";

import * as React from "react";
import { Archive, ArrowUpCircle, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import { EmptyState } from "@/components/composed/empty-state";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { isPast, isWithinInterval, addMonths, startOfDay } from "date-fns";

type SomedayTask = {
  id: string;
  title: string;
  notes: string | null;
  is_someday: boolean;
  someday_review_date: Date | string | null;
  tags: { tag: { id: string; name: string; color: string | null } }[];
  contexts: { context: { id: string; name: string } }[];
  project: { id: string; title: string; color: string | null } | null;
  created_at: Date | string;
};

type Group = "due_for_review" | "this_month" | "within_three_months" | "indefinite";

function getGroup(task: SomedayTask): Group {
  if (!task.someday_review_date) return "indefinite";
  const d = new Date(task.someday_review_date);
  const now = new Date();
  if (isPast(d) || isWithinInterval(d, { start: startOfDay(now), end: now }))
    return "due_for_review";
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  if (d <= endOfMonth) return "this_month";
  const threeMonths = addMonths(now, 3);
  if (d <= threeMonths) return "within_three_months";
  return "indefinite";
}

const GROUP_LABELS: Record<Group, string> = {
  due_for_review: "Due for review",
  this_month: "This month",
  within_three_months: "Within three months",
  indefinite: "Indefinite",
};

const GROUP_ORDER: Group[] = ["due_for_review", "this_month", "within_three_months", "indefinite"];

function SomedayTaskCard({
  task,
  onPromote,
}: {
  task: SomedayTask;
  onPromote: (id: string) => void;
}) {
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const isSelected = selectedTaskId === task.id;

  const reviewDate = task.someday_review_date ? new Date(task.someday_review_date) : null;
  const isOverdue = reviewDate && isPast(reviewDate);

  return (
    <div
      role="row"
      onClick={() => setSelectedTaskId(task.id)}
      className={cn(
        "group flex cursor-pointer items-start gap-3 border-b border-border-subtle px-3 py-2.5 transition-colors hover:bg-surface-hover",
        isSelected && "bg-accent-primary-subtle",
      )}
    >
      <Archive size={14} className="mt-0.5 shrink-0 text-text-tertiary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-ui text-sm text-text-primary">{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {reviewDate && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-ui text-2xs",
                isOverdue ? "text-accent-danger" : "text-text-tertiary",
              )}
            >
              <Calendar size={10} />
              {reviewDate.toLocaleDateString()}
            </span>
          )}
          {task.tags.map((t) => (
            <span
              key={t.tag.id}
              className="rounded-full bg-surface-raised px-1.5 py-0.5 font-ui text-2xs text-text-tertiary"
            >
              #{t.tag.name}
            </span>
          ))}
          {task.project && (
            <span className="font-ui text-2xs text-text-tertiary">{task.project.title}</span>
          )}
        </div>
      </div>
      <Hint label="Promote to active">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPromote(task.id);
          }}
          className="hover:border-accent-success/30 hidden shrink-0 items-center gap-1 rounded-sm border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-secondary transition-colors hover:bg-accent-success-muted hover:text-accent-success group-hover:flex"
        >
          <ArrowUpCircle size={11} />
          Promote
        </button>
      </Hint>
    </div>
  );
}

export function SomedayPerspective(): React.ReactElement {
  const utils = trpc.useUtils();
  const query = trpc.tasks.someday.useQuery(undefined, { staleTime: 30_000 });

  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [contextFilter, setContextFilter] = React.useState<string | null>(null);
  const [projectFilter, setProjectFilter] = React.useState<string | null>(null);

  const promoteMut = trpc.tasks.promoteFromSomeday.useMutation({
    onSuccess: () => {
      utils.tasks.someday.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.list.invalidate();
    },
  });

  const tasks = React.useMemo(() => {
    let list = (query.data ?? []) as SomedayTask[];
    if (tagFilter) list = list.filter((t) => t.tags.some((tg) => tg.tag.id === tagFilter));
    if (contextFilter)
      list = list.filter((t) => t.contexts.some((c) => c.context.id === contextFilter));
    if (projectFilter) list = list.filter((t) => t.project?.id === projectFilter);
    return list;
  }, [query.data, tagFilter, contextFilter, projectFilter]);

  const grouped = React.useMemo(() => {
    const map = new Map<Group, SomedayTask[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const t of tasks) {
      const g = getGroup(t);
      map.get(g)!.push(t);
    }
    for (const [g, list] of map) {
      map.set(
        g,
        list.sort((a, b) => {
          if (a.someday_review_date && b.someday_review_date) {
            return (
              new Date(a.someday_review_date).getTime() - new Date(b.someday_review_date).getTime()
            );
          }
          if (a.someday_review_date) return -1;
          if (b.someday_review_date) return 1;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }),
      );
    }
    return map;
  }, [tasks]);

  const allTags = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const t of (query.data ?? []) as SomedayTask[]) {
      for (const tg of t.tags) map.set(tg.tag.id, tg.tag);
    }
    return [...map.values()];
  }, [query.data]);

  const allContexts = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const t of (query.data ?? []) as SomedayTask[]) {
      for (const c of t.contexts) map.set(c.context.id, c.context);
    }
    return [...map.values()];
  }, [query.data]);

  const allProjects = React.useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const t of (query.data ?? []) as SomedayTask[]) {
      if (t.project) map.set(t.project.id, t.project);
    }
    return [...map.values()];
  }, [query.data]);

  const totalCount = tasks.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="min-w-0">
          <h1 className="font-ui text-base font-semibold text-text-primary">Someday / Maybe</h1>
          <p className="font-ui text-2xs text-text-tertiary">Ideas and tasks for the future.</p>
        </div>
        <span className="font-mono text-2xs tabular-nums text-text-tertiary">
          {totalCount} {totalCount === 1 ? "item" : "items"}
        </span>
      </header>

      {(allTags.length > 0 || allContexts.length > 0 || allProjects.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle px-3 py-1.5">
          <span className="font-ui text-2xs text-text-tertiary">Filter:</span>
          {allTags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
              className={cn(
                "rounded-full px-2 py-0.5 font-ui text-2xs transition-colors",
                tagFilter === t.id
                  ? "bg-accent-primary text-text-on-accent"
                  : "bg-surface-raised text-text-tertiary hover:bg-surface-hover",
              )}
            >
              #{t.name}
            </button>
          ))}
          {allContexts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setContextFilter(contextFilter === c.id ? null : c.id)}
              className={cn(
                "rounded-full px-2 py-0.5 font-ui text-2xs transition-colors",
                contextFilter === c.id
                  ? "bg-accent-primary text-text-on-accent"
                  : "bg-surface-raised text-text-tertiary hover:bg-surface-hover",
              )}
            >
              @{c.name}
            </button>
          ))}
          {allProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProjectFilter(projectFilter === p.id ? null : p.id)}
              className={cn(
                "rounded-full px-2 py-0.5 font-ui text-2xs transition-colors",
                projectFilter === p.id
                  ? "bg-accent-primary text-text-on-accent"
                  : "bg-surface-raised text-text-tertiary hover:bg-surface-hover",
              )}
            >
              {p.title}
            </button>
          ))}
          {(tagFilter || contextFilter || projectFilter) && (
            <button
              type="button"
              onClick={() => {
                setTagFilter(null);
                setContextFilter(null);
                setProjectFilter(null);
              }}
              className="rounded-full bg-surface-hover px-2 py-0.5 font-ui text-2xs text-text-secondary hover:bg-border-subtle"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {query.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Archive size={28} aria-hidden />}
            title="No someday items"
            body="Use the Someday disposition in processing mode to park ideas here."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {GROUP_ORDER.map((group) => {
            const items = grouped.get(group) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="bg-surface-base/95 sticky top-0 z-10 border-b border-border-subtle px-3 py-1 backdrop-blur-sm">
                  <p className="font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                    {GROUP_LABELS[group]}
                    <span className="ml-1.5 font-mono font-normal">({items.length})</span>
                  </p>
                </div>
                {items.map((task) => (
                  <SomedayTaskCard
                    key={task.id}
                    task={task}
                    onPromote={(id) => promoteMut.mutate({ id })}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
