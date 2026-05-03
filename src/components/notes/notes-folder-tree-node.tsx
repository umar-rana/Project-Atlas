"use client";

import * as React from "react";
import Link from "next/link";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderInput,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

export type NotesFolderNode = {
  id: string;
  name: string;
  parent_id: string | null;
  note_count: number;
  children: NotesFolderNode[];
};

interface Props {
  folder: NotesFolderNode;
  depth: number;
  pathname: string;
  allFolders?: NotesFolderNode[];
  siblingIndex?: number;
  siblingCount?: number;
  onRefresh: () => void;
  onDrop?: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

function flattenFolders(
  nodes: NotesFolderNode[],
  excludeId: string,
  depth = 0,
): { id: string | null; label: string }[] {
  const out: { id: string | null; label: string }[] = [];
  for (const n of nodes) {
    if (n.id === excludeId) continue;
    out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
    out.push(...flattenFolders(n.children, excludeId, depth + 1));
  }
  return out;
}

export function NotesFolderTreeNode({
  folder,
  depth,
  pathname,
  allFolders = [],
  siblingIndex = 0,
  siblingCount = 1,
  onRefresh,
  onDrop,
}: Props): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(folder.name);
  const [dragOver, setDragOver] = React.useState<"before" | "after" | null>(null);

  const utils = trpc.useUtils();

  const rename = trpc.notesFolder.rename.useMutation({
    onSuccess: () => {
      utils.notesFolder.list.invalidate();
      setIsRenaming(false);
      onRefresh();
    },
    onError: () => toast.error("Failed to rename folder"),
  });

  const moveFolder = trpc.notesFolder.move.useMutation({
    onSuccess: () => {
      utils.notesFolder.list.invalidate();
      onRefresh();
      toast.success("Folder moved");
    },
    onError: () => toast.error("Failed to move folder"),
  });

  const reorderFolder = trpc.notesFolder.reorder.useMutation({
    onSuccess: () => {
      utils.notesFolder.list.invalidate();
      onRefresh();
    },
    onError: () => toast.error("Failed to reorder folder"),
  });

  const deleteFolder = trpc.notesFolder.delete.useMutation({
    onSuccess: () => {
      utils.notesFolder.list.invalidate();
      utils.notes.list.invalidate();
      onRefresh();
      toast.success("Folder deleted");
    },
    onError: () => toast.error("Failed to delete folder"),
  });

  const active = pathname === `/notes/folder/${folder.id}`;
  const hasChildren = folder.children.length > 0;
  const moveTargets = [
    { id: null, label: "— Root level —" },
    ...flattenFolders(allFolders, folder.id),
  ];
  const canMoveUp = siblingIndex > 0;
  const canMoveDown = siblingIndex < siblingCount - 1;

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = draftName.trim();
    if (!name || name === folder.name) {
      setIsRenaming(false);
      return;
    }
    rename.mutate({ id: folder.id, name });
  }

  function startRename() {
    setDraftName(folder.name);
    setIsRenaming(true);
  }

  function handleMenuMoveUp() {
    const siblings = allFolders.filter((f) => f.parent_id === folder.parent_id);
    const idx = siblings.findIndex((f) => f.id === folder.id);
    if (idx <= 0) return;
    const insertAfterId = idx >= 2 ? (siblings[idx - 2]?.id ?? null) : null;
    reorderFolder.mutate({
      id: folder.id,
      parent_id: folder.parent_id,
      insert_after_id: insertAfterId,
    });
  }

  function handleMenuMoveDown() {
    const siblings = allFolders.filter((f) => f.parent_id === folder.parent_id);
    const idx = siblings.findIndex((f) => f.id === folder.id);
    if (idx >= siblings.length - 1) return;
    const insertAfterId = siblings[idx + 1]?.id ?? null;
    reorderFolder.mutate({
      id: folder.id,
      parent_id: folder.parent_id,
      insert_after_id: insertAfterId,
    });
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", folder.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOver(e.clientY < midY ? "before" : "after");
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const pos = dragOver ?? "after";
    setDragOver(null);
    if (draggedId && draggedId !== folder.id && onDrop) {
      onDrop(draggedId, folder.id, pos);
    }
  }

  return (
    <div
      style={{ paddingLeft: depth > 0 ? 12 : 0 }}
      className={cn(
        "relative",
        dragOver === "before" && "border-t-2 border-accent-primary",
        dragOver === "after" && "border-b-2 border-accent-primary",
      )}
    >
      <div
        className="group flex items-center gap-0.5 rounded-sm"
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 p-0.5 text-text-disabled hover:text-text-tertiary"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {hasChildren ? (
            collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />
          ) : (
            <span className="size-[10px]" />
          )}
        </button>

        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setIsRenaming(false);
              }}
              onBlur={handleRenameSubmit}
              className="min-w-0 flex-1 rounded-sm border border-border-focus bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </form>
        ) : (
          <Link
            href={`/notes/folder/${folder.id}`}
            className={cn(
              "flex flex-1 items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-ui text-sm transition-colors",
              active
                ? "bg-accent-primary-subtle text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {collapsed || !hasChildren ? (
              <Folder size={12} className="shrink-0 text-text-tertiary" />
            ) : (
              <FolderOpen size={12} className="shrink-0 text-text-tertiary" />
            )}
            <span className="flex-1 truncate">{folder.name}</span>
            {folder.note_count > 0 && (
              <span className="font-mono text-2xs text-text-tertiary tabular-nums">{folder.note_count}</span>
            )}
          </Link>
        )}

        <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-sm text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
                aria-label="Folder actions"
              >
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={startRename}>
                <Pencil size={12} className="mr-2" />
                Rename
              </DropdownMenuItem>

              {canMoveUp && (
                <DropdownMenuItem
                  onClick={handleMenuMoveUp}
                  disabled={reorderFolder.isPending}
                >
                  <ArrowUp size={12} className="mr-2" />
                  Move up
                </DropdownMenuItem>
              )}
              {canMoveDown && (
                <DropdownMenuItem
                  onClick={handleMenuMoveDown}
                  disabled={reorderFolder.isPending}
                >
                  <ArrowDown size={12} className="mr-2" />
                  Move down
                </DropdownMenuItem>
              )}

              {moveTargets.length > 1 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput size={12} className="mr-2" />
                    Move to
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-56 w-48 overflow-y-auto">
                    {moveTargets.map((target, i) => (
                      <DropdownMenuItem
                        key={target.id ?? `root-${i}`}
                        onClick={() => moveFolder.mutate({ id: folder.id, parent_id: target.id })}
                        disabled={moveFolder.isPending || target.id === folder.parent_id}
                        className={cn(target.id === folder.parent_id && "opacity-50")}
                      >
                        {target.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-accent-danger focus:text-accent-danger"
                onClick={() => deleteFolder.mutate({ id: folder.id })}
                disabled={deleteFolder.isPending}
              >
                <Trash2 size={12} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!collapsed && folder.children.length > 0 && (
        <div className="mt-px flex flex-col gap-px">
          {folder.children.map((child, idx) => (
            <NotesFolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              pathname={pathname}
              allFolders={allFolders}
              siblingIndex={idx}
              siblingCount={folder.children.length}
              onRefresh={onRefresh}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}
