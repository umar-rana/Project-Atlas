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
} from "@/components/ui/dropdown-menu";
import type { TablesFolderNode } from "@/server/routers/tablesFolders";

interface Props {
  folder: TablesFolderNode;
  depth: number;
  pathname: string;
  onRefresh: () => void;
}

export function TablesFolderTreeNode({ folder, depth, pathname, onRefresh }: Props): React.ReactElement {
  const [collapsed, setCollapsed] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(folder.name);

  const utils = trpc.useUtils();

  const rename = trpc.tablesFolders.rename.useMutation({
    onSuccess: () => {
      utils.tablesFolders.list.invalidate();
      setIsRenaming(false);
      onRefresh();
    },
    onError: () => toast.error("Failed to rename folder"),
  });

  const deleteFolder = trpc.tablesFolders.delete.useMutation({
    onSuccess: () => {
      utils.tablesFolders.list.invalidate();
      utils.tables.list.invalidate();
      onRefresh();
      toast.success("Folder deleted");
    },
    onError: () => toast.error("Failed to delete folder"),
  });

  const active = pathname.startsWith(`/notes/tables/folder/${folder.id}`);
  const hasChildren = folder.children.length > 0;

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = draftName.trim();
    if (!name || name === folder.name) { setIsRenaming(false); return; }
    rename.mutate({ id: folder.id, name });
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }} className="relative">
      <div className="group flex items-center gap-0.5 rounded-sm">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 p-0.5 text-text-disabled hover:text-text-tertiary"
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
              onKeyDown={(e) => { if (e.key === "Escape") setIsRenaming(false); }}
              onBlur={handleRenameSubmit}
              className="min-w-0 flex-1 rounded-sm border border-border-focus bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-primary focus:outline-none"
            />
          </form>
        ) : (
          <Link
            href={`/notes/tables/folder/${folder.id}`}
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
            {folder.table_count > 0 && (
              <span className="font-mono text-2xs text-text-tertiary tabular-nums">{folder.table_count}</span>
            )}
          </Link>
        )}

        <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-sm text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
              >
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => { setDraftName(folder.name); setIsRenaming(true); }}>
                <Pencil size={12} className="mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-accent-danger focus:text-accent-danger"
                onClick={() => {
                  if (confirm(`Delete folder "${folder.name}" and all its tables?`)) {
                    deleteFolder.mutate({ id: folder.id });
                  }
                }}
                disabled={deleteFolder.isPending}
              >
                <Trash2 size={12} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!collapsed && folder.children.length > 0 && (
        <div className="mt-px flex flex-col gap-px">
          {folder.children.map((child) => (
            <TablesFolderTreeNode
              key={child.id}
              folder={child as TablesFolderNode}
              depth={depth + 1}
              pathname={pathname}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
