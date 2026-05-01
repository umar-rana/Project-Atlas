"use client";

import * as React from "react";
import Link from "next/link";
import { Flag, Inbox, CheckSquare } from "lucide-react";
import { isToday, isTomorrow, isPast } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/components/tasks/task-list";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";
import type { LocaleSettings } from "@/core/locale/formatters";

type Perspective = "inbox" | "today" | "flagged";

const CHIPS: { id: Perspective; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "today", label: "Today", icon: CheckSquare },
  { id: "flagged", label: "Flagged", icon: Flag },
];

function dueBadge(due: Date | string | null, locale: LocaleSettings): { label: string; className: string } | null {
  if (!due) return null;
  const d = typeof due === "string" ? new Date(due) : due;
  let label: string;
  let className: string;
  if (isPast(d) && !isToday(d)) {
    label = localeFormatDate(d, locale);
    className = "text-accent-danger";
  } else if (isToday(d)) {
    label = "Today";
    className = "text-accent-warning";
  } else if (isTomorrow(d)) {
    label = "Tomorrow";
    className = "text-text-tertiary";
  } else {
    label = localeFormatDate(d, locale);
    className = "text-text-tertiary";
  }
  return { label, className };
}

export default function MobileTasksPage() {
  const locale = useLocale();
  const [perspective, setPerspective] = React.useState<Perspective>("inbox");

  const query = trpc.tasks.list.useQuery({
    perspective,
    include_completed: false,
  });

  const tasks = (query.data as TaskRow[] | undefined) ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Tasks</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHIPS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPerspective(id)}
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
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {query.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <p className="font-ui text-sm text-text-tertiary">Loading…</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-ui text-base font-medium text-text-secondary">
              {perspective === "inbox" ? "Inbox zero" : "Nothing here"}
            </p>
            <p className="font-ui text-sm text-text-tertiary">
              {perspective === "inbox"
                ? "All caught up! Capture a new task to get started."
                : "No tasks for this view."}
            </p>
          </div>
        ) : (
          <ul role="list">
            {tasks.map((task) => {
              const badge = dueBadge(task.due_date, locale);
              return (
                <li key={task.id}>
                  <Link
                    href={`/m/tasks/${task.id}`}
                    className={cn(
                      "flex min-h-[56px] items-start gap-3 border-b border-border-subtle px-4 py-3",
                      "transition-colors active:bg-surface-hover",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0 rounded-full border-2",
                        task.status === "completed"
                          ? "border-accent-success bg-accent-success"
                          : "border-border-default",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "font-ui text-base leading-snug",
                          task.status === "completed"
                            ? "text-text-tertiary line-through"
                            : "text-text-primary",
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
                          <span className="font-ui text-xs text-accent-warning">Flagged</span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
