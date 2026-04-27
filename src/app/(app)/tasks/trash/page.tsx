"use client";

import * as React from "react";
import { Trash2, Inbox } from "lucide-react";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskListItem } from "@/components/tasks/task-list-item";
import type { TaskRow } from "@/components/tasks/task-list";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import { EmptyState } from "@/components/composed/empty-state";
import { toast } from "@/lib/toast";

export default function TrashPage() {
  const list = trpc.tasks.list.useQuery({ perspective: "trash", include_completed: true });
  const utils = trpc.useUtils();
  const empty = trpc.tasks.emptyTrash.useMutation({
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} task${r.count === 1 ? "" : "s"} forever`);
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const tasks = (list.data as TaskRow[] | undefined) ?? [];

  return (
    <TasksShell trash>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <div>
            <h1 className="font-ui text-base font-semibold text-text-primary">Trash</h1>
            <p className="font-ui text-2xs text-text-tertiary">Restore or permanently delete tasks.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (tasks.length === 0) return;
              if (confirm(`Permanently delete ${tasks.length} task${tasks.length === 1 ? "" : "s"}? This cannot be undone.`)) {
                empty.mutate();
              }
            }}
            disabled={tasks.length === 0 || empty.isPending}
            className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-accent-danger hover:bg-surface-hover disabled:opacity-50"
          >
            <Trash2 size={12} /> Empty trash
          </button>
        </header>

        {list.isLoading ? (
          <div className="flex flex-1 items-center justify-center font-ui text-2xs text-text-tertiary">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<Inbox size={28} />} title="Trash is empty" body="Deleted tasks land here for 30 days." />
          </div>
        ) : (
          <div role="grid" className="flex-1 overflow-y-auto">
            {tasks.map((task, idx) => (
              <TaskListItem
                key={task.id}
                task={task}
                selected={selectedTaskId === task.id}
                isFocused={idx === 0 && selectedTaskId === null}
                isMultiSelected={false}
                onSelect={() => setSelectedTaskId(task.id)}
                onMultiToggle={() => setSelectedTaskId(task.id)}
                inTrash
              />
            ))}
          </div>
        )}
      </div>
    </TasksShell>
  );
}
