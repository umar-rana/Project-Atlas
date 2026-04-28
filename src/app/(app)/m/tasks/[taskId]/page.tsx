"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Flag } from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface TaskDetailData {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  flagged: boolean;
  project_id: string | null;
  project: { id: string; title: string; color: string | null } | null;
  estimated_minutes: number | null;
  defer_date: Date | string | null;
  due_date: Date | string | null;
  contexts: { context: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string } }[];
}

export default function MobileTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const utils = trpc.useUtils();

  const { data: rawTask, isLoading } = trpc.tasks.get.useQuery(
    { id: taskId, includeDeleted: false },
    { staleTime: 1000 },
  );
  const task = rawTask as TaskDetailData | undefined;

  const complete = trpc.tasks.complete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.counts.invalidate();
    },
  });
  const uncomplete = trpc.tasks.uncomplete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.get.invalidate({ id: taskId });
      utils.tasks.counts.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-ui text-sm text-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-ui text-base font-medium text-text-secondary">Task not found</p>
        <Link href="/m/tasks" className="font-ui text-sm text-accent-primary">
          Back to tasks
        </Link>
      </div>
    );
  }

  const isCompleted = task.status === "completed";
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const deferDate = task.defer_date ? new Date(task.defer_date) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
        <Link
          href="/m/tasks"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
          aria-label="Back to tasks"
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="flex-1 truncate font-ui text-base font-semibold text-text-primary">
          Task Detail
        </h1>
        {task.flagged && (
          <Flag size={16} className="mr-2 shrink-0 fill-accent-warning text-accent-warning" />
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2
          className={cn(
            "font-ui text-xl font-semibold leading-snug",
            isCompleted ? "text-text-tertiary line-through" : "text-text-primary",
          )}
        >
          {task.title}
        </h2>

        <button
          type="button"
          onClick={() => {
            if (isCompleted) uncomplete.mutate({ id: task.id });
            else complete.mutate({ id: task.id });
          }}
          disabled={complete.isPending || uncomplete.isPending}
          className={cn(
            "mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl border font-ui text-sm font-medium transition-colors",
            isCompleted
              ? "border-border-default bg-surface-raised text-text-secondary hover:bg-surface-hover"
              : "border-accent-success bg-accent-success/10 text-accent-success hover:bg-accent-success/20",
          )}
        >
          {isCompleted ? "Reopen task" : "Mark complete"}
        </button>

        <div className="mt-6 space-y-4">
          {task.notes ? (
            <section>
              <p className="mb-1 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Notes
              </p>
              <p className="whitespace-pre-wrap font-ui text-sm leading-relaxed text-text-secondary">
                {task.notes}
              </p>
            </section>
          ) : null}

          <section className="space-y-2">
            {task.project ? (
              <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
                <span className="font-ui text-sm text-text-secondary">Project</span>
                <span className="font-ui text-sm font-medium text-text-primary">
                  {task.project.title}
                </span>
              </div>
            ) : null}

            {dueDate ? (
              <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
                <span className="font-ui text-sm text-text-secondary">Due</span>
                <span className="font-ui text-sm font-medium text-text-primary">
                  {format(dueDate, "MMMM d, yyyy")}
                </span>
              </div>
            ) : null}

            {deferDate ? (
              <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
                <span className="font-ui text-sm text-text-secondary">Deferred until</span>
                <span className="font-ui text-sm font-medium text-text-primary">
                  {format(deferDate, "MMMM d, yyyy")}
                </span>
              </div>
            ) : null}

            {task.estimated_minutes ? (
              <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
                <span className="font-ui text-sm text-text-secondary">Estimate</span>
                <span className="font-ui text-sm font-medium text-text-primary">
                  {task.estimated_minutes < 60
                    ? `${task.estimated_minutes} min`
                    : `${Math.round(task.estimated_minutes / 60 * 10) / 10} hr`}
                </span>
              </div>
            ) : null}
          </section>

          {task.contexts.length > 0 ? (
            <section>
              <p className="mb-1.5 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Contexts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {task.contexts.map((ct) => (
                  <span
                    key={ct.context.id}
                    className="rounded-full bg-accent-info-muted px-3 py-1 font-ui text-sm text-accent-info"
                  >
                    @{ct.context.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {task.tags.length > 0 ? (
            <section>
              <p className="mb-1.5 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tg) => (
                  <span
                    key={tg.tag.id}
                    className="rounded-full border border-border-subtle px-3 py-1 font-ui text-sm text-text-secondary"
                  >
                    #{tg.tag.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
