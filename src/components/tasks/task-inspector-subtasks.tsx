"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatEstimatedTime, sumEstimatedMinutes } from "@/core/aggregation/time-format";

interface InspectorSubtask {
  id: string;
  status: string;
  title: string;
  estimated_minutes?: number | null;
}

interface TaskInspectorSubtasksProps {
  parentTaskId: string;
  parentProjectId: string | null;
  subtasks: InspectorSubtask[];
  inTrash?: boolean;
}

export function TaskInspectorSubtasks({
  parentTaskId,
  parentProjectId,
  subtasks,
  inTrash,
}: TaskInspectorSubtasksProps): React.ReactElement {
  const utils = trpc.useUtils();
  const [newSubtaskInput, setNewSubtaskInput] = React.useState("");

  const subtaskCreate = trpc.tasks.create.useMutation({
    onSettled: () => {
      utils.tasks.get.invalidate({ id: parentTaskId });
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });
  const subtaskComplete = trpc.tasks.complete.useMutation({
    onSettled: () => {
      utils.tasks.get.invalidate({ id: parentTaskId });
      utils.tasks.list.invalidate();
      utils.tasks.completed.invalidate();
    },
  });
  const subtaskUncomplete = trpc.tasks.uncomplete.useMutation({
    onSettled: () => {
      utils.tasks.get.invalidate({ id: parentTaskId });
      utils.tasks.list.invalidate();
      utils.tasks.completed.invalidate();
    },
  });

  const incompleteSubtasks = subtasks.filter((s) => s.status !== "completed");
  const totalEstMins = sumEstimatedMinutes(incompleteSubtasks, false);
  const showTimeTotal = incompleteSubtasks.some((s) => (s.estimated_minutes ?? 0) > 0);

  return (
    <section className="mt-4">
      <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
        Subtasks
        {showTimeTotal && (
          <span className="ml-1 font-normal normal-case">
            · ~{formatEstimatedTime(totalEstMins)} total
          </span>
        )}
      </h3>
      {subtasks.length > 0 ? (
        <ul className="mb-1 flex flex-col gap-1">
          {subtasks.map((st) => (
            <li key={st.id} className="flex items-center gap-2 font-ui text-xs text-text-secondary">
              <Checkbox
                checked={st.status === "completed"}
                disabled={inTrash}
                onCheckedChange={(v) => {
                  if (v) subtaskComplete.mutate({ id: st.id });
                  else subtaskUncomplete.mutate({ id: st.id });
                }}
                aria-label={st.status === "completed" ? "Reopen subtask" : "Complete subtask"}
              />
              <span className={cn(st.status === "completed" && "text-text-tertiary line-through")}>
                {st.title}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {!inTrash ? (
        <input
          value={newSubtaskInput}
          onChange={(e) => setNewSubtaskInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const title = newSubtaskInput.trim();
              if (!title) return;
              subtaskCreate.mutate({
                title,
                parent_id: parentTaskId,
                project_id: parentProjectId ?? null,
              });
              setNewSubtaskInput("");
            }
          }}
          placeholder="Add subtask…"
          className="w-full rounded-sm border border-border-subtle bg-surface-base px-2 py-1 font-ui text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
        />
      ) : null}
    </section>
  );
}
