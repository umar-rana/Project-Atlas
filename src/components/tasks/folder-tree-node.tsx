"use client";

import * as React from "react";
import Link from "next/link";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FolderNode = {
  id: string;
  name: string;
  collapsed: boolean;
  children: FolderNode[];
  project_count: number;
};

export type DragItem =
  | { type: "folder"; id: string; name: string }
  | { type: "project"; id: string; title: string; currentFolderId: string | null };

const PROJECT_COLOR_DOTS: Record<string, string> = {
  blue: "bg-cal-1-border",
  green: "bg-cal-2-border",
  amber: "bg-cal-3-border",
  red: "bg-cal-4-border",
  purple: "bg-cal-5-border",
  teal: "bg-cal-6-border",
  pink: "bg-cal-7-border",
  orange: "bg-cal-8-border",
};

export function colorDotClass(color?: string | null): string {
  if (!color) return "bg-text-disabled";
  return PROJECT_COLOR_DOTS[color] ?? "bg-text-disabled";
}

interface FolderTreeNodeProps {
  folder: FolderNode;
  depth: number;
  pathname: string;
  projectsByFolder: Map<string, { id: string; title: string; color: string | null; task_count: number }[]>;
  onToggle: (id: string, collapsed: boolean) => void;
  dragItem: DragItem | null;
  onDragStart: (item: DragItem) => void;
  onDropOnFolder: (targetFolderId: string) => void;
}

export function FolderTreeNode({
  folder,
  depth,
  pathname,
  projectsByFolder,
  onToggle,
  dragItem,
  onDragStart,
  onDropOnFolder,
}: FolderTreeNodeProps) {
  const active = pathname === `/tasks/folders/${folder.id}`;
  const projects = projectsByFolder.get(folder.id) ?? [];
  const [isDragOver, setIsDragOver] = React.useState(false);
  const expandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDragOver(e: React.DragEvent) {
    if (!dragItem) return;
    if (dragItem.type === "folder" && dragItem.id === folder.id) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    // Auto-expand collapsed folders after 800ms hover
    if (folder.collapsed && !expandTimerRef.current) {
      expandTimerRef.current = setTimeout(() => {
        onToggle(folder.id, false);
        expandTimerRef.current = null;
      }, 800);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
    if (!dragItem) return;
    if (dragItem.type === "folder" && dragItem.id === folder.id) return;
    onDropOnFolder(folder.id);
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-sm transition-colors",
          isDragOver && "bg-accent-primary-subtle/60 ring-1 ring-accent-primary",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          type="button"
          onClick={() => onToggle(folder.id, !folder.collapsed)}
          className="shrink-0 p-0.5 text-text-disabled hover:text-text-tertiary"
          aria-label={folder.collapsed ? "Expand folder" : "Collapse folder"}
        >
          {folder.collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </button>
        <Link
          href={`/tasks/folders/${folder.id}`}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragStart({ type: "folder", id: folder.id, name: folder.name });
          }}
          className={cn(
            "flex flex-1 cursor-grab items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-ui text-sm transition-colors active:cursor-grabbing",
            active
              ? "bg-accent-primary-subtle text-text-primary"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          {folder.collapsed ? (
            <Folder size={12} className="shrink-0 text-text-tertiary" />
          ) : (
            <FolderOpen size={12} className="shrink-0 text-text-tertiary" />
          )}
          <span className="flex-1 truncate">{folder.name}</span>
          {folder.project_count > 0 && (
            <span className="font-mono text-2xs text-text-tertiary tabular-nums">{folder.project_count}</span>
          )}
        </Link>
      </div>

      {!folder.collapsed && (
        <div className="mt-px flex flex-col gap-px">
          {projects.map((p) => {
            const href = `/tasks/projects/${p.id}`;
            const projActive = pathname === href;
            return (
              <Link
                key={p.id}
                href={href}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  onDragStart({ type: "project", id: p.id, title: p.title, currentFolderId: folder.id });
                }}
                style={{ paddingLeft: 20 + depth * 12 }}
                className={cn(
                  "flex cursor-grab items-center gap-1.5 rounded-sm py-0.5 pr-2 font-ui text-sm active:cursor-grabbing",
                  projActive
                    ? "bg-accent-primary-subtle text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", colorDotClass(p.color))} />
                <span className="flex-1 truncate">{p.title}</span>
                {p.task_count > 0 && (
                  <span className="font-mono text-2xs text-text-tertiary tabular-nums">{p.task_count}</span>
                )}
              </Link>
            );
          })}
          {folder.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              pathname={pathname}
              projectsByFolder={projectsByFolder}
              onToggle={onToggle}
              dragItem={dragItem}
              onDragStart={onDragStart}
              onDropOnFolder={onDropOnFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
