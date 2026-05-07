"use client";

import * as React from "react";
import { CheckSquare, Trash2, Folder, Hash, X, Tag as TagIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useTasksStore } from "@/lib/tasks/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";

export function BulkActionBar(): React.ReactElement | null {
  const selectedIds = useTasksStore((s) => s.selectedTaskIds);
  const clearSelection = useTasksStore((s) => s.clearSelection);
  const ids = React.useMemo(() => Array.from(selectedIds), [selectedIds]);
  const utils = trpc.useUtils();

  const projects = trpc.projects.list.useQuery({ status: "active" }, { enabled: ids.length > 1 });
  const contexts = trpc.contexts.list.useQuery(undefined, { enabled: ids.length > 1 });
  const tags = trpc.tags.list.useQuery({ limit: 200 }, { enabled: ids.length > 1 });

  const bulkComplete = trpc.tasks.bulkComplete.useMutation({
    onSuccess: () => {
      toast.success("Marked complete");
      clearSelection();
    },
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });
  const bulkDelete = trpc.tasks.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success("Moved to trash");
      clearSelection();
    },
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });
  const bulkMove = trpc.tasks.bulkMoveToProject.useMutation({
    onSuccess: () => {
      toast.success("Moved to project");
      clearSelection();
    },
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.projects.list.invalidate();
    },
  });
  const bulkAddContext = trpc.tasks.bulkAddContext.useMutation({
    onSuccess: () => {
      toast.success("Context added");
      clearSelection();
    },
    onSettled: () => utils.tasks.list.invalidate(),
  });
  const bulkAddTag = trpc.tasks.bulkAddTag.useMutation({
    onSuccess: () => {
      toast.success("Tag added");
      clearSelection();
    },
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tags.list.invalidate();
    },
  });

  if (ids.length < 2) return null;

  return (
    <div className="border-t border-border-subtle bg-surface-overlay px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="font-ui text-xs text-text-secondary">{ids.length} selected</span>
        <div className="flex flex-1 items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => bulkComplete.mutate({ ids })}
            className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
          >
            <CheckSquare size={12} /> Complete
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover">
              <Folder size={12} /> Move to…
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => bulkMove.mutate({ ids, project_id: null })}>
                Inbox
              </DropdownMenuItem>
              {(projects.data ?? []).map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => bulkMove.mutate({ ids, project_id: p.id })}
                >
                  {p.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover">
              <Hash size={12} /> Add context…
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(contexts.data ?? []).map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => bulkAddContext.mutate({ ids, context_id: c.id })}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
              {(contexts.data ?? []).length === 0 ? (
                <DropdownMenuItem disabled>No contexts yet</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover">
              <TagIcon size={12} /> Add tag…
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(tags.data ?? []).slice(0, 30).map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => bulkAddTag.mutate({ ids, tag_id: t.id })}
                >
                  #{t.name}
                </DropdownMenuItem>
              ))}
              {(tags.data ?? []).length === 0 ? (
                <DropdownMenuItem disabled>No tags yet</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => bulkDelete.mutate({ ids })}
            className="inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-1 font-ui text-2xs text-accent-danger hover:bg-surface-hover"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="inline-flex items-center justify-center rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
