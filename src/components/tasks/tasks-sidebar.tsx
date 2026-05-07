"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Inbox,
  CalendarDays,
  Flag,
  Folder,
  Trash2,
  Plus,
  CheckCircle2,
  CalendarRange,
  RefreshCw,
  Sunrise,
  ChevronRight,
  ChevronDown,
  Archive,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { ProjectAddForm } from "./project-add-form";
import { toast } from "@/lib/toast";
import { FolderTreeNode, colorDotClass, type DragItem } from "./folder-tree-node";
import { HierarchyAuditBanner } from "./hierarchy-audit-banner";
import { NavRow } from "@/components/sidebar/nav-row";
import { SectionHeader, useSidebarSection } from "@/components/sidebar/section-header";
import { TagsSection } from "@/components/sidebar/tags-section";
import { ContextsSection } from "@/components/sidebar/contexts-section";
import { useMidnightRefresh } from "@/hooks/use-midnight-refresh";
import { displayType, getSuggestedTypes } from "@/core/projects/type-suggestions";
import { useTypeConfig } from "@/core/projects/type-config-context";
import { CustomTypeDialog } from "@/components/projects/custom-type-dialog";

function ProjectSubGroup({
  groupType,
  projects,
  pathname,
  dragItem,
  onDragStart,
}: {
  groupType: string;
  projects: { id: string; title: string; color: string | null; task_count: number }[];
  pathname: string;
  dragItem: DragItem | null;
  onDragStart: (item: DragItem) => void;
}) {
  const [open, setOpen] = useSidebarSection(`projects-type-${groupType}`, true);
  const { getIcon, getColor } = useTypeConfig();

  if (projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-px">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1 px-2 py-0.5 font-ui text-3xs font-semibold uppercase tracking-caps text-text-disabled hover:text-text-tertiary"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        <span
          className="inline-block size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: getColor(groupType) }}
          aria-hidden
        />
        <span className="mr-0.5">{getIcon(groupType)}</span>
        <span>{displayType(groupType)}</span>
        <span className="ml-0.5 font-mono text-3xs tabular-nums">({projects.length})</span>
      </button>
      {open &&
        projects.map((p) => {
          const href = `/tasks/projects/${p.id}`;
          const active = pathname === href;
          return (
            <Link
              key={p.id}
              href={href}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStart({ type: "project", id: p.id, title: p.title, currentFolderId: null });
              }}
              className={cn(
                "flex cursor-grab items-center gap-2 rounded-sm px-2 py-1 pl-6 font-ui text-sm active:cursor-grabbing",
                active
                  ? "bg-accent-primary-subtle text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              <span
                className={cn("size-2 shrink-0 rounded-full", colorDotClass(p.color))}
                aria-hidden
              />
              <span className="flex-1 truncate">{p.title}</span>
              {p.task_count > 0 ? (
                <span className="font-mono text-2xs tabular-nums text-text-tertiary">
                  {p.task_count}
                </span>
              ) : null}
            </Link>
          );
        })}
    </div>
  );
}

export function TasksSidebar(): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { getIcon, getColor } = useTypeConfig();

  const timezoneOffset = React.useMemo(() => new Date().getTimezoneOffset(), []);
  const counts = trpc.tasks.counts.useQuery({ timezoneOffset }, { refetchOnWindowFocus: false });
  const reviewCount = trpc.review.overdueCount.useQuery(undefined, { refetchOnWindowFocus: false });
  const projects = trpc.projects.list.useQuery({ status: "active" });
  const distinctTypes = trpc.projects.distinctTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const foldersQuery = trpc.folders.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const utils = trpc.useUtils();

  const handleMidnight = React.useCallback(() => {
    utils.tasks.counts.invalidate();
  }, [utils]);
  useMidnightRefresh(handleMidnight);

  const toggleCollapsed = trpc.folders.toggleCollapsed.useMutation({
    onSuccess: () => utils.folders.list.invalidate(),
  });

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: (folder) => {
      setAddingFolder(false);
      setFolderNameDraft("");
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

  const [projectsOpen, setProjectsOpen] = useSidebarSection("projects", true);
  const [addingProject, setAddingProject] = React.useState(false);
  const [addingProjectType, setAddingProjectType] = React.useState<string>("project");
  const [addingFolder, setAddingFolder] = React.useState(false);
  const [folderNameDraft, setFolderNameDraft] = React.useState("");
  const [showAddMenu, setShowAddMenu] = React.useState(false);
  const [showCustomTypeInput, setShowCustomTypeInput] = React.useState(false);

  const folders = foldersQuery.data ?? [];
  const existingTypes = (distinctTypes.data ?? []).map((t) => t.type);

  const projectsByFolder = React.useMemo(() => {
    const map = new Map<
      string,
      { id: string; title: string; color: string | null; task_count: number }[]
    >();
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

  // Group root projects by type dynamically; order groups most-used first then alpha.
  // Within each group, projects are sorted alphabetically by title.
  const rootProjectsByType = React.useMemo(() => {
    const map = new Map<
      string,
      { id: string; title: string; color: string | null; task_count: number }[]
    >();
    for (const p of projects.data ?? []) {
      if (!p.folder_id) {
        const t = (p as typeof p & { type?: string }).type ?? "project";
        const existing = map.get(t) ?? [];
        existing.push({ id: p.id, title: p.title, color: p.color, task_count: p.task_count });
        map.set(t, existing);
      }
    }
    for (const [t, list] of map) {
      map.set(
        t,
        list.slice().sort((a, b) => a.title.localeCompare(b.title)),
      );
    }
    return map;
  }, [projects.data]);

  // Ordered type keys: most-used first (from distinctTypes), then alpha
  const orderedTypeKeys = React.useMemo(() => {
    const usageOrder = (distinctTypes.data ?? []).map((t) => t.type);
    const rootKeys = Array.from(rootProjectsByType.keys());
    const inUsage = usageOrder.filter((t) => rootKeys.includes(t));
    const notInUsage = rootKeys.filter((t) => !usageOrder.includes(t)).sort();
    return [...inUsage, ...notInUsage];
  }, [distinctTypes.data, rootProjectsByType]);

  function handleAddFolder() {
    setFolderNameDraft("");
    setAddingFolder(true);
  }

  function handleSubmitFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = folderNameDraft.trim();
    if (!name) return;
    createFolder.mutate({ name });
  }

  function handleCancelFolder() {
    setAddingFolder(false);
    setFolderNameDraft("");
  }

  function handleToggleFolder(id: string, collapsed: boolean) {
    toggleCollapsed.mutate({ id, collapsed });
  }

  function handleOpenAddProject(type: string) {
    setAddingProjectType(type);
    setAddingProject(true);
    if (!projectsOpen) setProjectsOpen(true);
  }

  const totalRootProjects = (projects.data ?? []).filter((p) => !p.folder_id).length;

  const coreSet = new Set(["project", "goal"]);

  // Adaptive suggested types using the same logic as the type picker
  const adaptiveSuggested = React.useMemo(
    () => getSuggestedTypes(distinctTypes.data ?? []),
    [distinctTypes.data],
  );
  const suggestedSet = new Set(adaptiveSuggested);

  // User-defined types that are neither core nor in the suggested list
  const userOnlyTypes = existingTypes.filter((t) => !coreSet.has(t) && !suggestedSet.has(t));

  const projectAddDropdown = (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setShowAddMenu((v) => !v);
          setShowCustomTypeInput(false);
        }}
        className="inline-flex size-4 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        aria-label="Add project"
      >
        <Plus size={11} />
      </button>
      {showAddMenu && !showCustomTypeInput && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-border-default bg-surface-overlay py-1 shadow-lg">
          <div className="px-2 pb-1 pt-0.5">
            <p className="font-ui text-3xs font-semibold uppercase tracking-caps text-text-disabled">
              Core
            </p>
          </div>
          {["project", "goal"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setShowAddMenu(false);
                handleOpenAddProject(t);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: getColor(t) }}
                aria-hidden
              />
              {getIcon(t)} New {displayType(t)}
            </button>
          ))}
          <div className="mx-2 my-1 border-t border-border-subtle" />
          <div className="px-2 pb-1 pt-0.5">
            <p className="font-ui text-3xs font-semibold uppercase tracking-caps text-text-disabled">
              Suggested
            </p>
          </div>
          {adaptiveSuggested.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setShowAddMenu(false);
                handleOpenAddProject(t);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: getColor(t) }}
                aria-hidden
              />
              {getIcon(t)} New {displayType(t)}
            </button>
          ))}
          {userOnlyTypes.length > 0 && (
            <>
              <div className="mx-2 my-1 border-t border-border-subtle" />
              <div className="px-2 pb-1 pt-0.5">
                <p className="font-ui text-3xs font-semibold uppercase tracking-caps text-text-disabled">
                  Your types
                </p>
              </div>
              {userOnlyTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false);
                    handleOpenAddProject(t);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: getColor(t) }}
                    aria-hidden
                  />
                  {getIcon(t)} New {displayType(t)}
                </button>
              ))}
            </>
          )}
          <div className="mx-2 my-1 border-t border-border-subtle" />
          <button
            type="button"
            onClick={() => {
              setShowCustomTypeInput(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            ✏️ Custom type…
          </button>
        </div>
      )}
      {showCustomTypeInput && (
        <CustomTypeDialog
          existingTypes={existingTypes}
          onConfirm={(type) => {
            setShowCustomTypeInput(false);
            setShowAddMenu(false);
            handleOpenAddProject(type);
          }}
          onCancel={() => {
            setShowCustomTypeInput(false);
            setShowAddMenu(false);
          }}
        />
      )}
    </div>
  );

  return (
    <nav
      aria-label="Task perspectives"
      className="flex h-full flex-col gap-px overflow-y-auto p-2"
      onDragEnd={() => {
        setDragItem(null);
        setIsRootDragOver(false);
      }}
    >
      {(showAddMenu || showCustomTypeInput) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowAddMenu(false);
            setShowCustomTypeInput(false);
          }}
        />
      )}
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
        href="/tasks/tomorrow"
        active={pathname === "/tasks/tomorrow"}
        icon={<Sunrise size={14} />}
        label="Tomorrow"
        badge={counts.data?.tomorrow}
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
      <NavRow
        href="/tasks/someday"
        active={pathname === "/tasks/someday"}
        icon={<Archive size={14} />}
        label="Someday / Maybe"
        badge={counts.data?.someday}
      />
      <NavRow
        href="/tasks/waiting-for"
        active={pathname === "/tasks/waiting-for"}
        icon={<Clock size={14} />}
        label="Waiting For"
        badge={counts.data?.waitingFor}
      />

      <HierarchyAuditBanner />

      <SectionHeader
        label="Projects"
        expanded={projectsOpen}
        onToggle={() => setProjectsOpen(!projectsOpen)}
        count={totalRootProjects}
        addElement={projectAddDropdown}
      />
      {projectsOpen ? (
        <div className="flex flex-col gap-px">
          <NavRow
            href="/tasks/projects"
            active={pathname === "/tasks/projects"}
            icon={<Folder size={14} />}
            label="All projects"
          />
          {addingFolder ? (
            <form onSubmit={handleSubmitFolder} className="flex items-center gap-1 px-2 py-0.5">
              <input
                autoFocus
                value={folderNameDraft}
                onChange={(e) => setFolderNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") handleCancelFolder();
                }}
                placeholder="Folder name"
                className="min-w-0 flex-1 rounded-sm border border-border-focus bg-surface-base px-1.5 py-0.5 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <button
                type="submit"
                disabled={!folderNameDraft.trim() || createFolder.isPending}
                className="rounded-sm bg-accent-primary px-1.5 py-0.5 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleCancelFolder}
                className="rounded-sm border border-border-default px-1.5 py-0.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={handleAddFolder}
              className="flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-ui text-2xs text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
            >
              <Plus size={10} />
              Add folder
            </button>
          )}
          {addingProject ? (
            <div className="px-2 py-1">
              <ProjectAddForm
                defaultType={addingProjectType}
                onDone={() => setAddingProject(false)}
              />
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
              onDragOver={(e) => {
                e.preventDefault();
                setIsRootDragOver(true);
              }}
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

          {orderedTypeKeys.map((type) => (
            <ProjectSubGroup
              key={type}
              groupType={type}
              projects={rootProjectsByType.get(type) ?? []}
              pathname={pathname}
              dragItem={dragItem}
              onDragStart={handleDragStart}
            />
          ))}

          {totalRootProjects === 0 && !addingProject ? (
            <p className="px-2 py-1 font-ui text-2xs text-text-tertiary">No projects yet</p>
          ) : null}
        </div>
      ) : null}

      <ContextsSection pathname={pathname} />

      <TagsSection pathname={pathname} />

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
