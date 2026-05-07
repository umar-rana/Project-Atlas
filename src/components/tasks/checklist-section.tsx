"use client";

import * as React from "react";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { Checkbox } from "@/components/ui/checkbox";

interface ChecklistItem {
  id: string;
  title: string;
  completed_at: Date | string | null;
  position: string | number | { toString(): string };
}

interface ChecklistSectionProps {
  taskId: string;
  items: ChecklistItem[];
  inTrash?: boolean;
}

export function ChecklistSection({ taskId, items, inTrash }: ChecklistSectionProps) {
  const utils = trpc.useUtils();

  const invalidate = () => {
    utils.tasks.get.invalidate({ id: taskId });
    utils.tasks.list.invalidate();
  };

  const createMut = trpc.checklist.create.useMutation({ onSettled: invalidate });
  const updateMut = trpc.checklist.update.useMutation({ onSettled: invalidate });
  const deleteMut = trpc.checklist.delete.useMutation({ onSettled: invalidate });
  const reorderMut = trpc.checklist.reorder.useMutation({ onSettled: invalidate });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");
  const [newItemTitle, setNewItemTitle] = React.useState("");
  const newItemRef = React.useRef<HTMLInputElement>(null);
  const [addingNew, setAddingNew] = React.useState(false);

  const dragId = React.useRef<string | null>(null);

  const completedCount = items.filter((it) => it.completed_at != null).length;
  const totalCount = items.length;

  function startEdit(item: ChecklistItem) {
    setEditingId(item.id);
    setEditDraft(item.title);
  }

  function commitEdit(id: string) {
    const title = editDraft.trim();
    if (title) {
      updateMut.mutate({ id, title });
    }
    setEditingId(null);
  }

  function commitNew() {
    const title = newItemTitle.trim();
    if (title) {
      createMut.mutate({ task_id: taskId, title });
      setNewItemTitle("");
    }
    setAddingNew(false);
  }

  React.useEffect(() => {
    if (addingNew && newItemRef.current) {
      newItemRef.current.focus();
    }
  }, [addingNew]);

  return (
    <section className="mt-4">
      <h3 className="mb-1 flex items-center gap-2 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
        <span>Checklist</span>
        {totalCount > 0 && (
          <span className="font-mono text-3xs tabular-nums">
            {completedCount}/{totalCount}
          </span>
        )}
      </h3>

      {items.length > 0 && (
        <ul className="mb-1 flex flex-col gap-0.5">
          {items.map((item, idx) => (
            <li
              key={item.id}
              className="group flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-surface-raised"
              draggable={!inTrash}
              onDragStart={() => {
                dragId.current = item.id;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = dragId.current;
                if (!sourceId || sourceId === item.id) return;
                const sourceIdx = items.findIndex((it) => it.id === sourceId);
                const targetIdx = idx;
                const beforeIdx = sourceIdx > targetIdx ? targetIdx - 1 : targetIdx;
                const afterIdx = sourceIdx > targetIdx ? targetIdx : targetIdx + 1;
                reorderMut.mutate({
                  id: sourceId,
                  before_id: items[beforeIdx]?.id ?? null,
                  after_id: items[afterIdx]?.id ?? null,
                });
                dragId.current = null;
              }}
            >
              {!inTrash && (
                <span className="cursor-grab text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
                  <GripVertical size={10} aria-hidden />
                </span>
              )}
              <Checkbox
                checked={item.completed_at != null}
                disabled={inTrash}
                onCheckedChange={(v) => {
                  updateMut.mutate({ id: item.id, completed: Boolean(v) });
                }}
                aria-label={item.completed_at ? "Uncheck item" : "Check item"}
              />
              {editingId === item.id ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit(item.id);
                    }
                    if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                  className="flex-1 rounded-sm bg-surface-base px-1 py-px font-ui text-xs text-text-primary outline-none ring-1 ring-border-focus"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!inTrash) startEdit(item);
                  }}
                  className={cn(
                    "flex-1 truncate text-left font-ui text-xs",
                    item.completed_at != null
                      ? "text-text-tertiary line-through"
                      : "text-text-secondary",
                  )}
                >
                  {item.title}
                </button>
              )}
              {!inTrash && (
                <button
                  type="button"
                  onClick={() => deleteMut.mutate({ id: item.id })}
                  aria-label="Delete checklist item"
                  className="shrink-0 text-text-tertiary opacity-0 transition-opacity hover:text-accent-danger group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!inTrash &&
        (addingNew ? (
          <input
            ref={newItemRef}
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onBlur={commitNew}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitNew();
              }
              if (e.key === "Escape") {
                setAddingNew(false);
                setNewItemTitle("");
              }
            }}
            placeholder="New item…"
            className="w-full rounded-sm border border-border-subtle bg-surface-base px-2 py-1 font-ui text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1 rounded-sm px-1 py-0.5 font-ui text-xs text-text-tertiary hover:text-text-secondary"
          >
            <Plus size={11} />
            Add item
          </button>
        ))}
    </section>
  );
}
