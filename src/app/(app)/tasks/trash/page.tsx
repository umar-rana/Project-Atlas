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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


export default function TrashPage() {
  const list = trpc.tasks.list.useQuery({ perspective: "trash", include_completed: true });
  const counts = trpc.tasks.counts.useQuery({ timezoneOffset: 0 });
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
  const trashCount = counts.data?.trash ?? tasks.length;

  return (
    <TasksShell trash>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <div>
            <h1 className="font-ui text-base font-semibold text-text-primary">Trash</h1>
            <p className="font-ui text-2xs text-text-tertiary">Restore or permanently delete tasks.</p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={trashCount === 0 || empty.isPending}
                className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-accent-danger hover:bg-surface-hover disabled:opacity-50"
              >
                <Trash2 size={12} /> Empty trash
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete {trashCount} task{trashCount === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently and irrecoverably delete{" "}
                  <strong>{trashCount} task{trashCount === 1 ? "" : "s"}</strong> from your account.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => empty.mutate()} disabled={empty.isPending}>
                  Delete forever
                </AlertDialogAction>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
