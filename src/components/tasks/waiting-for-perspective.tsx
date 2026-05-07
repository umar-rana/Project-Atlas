"use client";

import * as React from "react";
import { Clock, CheckCircle2, RefreshCw, ArrowRight, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import { EmptyState } from "@/components/composed/empty-state";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { isPast, addHours } from "date-fns";
import { toast } from "@/lib/toast";

type WaitingForTask = {
  id: string;
  title: string;
  notes: string | null;
  delegated_to_text: string | null;
  follow_up_date: Date | string | null;
  tags: { tag: { id: string; name: string; color: string | null } }[];
  project: { id: string; title: string; color: string | null } | null;
  created_at: Date | string;
};

function followUpIndicator(followUpDate: Date | string | null): "red" | "amber" | "neutral" {
  if (!followUpDate) return "neutral";
  const d = new Date(followUpDate);
  const now = new Date();
  if (isPast(d)) return "red";
  if (d <= addHours(now, 24)) return "amber";
  return "neutral";
}

const INDICATOR_CLASSES = {
  red: "text-accent-danger",
  amber: "text-accent-warning",
  neutral: "text-text-tertiary",
};

function WaitingForTaskCard({
  task,
  onMarkReceived,
  onFollowUp,
  onConvertToActive,
}: {
  task: WaitingForTask;
  onMarkReceived: (id: string) => void;
  onFollowUp: (id: string) => void;
  onConvertToActive: (id: string) => void;
}) {
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const isSelected = selectedTaskId === task.id;
  const indicator = followUpIndicator(task.follow_up_date);
  const followUpDate = task.follow_up_date ? new Date(task.follow_up_date) : null;

  return (
    <div
      role="row"
      onClick={() => setSelectedTaskId(task.id)}
      className={cn(
        "group flex cursor-pointer items-start gap-3 border-b border-border-subtle px-3 py-2.5 transition-colors hover:bg-surface-hover",
        isSelected && "bg-accent-primary-subtle",
      )}
    >
      <Clock
        size={14}
        className={cn("mt-0.5 shrink-0", INDICATOR_CLASSES[indicator])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-ui text-sm text-text-primary">{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {followUpDate && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-ui text-2xs",
                INDICATOR_CLASSES[indicator],
              )}
            >
              <Calendar size={10} />
              Follow up {followUpDate.toLocaleDateString()}
            </span>
          )}
          {task.project && (
            <span className="font-ui text-2xs text-text-tertiary">{task.project.title}</span>
          )}
          {task.tags.map((t) => (
            <span
              key={t.tag.id}
              className="rounded-full bg-surface-raised px-1.5 py-0.5 font-ui text-2xs text-text-tertiary"
            >
              #{t.tag.name}
            </span>
          ))}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
        <Hint label="Mark received">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkReceived(task.id);
            }}
            className="hover:border-accent-success/30 flex items-center gap-1 rounded-sm border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-secondary transition-colors hover:bg-accent-success-muted hover:text-accent-success"
          >
            <CheckCircle2 size={11} /> Received
          </button>
        </Hint>
        <Hint label="Record follow-up">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFollowUp(task.id);
            }}
            className="hover:border-accent-warning/30 flex items-center gap-1 rounded-sm border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-secondary transition-colors hover:bg-accent-warning-muted hover:text-accent-warning"
          >
            <RefreshCw size={11} /> Follow up
          </button>
        </Hint>
        <Hint label="Convert to active">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConvertToActive(task.id);
            }}
            className="flex items-center gap-1 rounded-sm border border-border-subtle px-1.5 py-0.5 font-ui text-2xs text-text-secondary transition-colors hover:bg-surface-hover"
          >
            <ArrowRight size={11} /> Active
          </button>
        </Hint>
      </div>
    </div>
  );
}

export function WaitingForPerspective(): React.ReactElement {
  const utils = trpc.useUtils();
  const query = trpc.tasks.waitingFor.useQuery(undefined, { staleTime: 30_000 });
  const { data: rawUser } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const tasksPrefs =
    typeof (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs === "object" &&
    (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs !== null
      ? ((rawUser as { tasks_prefs?: unknown } | undefined)!.tasks_prefs as Record<string, unknown>)
      : {};
  const waitingForWindow =
    (tasksPrefs.gtd_waiting_for_default_window as string | undefined) ?? "1w";
  const followUpWindowDays = waitingForWindow === "1m" ? 30 : waitingForWindow === "2w" ? 14 : 7;

  const markReceived = trpc.tasks.markReceived.useMutation({
    onSuccess: () => {
      toast.success("Marked as received");
      utils.tasks.waitingFor.invalidate();
      utils.tasks.counts.invalidate();
    },
  });

  const recordFollowUp = trpc.tasks.recordFollowUp.useMutation({
    onSuccess: () => {
      toast.success("Follow-up recorded");
      utils.tasks.waitingFor.invalidate();
    },
  });

  const convertToActive = trpc.tasks.convertToActive.useMutation({
    onSuccess: () => {
      toast.success("Converted to active");
      utils.tasks.waitingFor.invalidate();
      utils.tasks.counts.invalidate();
      utils.tasks.list.invalidate();
    },
  });

  const tasks = (query.data ?? []) as WaitingForTask[];

  const grouped = React.useMemo(() => {
    const map = new Map<string, WaitingForTask[]>();
    for (const t of tasks) {
      const key = t.delegated_to_text ?? "(unassigned)";
      const existing = map.get(key) ?? [];
      existing.push(t);
      map.set(key, existing);
    }
    for (const [key, list] of map) {
      map.set(
        key,
        list.sort((a, b) => {
          if (a.follow_up_date && b.follow_up_date) {
            return new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime();
          }
          if (a.follow_up_date) return -1;
          if (b.follow_up_date) return 1;
          return 0;
        }),
      );
    }
    return map;
  }, [tasks]);

  const groupKeys = [...grouped.keys()].sort((a, b) => {
    if (a === "(unassigned)") return 1;
    if (b === "(unassigned)") return -1;
    return a.localeCompare(b);
  });

  const totalCount = tasks.length;

  function handleFollowUp(id: string) {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + followUpWindowDays);
    recordFollowUp.mutate({ id, follow_up_date: newDate.toISOString() });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="min-w-0">
          <h1 className="font-ui text-base font-semibold text-text-primary">Waiting For</h1>
          <p className="font-ui text-2xs text-text-tertiary">
            Tasks delegated to others, awaiting response.
          </p>
        </div>
        <span className="font-mono text-2xs tabular-nums text-text-tertiary">
          {totalCount} {totalCount === 1 ? "item" : "items"}
        </span>
      </header>

      {query.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Clock size={28} aria-hidden />}
            title="Nothing waiting"
            body="Use the Waiting For disposition in processing mode to track delegated tasks."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {groupKeys.map((person) => {
            const items = grouped.get(person) ?? [];
            return (
              <div key={person}>
                <div className="bg-surface-base/95 sticky top-0 z-10 border-b border-border-subtle px-3 py-1 backdrop-blur-sm">
                  <p className="font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                    {person}
                    <span className="ml-1.5 font-mono font-normal">({items.length})</span>
                  </p>
                </div>
                {items.map((task) => (
                  <WaitingForTaskCard
                    key={task.id}
                    task={task}
                    onMarkReceived={(id) => markReceived.mutate({ id })}
                    onFollowUp={handleFollowUp}
                    onConvertToActive={(id) => convertToActive.mutate({ id })}
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
