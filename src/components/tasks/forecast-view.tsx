"use client";

import * as React from "react";
import { isToday, addDays, startOfDay, isBefore } from "date-fns";
import { useLocale } from "@/core/locale/hooks";
import {
  formatDate as localeFormatDate,
  formatWeekdayAbbrev,
  formatDayOfMonth,
  formatMonthAbbrev,
} from "@/core/locale/formatters";
import {
  CalendarDays,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";

const PROJECT_COLOR_DOTS: Record<string, string> = {
  blue: "bg-cal-1-border",
  green: "bg-cal-2-border",
  amber: "bg-cal-3-border",
  red: "bg-cal-4-border",
  purple: "bg-cal-5-border",
  teal: "bg-cal-6-border",
  pink: "bg-cal-7-border",
  orange: "bg-cal-8-border",
};

function colorDotClass(color?: string | null): string {
  if (!color) return "bg-text-disabled";
  return PROJECT_COLOR_DOTS[color] ?? "bg-text-disabled";
}

type ForecastTask = {
  id: string;
  title: string;
  status: string;
  flagged: boolean;
  due_date: Date | string | null;
  defer_date: Date | string | null;
  project: { id: string; title: string; color: string | null } | null;
  contexts: { context: { id: string; name: string } }[];
};

function TaskCard({
  task,
  onComplete,
  isPast,
}: {
  task: ForecastTask;
  onComplete: (id: string) => void;
  isPast?: boolean;
}) {
  const locale = useLocale();
  const isCompleted = task.status === "completed";

  return (
    <div
      draggable={!isPast}
      onDragStart={isPast ? undefined : (e) => {
        e.dataTransfer.setData("task-id", task.id);
      }}
      className={cn(
        "group flex items-start gap-2 rounded-sm border border-border-subtle bg-surface-base p-2 shadow-1 transition-colors hover:border-border-default",
        isCompleted && "opacity-50",
        isPast && "cursor-default",
      )}
    >
      <Checkbox
        checked={isCompleted}
        onCheckedChange={() => onComplete(task.id)}
        className="mt-0.5 shrink-0"
        aria-label={isCompleted ? "Reopen task" : "Complete task"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-ui text-xs text-text-primary",
            isCompleted && "line-through text-text-tertiary",
          )}
        >
          {task.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {task.project && (
            <div className="flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", colorDotClass(task.project.color))} />
              <span className="truncate font-ui text-2xs text-text-tertiary">{task.project.title}</span>
            </div>
          )}
          {!task.due_date && task.defer_date && (
            <span
              title={`Available from ${localeFormatDate(task.defer_date, locale)}`}
              className="inline-flex items-center rounded px-1 py-px font-ui text-3xs font-medium text-accent-info bg-accent-info/10 leading-none cursor-default"
            >
              Available
            </span>
          )}
        </div>
      </div>
      {task.flagged && (
        <span className="shrink-0 text-accent-warning" aria-label="Flagged">
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
            <path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12.435 12.435 0 0 1-.397.15c-.264.095-.631.223-1.047.35-.816.252-1.879.523-2.71.523-.847 0-1.548-.28-2.158-.525l-.028-.01C7.68 8.71 7.14 8.5 6.5 8.5c-.7 0-1.638.23-2.437.477A19.626 19.626 0 0 0 3 9.342V15.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.282c.226-.079.496-.17.79-.26C4.606.272 5.67 0 6.5 0c.84 0 1.524.277 2.121.519l.043.018C9.286.788 9.828 1 10.5 1c.7 0 1.638-.23 2.437-.477a19.587 19.587 0 0 0 1.349-.476l.019-.007.004-.002h.001" />
          </svg>
        </span>
      )}
    </div>
  );
}

function DayColumn({
  date,
  tasks,
  onComplete,
  onDrop,
}: {
  date: string;
  tasks: ForecastTask[];
  onComplete: (id: string) => void;
  onDrop: (taskId: string, date: string) => void;
}) {
  const locale = useLocale();
  const d = new Date(date + "T00:00:00");
  const today = isToday(d);
  const isPast = isBefore(d, startOfDay(new Date())) && !today;
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-md border",
        today ? "border-accent-primary bg-accent-primary-subtle" : "border-border-subtle bg-surface-base",
        isPast && "opacity-80",
      )}
      onDragOver={isPast ? undefined : (e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={isPast ? undefined : () => setDragOver(false)}
      onDrop={isPast ? undefined : (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("task-id");
        if (taskId) onDrop(taskId, date);
        setDragOver(false);
      }}
    >
      <div
        className={cn(
          "border-b px-2 py-1.5",
          today ? "border-accent-primary" : "border-border-subtle",
          dragOver && "bg-accent-primary-muted",
        )}
      >
        <p className={cn("font-ui text-2xs font-semibold uppercase tracking-caps", today ? "text-accent-primary" : "text-text-tertiary")}>
          {formatWeekdayAbbrev(d, locale.language)}
        </p>
        <p className={cn("font-display text-lg font-bold", today ? "text-accent-primary" : "text-text-primary")}>
          {formatDayOfMonth(d)}
        </p>
        <p className="font-ui text-3xs text-text-tertiary">{formatMonthAbbrev(d, locale.language)}</p>
        {tasks.length > 0 && (() => {
          const active = tasks.filter((t) => t.status !== "completed").length;
          const flagged = tasks.filter((t) => t.flagged).length;
          const done = tasks.length - active;
          const tooltipParts = [`${active} active`];
          if (flagged > 0) tooltipParts.push(`${flagged} flagged`);
          if (done > 0) tooltipParts.push(`${done} done`);
          return (
            <p
              className="mt-0.5 cursor-default font-mono text-3xs text-text-tertiary tabular-nums"
              title={tooltipParts.join(" · ")}
            >
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
              {flagged > 0 && <span className="ml-1 text-accent-warning">({flagged} flagged)</span>}
            </p>
          );
        })()}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto p-1.5">
        {tasks.length === 0 ? (
          <p className="py-2 text-center font-ui text-2xs text-text-disabled">—</p>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onComplete={onComplete} isPast={isPast} />
          ))
        )}
      </div>
    </div>
  );
}

export function ForecastView(): React.ReactElement {
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { data: meData } = trpc.user.me.useQuery(undefined, { staleTime: 5 * 60_000 });

  function extractForecastDays(raw: unknown): 7 | 14 {
    const prefs = (typeof raw === "object" && raw !== null && "tasks_prefs" in raw)
      ? (raw as { tasks_prefs: unknown }).tasks_prefs
      : null;
    const val = (typeof prefs === "object" && prefs !== null && "default_forecast_days" in prefs)
      ? (prefs as { default_forecast_days: unknown }).default_forecast_days
      : undefined;
    return typeof val === "number" && val === 14 ? 14 : 7;
  }

  const STORAGE_KEY = "forecast_days";

  function readStoredDays(): 7 | 14 | null {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw === "7") return 7;
      if (raw === "14") return 14;
    } catch {
    }
    return null;
  }

  function storeDays(n: 7 | 14) {
    try {
      localStorage.setItem(STORAGE_KEY, String(n));
    } catch {
    }
  }

  const [days, setDays] = React.useState<7 | 14>(() => {
    const stored = readStoredDays();
    if (stored !== null) return stored;
    return extractForecastDays(utils.user.me.getData());
  });
  const [daysInitialized, setDaysInitialized] = React.useState(() => {
    if (readStoredDays() !== null) return true;
    return utils.user.me.getData() !== undefined;
  });
  const [startDate, setStartDate] = React.useState(() => startOfDay(new Date()));

  // Depend on a narrowed primitive (7 | 14) instead of the full Prisma-typed
  // `meData` object — the latter triggers TS2589 "type instantiation is
  // excessively deep" because the dependency tuple inference walks the entire
  // generated user shape. The effect only needs to know the resolved
  // forecast-days preference, so a scalar dep keeps behavior identical and
  // tsc happy.
  const remoteForecastDays: 7 | 14 | null =
    meData !== undefined ? extractForecastDays(meData) : null;
  React.useEffect(() => {
    if (!daysInitialized && remoteForecastDays !== null) {
      const stored = readStoredDays();
      setDays(stored !== null ? stored : remoteForecastDays);
      setDaysInitialized(true);
    }
  }, [remoteForecastDays, daysInitialized]);

  function handleSetDays(n: 7 | 14) {
    storeDays(n);
    setDaysInitialized(true);
    setDays(n);
  }

  const isPastRange = isBefore(addDays(startDate, days - 1), startOfDay(new Date()));
  const query = trpc.forecast.week.useQuery(
    { start_date: startDate, days },
    { staleTime: isPastRange ? 30 * 60_000 : 5 * 60_000 },
  );

  const complete = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      utils.forecast.week.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.completed.invalidate();
    },
  });

  const reschedule = trpc.forecast.reschedule.useMutation({
    onSuccess: () => {
      utils.forecast.week.invalidate();
      toast.success("Task rescheduled");
    },
    onError: () => toast.error("Failed to reschedule task"),
  });

  function handleComplete(id: string) {
    complete.mutate({ id });
  }

  function handleDrop(taskId: string, date: string) {
    reschedule.mutate({
      task_id: taskId,
      due_date: new Date(date + "T00:00:00"),
    });
  }

  function prevWeek() {
    setStartDate((d) => addDays(d, -7));
  }

  function nextWeek() {
    setStartDate((d) => addDays(d, 7));
  }

  function goToday() {
    setStartDate(startOfDay(new Date()));
  }

  type ForecastDay = { date: string; tasks: ForecastTask[] };
  type ForecastData = { days: ForecastDay[]; overdue: ForecastTask[]; calendar_connected: boolean } | undefined;
  const data = query.data as ForecastData;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-text-tertiary" />
          <h1 className="font-ui text-base font-semibold text-text-primary">Forecast</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-sm border border-border-subtle">
            <button
              type="button"
              onClick={() => handleSetDays(7)}
              className={cn(
                "px-2 py-1 font-ui text-2xs",
                days === 7 ? "bg-accent-primary-muted text-accent-primary" : "text-text-secondary hover:bg-surface-hover",
              )}
            >
              7 days
            </button>
            <button
              type="button"
              onClick={() => handleSetDays(14)}
              className={cn(
                "border-l border-border-subtle px-2 py-1 font-ui text-2xs",
                days === 14 ? "bg-accent-primary-muted text-accent-primary" : "text-text-secondary hover:bg-surface-hover",
              )}
            >
              14 days
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevWeek}
              aria-label="Previous week"
              className="flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              <ChevronLeft size={12} />
              Previous week
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-sm px-2 py-0.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextWeek}
              aria-label="Next week"
              className="flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              Next week
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {query.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-ui text-sm text-text-tertiary">Loading forecast…</p>
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            {data && data.overdue.length > 0 && (
              <div className="border-b border-border-subtle bg-accent-danger-muted px-3 py-2">
                <div className="mb-1 flex items-center gap-2">
                  <AlertCircle size={12} className="text-accent-danger" />
                  <span className="font-ui text-2xs font-semibold text-accent-danger">
                    Overdue — {data.overdue.length} task{data.overdue.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.overdue.map((task) => (
                    <div
                      key={task.id}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-accent-danger-muted bg-surface-base px-1.5 py-1"
                    >
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => handleComplete(task.id)}
                        aria-label="Complete task"
                      />
                      <span className="font-ui text-2xs text-text-primary">{task.title}</span>
                      {task.due_date && (
                        <span className="font-ui text-2xs text-accent-danger">
                          {localeFormatDate(task.due_date, locale)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!data?.calendar_connected && (
              <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-sunken px-3 py-1.5">
                <Calendar size={12} className="text-text-tertiary" />
                <span className="font-ui text-2xs text-text-tertiary">
                  Google Calendar not connected — events won&apos;t appear.
                </span>
                <a
                  href="/settings?section=integrations"
                  className="font-ui text-2xs text-accent-info hover:underline"
                >
                  Connect
                </a>
              </div>
            )}

            <div data-testid="forecast-day-grid" className="flex flex-1 gap-2 overflow-x-auto overflow-y-hidden p-3">
              {(data?.days ?? []).map((day) => (
                <DayColumn
                  key={day.date}
                  date={day.date}
                  tasks={day.tasks as ForecastTask[]}
                  onComplete={handleComplete}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
