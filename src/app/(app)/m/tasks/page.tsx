"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Flag,
  Inbox,
  Sun,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Hash,
} from "lucide-react";
import { isToday, isTomorrow, isPast, format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";
import type { LocaleSettings } from "@/core/locale/formatters";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";

type Perspective =
  | "today"
  | "tomorrow"
  | "forecast"
  | "inbox"
  | "flagged"
  | "someday"
  | "waiting_for"
  | "completed"
  | "tag";

interface Chip {
  id: Perspective;
  label: string;
  icon: React.ElementType;
  countKey?: keyof ReturnType<typeof useCountsData>;
}

const BASE_CHIPS: Chip[] = [
  { id: "today", label: "Today", icon: Sun, countKey: "today" },
  { id: "tomorrow", label: "Tomorrow", icon: Calendar, countKey: "tomorrow" },
  { id: "forecast", label: "Forecast", icon: Calendar },
  { id: "inbox", label: "Inbox", icon: Inbox, countKey: "inbox" },
  { id: "flagged", label: "Flagged", icon: Flag, countKey: "flagged" },
  { id: "someday", label: "Someday", icon: Clock, countKey: "someday" },
  { id: "waiting_for", label: "Waiting For", icon: Users, countKey: "waitingFor" },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
];

function useCountsData() {
  const { data } = trpc.tasks.counts.useQuery(
    { timezoneOffset: new Date().getTimezoneOffset() },
    { staleTime: 30_000 },
  );
  return {
    inbox: data?.inbox ?? 0,
    today: data?.today ?? 0,
    tomorrow: data?.tomorrow ?? 0,
    flagged: data?.flagged ?? 0,
    someday: data?.someday ?? 0,
    waitingFor: data?.waitingFor ?? 0,
  };
}

function dueBadge(
  due: Date | string | null,
  locale: LocaleSettings,
): { label: string; className: string } | null {
  if (!due) return null;
  const d = typeof due === "string" ? new Date(due) : due;
  if (isPast(d) && !isToday(d)) {
    return { label: localeFormatDate(d, locale), className: "text-accent-danger" };
  } else if (isToday(d)) {
    return { label: "Today", className: "text-accent-warning" };
  } else if (isTomorrow(d)) {
    return { label: "Tomorrow", className: "text-text-tertiary" };
  }
  return { label: localeFormatDate(d, locale), className: "text-text-tertiary" };
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  flagged: boolean;
  due_date: Date | string | null;
  defer_date: Date | string | null;
  is_someday: boolean;
  delegated_to_text: string | null;
  project: { id: string; title: string; color: string | null } | null;
  contexts: { context: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string; color: string | null } }[];
  completed_at?: Date | string | null;
}

function TaskRow({ task, locale }: { task: TaskItem; locale: LocaleSettings }) {
  const badge = dueBadge(task.due_date, locale);
  const isCompleted = task.status === "completed";

  return (
    <li>
      <Link
        href={`/m/tasks/${task.id}`}
        className="flex min-h-[56px] items-start gap-3 border-b border-border-subtle px-4 py-3 transition-colors active:bg-surface-hover"
      >
        <span
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0 rounded-full border-2",
            isCompleted
              ? "border-accent-success bg-accent-success"
              : "border-border-default",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-ui text-base leading-snug",
              isCompleted ? "text-text-tertiary line-through" : "text-text-primary",
            )}
          >
            {task.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {task.project ? (
              <span className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-ui text-xs text-text-tertiary">
                {task.project.title}
              </span>
            ) : null}
            {badge ? (
              <span className={cn("font-ui text-xs tabular-nums", badge.className)}>
                {badge.label}
              </span>
            ) : null}
            {task.flagged ? (
              <span className="font-ui text-xs text-accent-warning">⚑ Flagged</span>
            ) : null}
            {task.delegated_to_text ? (
              <span className="font-ui text-xs text-text-tertiary">
                → {task.delegated_to_text}
              </span>
            ) : null}
            {task.contexts.map((ct) => (
              <span key={ct.context.id} className="font-ui text-xs text-accent-info">
                @{ct.context.name}
              </span>
            ))}
            {task.tags.slice(0, 2).map((tg) => (
              <span key={tg.tag.id} className="font-ui text-xs text-text-tertiary">
                #{tg.tag.name}
              </span>
            ))}
            {task.defer_date && !isCompleted ? (
              <span className="font-ui text-xs text-text-disabled">
                Deferred {format(new Date(task.defer_date), "MMM d")}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function dateGroupKey(d: Date | string | null | undefined): string {
  if (!d) return "No date";
  const date = d instanceof Date ? d : new Date(d as string);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

function ForecastList({ tasks, locale }: { tasks: TaskItem[]; locale: LocaleSettings }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of tasks) {
      const key = dateGroupKey(task.due_date ?? task.defer_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return [...map.entries()];
  }, [tasks]);

  return (
    <div role="list">
      {groups.map(([label, group]) => (
        <section key={label}>
          <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-raised/80 px-4 py-1.5 backdrop-blur-sm">
            <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {label}
              <span className="ml-1.5 rounded-full bg-surface-hover px-1.5 py-0.5 font-ui text-[10px] text-text-disabled">
                {group.length}
              </span>
            </p>
          </div>
          <ul role="list">
            {group.map((task) => (
              <TaskRow key={task.id} task={task} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function weekLabel(date: Date): string {
  const now = new Date();
  if (isWithinInterval(date, { start: startOfWeek(now), end: endOfWeek(now) })) return "This week";
  return format(startOfWeek(date), "Week of MMM d");
}

function CompletedList({ tasks, locale }: { tasks: TaskItem[]; locale: LocaleSettings }) {
  const groups = React.useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const task of tasks) {
      const key = task.completed_at ? weekLabel(new Date(task.completed_at as string)) : "Earlier";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return [...map.entries()];
  }, [tasks]);

  return (
    <div role="list">
      {groups.map(([label, group]) => (
        <section key={label}>
          <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-raised/80 px-4 py-1.5 backdrop-blur-sm">
            <p className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {label}
              <span className="ml-1.5 rounded-full bg-surface-hover px-1.5 py-0.5 font-ui text-[10px] text-text-disabled">
                {group.length}
              </span>
            </p>
          </div>
          <ul role="list">
            {group.map((task) => (
              <TaskRow key={task.id} task={task} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const PAGE_SIZE = 50;

export default function MobileTasksPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [perspective, setPerspective] = React.useState<Perspective>("today");
  const [tagName, setTagName] = React.useState<string | null>(null);
  const [pageLimit, setPageLimit] = React.useState(PAGE_SIZE);
  const counts = useCountsData();
  const timezoneOffset = new Date().getTimezoneOffset();

  // On mount, honour ?tag= query param from search-sheet navigation
  React.useEffect(() => {
    const tag = searchParams.get("tag");
    if (tag) {
      setTagName(tag);
      setPerspective("tag");
    }
  }, [searchParams]);

  // Reset page limit whenever perspective changes
  React.useEffect(() => {
    setPageLimit(PAGE_SIZE);
  }, [perspective]);

  const isPaginated = perspective === "forecast" || perspective === "completed";

  const query = trpc.tasks.list.useQuery({
    perspective: perspective === "tag" ? "tag" : perspective,
    tag_name: perspective === "tag" && tagName ? tagName : undefined,
    include_completed: perspective === "completed",
    timezoneOffset,
    limit: isPaginated ? pageLimit : undefined,
  });

  const tasks = (query.data as TaskItem[] | undefined) ?? [];
  const hasMore = isPaginated && tasks.length === pageLimit;

  async function handleRefresh() {
    await query.refetch();
  }

  // Build chip list — prepend a dynamic "tag" chip when in tag perspective
  const chips: Chip[] = React.useMemo(() => {
    if (perspective === "tag" && tagName) {
      return [
        { id: "tag" as Perspective, label: `#${tagName}`, icon: Hash },
        ...BASE_CHIPS,
      ];
    }
    return BASE_CHIPS;
  }, [perspective, tagName]);

  const emptyMessage =
    perspective === "inbox"
      ? { title: "Inbox zero", subtitle: "All caught up! Capture a new task to get started." }
      : perspective === "today"
        ? { title: "Nothing due today", subtitle: "Enjoy your day!" }
        : perspective === "forecast"
          ? { title: "Clear skies ahead", subtitle: "No tasks with due or defer dates in the next 14 days." }
          : perspective === "someday"
            ? { title: "No someday items", subtitle: "Tasks you defer to someday will appear here." }
            : perspective === "waiting_for"
              ? { title: "Nothing waiting", subtitle: "Delegated tasks will appear here." }
              : perspective === "completed"
                ? { title: "Nothing completed", subtitle: "Completed tasks from the last 30 days appear here." }
                : perspective === "tag" && tagName
                  ? { title: `No tasks tagged #${tagName}`, subtitle: "Tasks with this tag will appear here." }
                  : { title: "Nothing here", subtitle: "No tasks for this view." };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Tasks</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map(({ id, label, icon: Icon, countKey }) => {
            const count = countKey ? counts[countKey] : 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id !== "tag") setTagName(null);
                  setPerspective(id);
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5",
                  "font-ui text-sm font-medium transition-colors",
                  "min-h-[44px]",
                  perspective === id
                    ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                    : "border-border-subtle bg-surface-raised text-text-secondary hover:border-border-default",
                )}
              >
                <Icon size={14} aria-hidden />
                {label}
                {count > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 py-0.5 font-ui text-[10px] font-bold",
                      perspective === id
                        ? "bg-accent-primary text-white"
                        : "bg-surface-hover text-text-tertiary",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <PullToRefresh onRefresh={handleRefresh} className="flex-1">
        {query.isLoading ? (
          <ul role="list">
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex min-h-[56px] items-start gap-3 border-b border-border-subtle px-4 py-3"
              >
                <span className="mt-0.5 h-5 w-5 shrink-0 animate-pulse rounded-full bg-surface-raised" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-raised" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-surface-raised" />
                </div>
              </li>
            ))}
          </ul>
        ) : tasks.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-ui text-base font-medium text-text-secondary">{emptyMessage.title}</p>
            <p className="font-ui text-sm text-text-tertiary">{emptyMessage.subtitle}</p>
          </div>
        ) : perspective === "forecast" ? (
          <>
            <ForecastList tasks={tasks} locale={locale} />
            {hasMore && (
              <div className="px-4 py-4">
                <button
                  type="button"
                  onClick={() => setPageLimit((l) => l + PAGE_SIZE)}
                  disabled={query.isFetching}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border-subtle bg-surface-raised font-ui text-sm font-medium text-text-secondary active:bg-surface-hover disabled:opacity-40"
                >
                  {query.isFetching ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : perspective === "completed" ? (
          <>
            <CompletedList tasks={tasks} locale={locale} />
            {hasMore && (
              <div className="px-4 py-4">
                <button
                  type="button"
                  onClick={() => setPageLimit((l) => l + PAGE_SIZE)}
                  disabled={query.isFetching}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border-subtle bg-surface-raised font-ui text-sm font-medium text-text-secondary active:bg-surface-hover disabled:opacity-40"
                >
                  {query.isFetching ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <ul role="list">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} locale={locale} />
            ))}
          </ul>
        )}
      </PullToRefresh>
    </div>
  );
}
