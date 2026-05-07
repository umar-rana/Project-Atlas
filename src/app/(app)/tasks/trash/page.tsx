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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function EntityCountLine({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <li>
      <strong>{count}</strong> {label}
    </li>
  );
}

export default function TrashPage() {
  const list = trpc.tasks.list.useQuery({ perspective: "trash", include_completed: true });
  const preview = trpc.trash.preview.useQuery();
  const utils = trpc.useUtils();
  const [confirmInput, setConfirmInput] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const empty = trpc.trash.empty.useMutation({
    onSuccess: (r) => {
      const total = Object.values(r.deleted).reduce((a, b) => a + b, 0);
      toast.success(`Permanently deleted ${total} item${total === 1 ? "" : "s"}`);
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.trash.preview.invalidate();
      setOpen(false);
      setConfirmInput("");
    },
  });

  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const tasks = (list.data as TaskRow[] | undefined) ?? [];

  const counts = preview.data ?? { tasks: 0, notes: 0, projects: 0, attachments: 0 };
  const totalCount = counts.tasks + counts.notes + counts.projects + counts.attachments;
  const isConfirmed = confirmInput === "DELETE";

  return (
    <TasksShell trash>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <div>
            <h1 className="font-ui text-base font-semibold text-text-primary">Trash</h1>
            <p className="font-ui text-2xs text-text-tertiary">
              Restore or permanently delete tasks.
            </p>
          </div>

          <AlertDialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setConfirmInput("");
            }}
          >
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={totalCount === 0 || empty.isPending}
                className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-accent-danger hover:bg-surface-hover disabled:opacity-50"
              >
                <Trash2 size={12} /> Empty trash
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete all trashed items?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      This will permanently and irrecoverably delete the following from your
                      account. This action cannot be undone.
                    </p>
                    {totalCount > 0 && (
                      <ul className="list-disc space-y-0.5 pl-5 font-ui text-sm text-text-primary">
                        <EntityCountLine
                          label={counts.tasks === 1 ? "task" : "tasks"}
                          count={counts.tasks}
                        />
                        <EntityCountLine
                          label={counts.projects === 1 ? "project" : "projects"}
                          count={counts.projects}
                        />
                        <EntityCountLine
                          label={counts.notes === 1 ? "note" : "notes"}
                          count={counts.notes}
                        />
                        <EntityCountLine
                          label={counts.attachments === 1 ? "attachment" : "attachments"}
                          count={counts.attachments}
                        />
                      </ul>
                    )}
                    <div>
                      <label className="mb-1 block font-ui text-xs text-text-secondary">
                        Type <strong>DELETE</strong> to confirm:
                      </label>
                      <input
                        type="text"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        placeholder="DELETE"
                        className="w-full rounded-md border border-border-subtle bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-danger"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isConfirmed && !empty.isPending) {
                            empty.mutate({ confirmation_token: "DELETE" });
                          }
                        }}
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <button
                  type="button"
                  disabled={!isConfirmed || empty.isPending}
                  onClick={() => empty.mutate({ confirmation_token: "DELETE" })}
                  className="inline-flex items-center justify-center rounded-md bg-accent-danger px-4 py-2 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  Delete forever
                </button>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        {list.isLoading ? (
          <div className="flex flex-1 items-center justify-center font-ui text-2xs text-text-tertiary">
            Loading…
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<Inbox size={28} />}
              title="Trash is empty"
              body="Deleted tasks land here for 30 days."
            />
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
