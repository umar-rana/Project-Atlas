"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Inbox,
  CalendarDays,
  Flag,
  Folder,
  Hash,
  Tag as TagIcon,
  Trash2,
  Plus,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  CalendarRange,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";
import { ProjectAddForm } from "./project-add-form";
import { ContextAddForm } from "./context-add-form";
import { toast } from "@/lib/toast";
import { FolderTreeNode, colorDotClass, type DragItem } from "./folder-tree-node";

interface NavRowProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

function NavRow({ href, active, icon, label, badge }: NavRowProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm transition-colors",
        active
          ? "bg-accent-primary-subtle text-text-primary"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      )}
    >
      <span className="shrink-0 text-text-tertiary">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <Badge variant="neutral" count={badge} />
      ) : null}
    </Link>
  );
}

function SectionHeader({
  label,
  expanded,
  onToggle,
  onAdd,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between px-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary hover:text-text-secondary"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${label.toLowerCase()}`}
          className="inline-flex size-4 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <Plus size={11} />
        </button>
      ) : null}
    </div>
  );
}

export function TasksSidebar(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();

  const counts = trpc.tasks.counts.useQuery(undefined, { refetchOnWindowFocus: false });
  const reviewCount = trpc.review.overdueCount.useQuery(undefined, { refetchOnWindowFocus: false });
  const projects = trpc.projects.list.useQuery({ status: "active" });
  const foldersQuery = trpc.folders.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const contexts = trpc.contexts.list.useQuery();
  const tags = trpc.tags.list.useQuery({ limit: 100 });

  const utils = trpc.useUtils();

  const toggleCollapsed = trpc.folders.toggleCollapsed.useMutation({
    onSuccess: () => utils.folders.list.invalidate(),
  });

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: (folder) => {
      utils.folders.list.invalidate();
      router.push(`/tasks/folders/${folder.id}`);
    },
    onError: () => toast.error("Failed to create folder"),
  });

  const [dragItem, setDragItem] = React.useState<DragItem | null>(null);
  const [isRootDragOver, setIsRootDragOver] = React.useState(false);

  const moveFolderMutation = trpc.folders.move.useMutation({
    onSuccess: () => utils.folders.list.invalidate(),
    onError: () => {
      toast.error("Failed to move folder");
      utils.folders.list.invalidate();
    },
  });

  const moveProjectMutation = trpc.folders.moveProject.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.folders.list.invalidate();
    },
    onError: () => {
      toast.error("Failed to move project");
      utils.projects.list.invalidate();
    },
  });

  function handleDragStart(item: DragItem) {
    setDragItem(item);
  }

  function handleDropOnFolder(targetFolderId: string) {
    if (!dragItem) return;
    if (dragItem.type === "folder") {
      if (dragItem.id !== targetFolderId) {
        moveFolderMutation.mutate({ id: dragItem.id, parent_id: targetFolderId });
      }
    } else {
      if (dragItem.currentFolderId !== targetFolderId) {
        moveProjectMutation.mutate({ project_id: dragItem.id, folder_id: targetFolderId });
      }
    }
    setDragItem(null);
  }

  function handleDropOnRoot(e: React.DragEvent) {
    e.preventDefault();
    setIsRootDragOver(false);
    if (!dragItem) return;
    if (dragItem.type === "folder") {
      moveFolderMutation.mutate({ id: dragItem.id, parent_id: null });
    } else {
      if (dragItem.currentFolderId !== null) {
        moveProjectMutation.mutate({ project_id: dragItem.id, folder_id: null });
      }
    }
    setDragItem(null);
  }

  const [projectsOpen, setProjectsOpen] = React.useState(true);
  const [contextsOpen, setContextsOpen] = React.useState(true);
  const [tagsOpen, setTagsOpen] = React.useState(true);
  const [showAllTags, setShowAllTags] = React.useState(false);
  const [addingProject, setAddingProject] = React.useState(false);
  const [addingContext, setAddingContext] = React.useState(false);

  const visibleTags = React.useMemo(() => {
    const list = tags.data ?? [];
    return showAllTags ? list : list.slice(0, 20);
  }, [tags.data, showAllTags]);

  const folders = foldersQuery.data ?? [];

  const projectsByFolder = React.useMemo(() => {
    const map = new Map<string, { id: string; title: string; color: string | null; task_count: number }[]>();
    const allProjects = projects.data ?? [];
    for (const p of allProjects) {
      if (p.folder_id) {
        const existing = map.get(p.folder_id) ?? [];
        existing.push({ id: p.id, title: p.title, color: p.color, task_count: p.task_count });
        map.set(p.folder_id, existing);
      }
    }
    return map;
  }, [projects.data]);

  const rootProjects = React.useMemo(() => {
    return (projects.data ?? []).filter((p) => !p.folder_id);
  }, [projects.data]);

  function handleAddFolder() {
    const name = prompt("Folder name")?.trim();
    if (!name) return;
    createFolder.mutate({ name });
  }

  function handleToggleFolder(id: string, collapsed: boolean) {
    toggleCollapsed.mutate({ id, collapsed });
  }

  return (
    <nav aria-label="Task perspectives" className="flex h-full flex-col gap-px overflow-y-auto p-2" onDragEnd={() => { setDragItem(null); setIsRootDragOver(false); }}>
      <NavRow
        href="/tasks/inbox"
        active={pathname === "/tasks/inbox"}
        icon={<Inbox size={14} />}
        label="Inbox"
        badge={counts.data?.inbox}
      />
      <NavRow
        href="/tasks/today"
        active={pathname === "/tasks/today"}
        icon={<CalendarDays size={14} />}
        label="Today"
        badge={counts.data?.today}
      />
      <NavRow
        href="/tasks/forecast"
        active={pathname === "/tasks/forecast"}
        icon={<CalendarRange size={14} />}
        label="Forecast"
      />
      <NavRow
        href="/tasks/flagged"
        active={pathname === "/tasks/flagged"}
        icon={<Flag size={14} />}
        label="Flagged"
        badge={counts.data?.flagged}
      />
      <NavRow
        href="/tasks/review"
        active={pathname === "/tasks/review"}
        icon={<RefreshCw size={14} />}
        label="Review"
        badge={reviewCount.data?.count}
      />

      <SectionHeader
        label="Projects"
        expanded={projectsOpen}
        onToggle={() => setProjectsOpen(!projectsOpen)}
        onAdd={() => setAddingProject(true)}
      />
      {projectsOpen ? (
        <div className="flex flex-col gap-px">
          <NavRow
            href="/tasks/projects"
            active={pathname === "/tasks/projects"}
            icon={<Folder size={14} />}
            label="All projects"
          />
          <button
            type="button"
            onClick={handleAddFolder}
            className="flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-ui text-2xs text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
          >
            <Plus size={10} />
            Add folder
          </button>
          {addingProject ? (
            <div className="px-2 py-1">
              <ProjectAddForm onDone={() => setAddingProject(false)} />
            </div>
          ) : null}

          {folders.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              pathname={pathname}
              projectsByFolder={projectsByFolder}
              onToggle={handleToggleFolder}
              dragItem={dragItem}
              onDragStart={handleDragStart}
              onDropOnFolder={handleDropOnFolder}
            />
          ))}

          {/* Root drop zone: appears when dragging items from a folder */}
          {dragItem !== null && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsRootDragOver(true); }}
              onDragLeave={() => setIsRootDragOver(false)}
              onDrop={handleDropOnRoot}
              className={cn(
                "mx-1 rounded-sm border border-dashed py-1 text-center font-ui text-2xs transition-colors",
                isRootDragOver
                  ? "border-accent-primary bg-accent-primary-subtle text-accent-primary"
                  : "border-border-subtle text-text-disabled",
              )}
            >
              Drop here to move to root
            </div>
          )}

          {rootProjects.map((p) => {
            const href = `/tasks/projects/${p.id}`;
            const active = pathname === href;
            return (
              <Link
                key={p.id}
                href={href}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  handleDragStart({ type: "project", id: p.id, title: p.title, currentFolderId: null });
                }}
                className={cn(
                  "flex cursor-grab items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm active:cursor-grabbing",
                  active
                    ? "bg-accent-primary-subtle text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", colorDotClass(p.color))} aria-hidden />
                <span className="flex-1 truncate">{p.title}</span>
                {p.task_count > 0 ? (
                  <span className="font-mono text-2xs text-text-tertiary tabular-nums">{p.task_count}</span>
                ) : null}
              </Link>
            );
          })}
          {projects.data?.length === 0 && !addingProject ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No projects yet</p>
          ) : null}
        </div>
      ) : null}

      <SectionHeader
        label="Contexts"
        expanded={contextsOpen}
        onToggle={() => setContextsOpen(!contextsOpen)}
        onAdd={() => setAddingContext(true)}
      />
      {contextsOpen ? (
        <div className="flex flex-col gap-px">
          {addingContext ? (
            <div className="px-2 py-1">
              <ContextAddForm onDone={() => setAddingContext(false)} />
            </div>
          ) : null}
          {(contexts.data ?? []).map((c) => {
            const href = `/tasks/contexts/${c.id}`;
            const active = pathname === href;
            return (
              <NavRow
                key={c.id}
                href={href}
                active={active}
                icon={<Hash size={14} />}
                label={c.name}
                badge={c.task_count}
              />
            );
          })}
          {contexts.data?.length === 0 && !addingContext ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No contexts yet</p>
          ) : null}
        </div>
      ) : null}

      <SectionHeader
        label="Tags"
        expanded={tagsOpen}
        onToggle={() => setTagsOpen(!tagsOpen)}
      />
      {tagsOpen ? (
        <div className="flex flex-col gap-px">
          {visibleTags.map((t) => {
            const href = `/tasks/tags/${encodeURIComponent(t.name)}`;
            const active = pathname === href;
            return (
              <Link
                key={t.id}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1 font-ui text-sm",
                  active
                    ? "bg-accent-primary-subtle text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <TagIcon size={12} className="text-text-tertiary" />
                <span className="flex-1 truncate">#{t.name}</span>
                {t.usage_count > 0 ? (
                  <span className="font-mono text-2xs text-text-tertiary tabular-nums">{t.usage_count}</span>
                ) : null}
              </Link>
            );
          })}
          {(tags.data?.length ?? 0) > 20 ? (
            <button
              type="button"
              onClick={() => setShowAllTags(!showAllTags)}
              className="px-2 py-1 text-left font-ui text-2xs text-text-tertiary hover:text-text-secondary"
            >
              {showAllTags ? "Show top 20" : "Show all tags"}
            </button>
          ) : null}
          {tags.data?.length === 0 ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No tags yet</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-px border-t border-border-subtle pt-2">
        <NavRow
          href="/tasks/completed"
          active={pathname === "/tasks/completed"}
          icon={<CheckCircle2 size={14} />}
          label="Completed"
        />
        <NavRow
          href="/tasks/trash"
          active={pathname === "/tasks/trash"}
          icon={<Trash2 size={14} />}
          label="Trash"
          badge={counts.data?.trash}
        />
      </div>
    </nav>
  );
}
