"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { SubtaskRow } from "./subtask-row";

interface SubtaskItem {
  id: string;
  title: string;
  status: string;
  due_date: Date | string | null;
  flagged: boolean;
  estimated_minutes: number | null;
}

interface SubtaskSectionProps {
  parentTaskId: string;
  parentTaskTitle: string;
  parentProjectId: string | null;
  subtasks: SubtaskItem[];
  inTrash?: boolean;
}

export function SubtaskSection({
  parentTaskId,
  parentTaskTitle,
  parentProjectId,
  subtasks,
  inTrash,
}: SubtaskSectionProps) {
  const utils = trpc.useUtils();
  const [newTitle, setNewTitle] = React.useState("");
  const [addingNew, setAddingNew] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const invalidate = () => {
    utils.tasks.get.invalidate({ id: parentTaskId });
    utils.tasks.list.invalidate();
    utils.tasks.counts.invalidate();
  };

  const createMut = trpc.tasks.create.useMutation({ onSettled: invalidate });

  React.useEffect(() => {
    if (addingNew && inputRef.current) {
      inputRef.current.focus();
    }
  }, [addingNew]);

  const totalEstimate = subtasks.reduce(
    (acc, st) => acc + (st.estimated_minutes ?? 0),
    0,
  );

  function commitNew() {
    const title = newTitle.trim();
    if (title) {
      createMut.mutate({
        title,
        parent_id: parentTaskId,
        project_id: parentProjectId ?? null,
      });
      setNewTitle("");
    }
    setAddingNew(false);
  }

  return (
    <section className="mt-4">
      <h3 className="mb-1 flex items-center gap-2 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
        <span>Subtasks</span>
        {totalEstimate > 0 && (
          <span className="font-mono text-3xs tabular-nums">
            {totalEstimate} min est.
          </span>
        )}
      </h3>

      {subtasks.length > 0 && (
        <ul className="mb-1 flex flex-col gap-0.5">
          {subtasks.map((st) => (
            <SubtaskRow
              key={st.id}
              subtask={st}
              parentId={parentTaskId}
              parentTitle={parentTaskTitle}
              inTrash={inTrash}
              onInvalidate={invalidate}
            />
          ))}
        </ul>
      )}

      {!inTrash && (
        addingNew ? (
          <input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onBlur={commitNew}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitNew(); }
              if (e.key === "Escape") { setAddingNew(false); setNewTitle(""); }
            }}
            placeholder="New subtask…"
            className="w-full rounded-sm border border-border-subtle bg-surface-base px-2 py-1 font-ui text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1 rounded-sm px-1 py-0.5 font-ui text-xs text-text-tertiary hover:text-text-secondary"
          >
            <Plus size={11} />
            Add subtask
          </button>
        )
      )}
    </section>
  );
}
