"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, FolderOpen, Plus, Pencil, Trash2, Check, X, StickyNote } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

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

function colorDotClass(color?: string | null): string {
  if (!color) return "bg-text-disabled";
  return PROJECT_COLOR_DOTS[color] ?? "bg-text-disabled";
}

interface FolderDetailViewProps {
  folderId: string;
}

export function FolderDetailView({ folderId }: FolderDetailViewProps): React.ReactElement {
  const router = useRouter();
  const utils = trpc.useUtils();

  const query = trpc.folders.byId.useQuery({ id: folderId });

  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [notesDraft, setNotesDraft] = React.useState("");
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [addingSubfolder, setAddingSubfolder] = React.useState(false);
  const [subfolderNameDraft, setSubfolderNameDraft] = React.useState("");

  // Depend on the narrowed scalar fields directly so refresh of the underlying
  // query reliably resyncs the drafts without re-running on unrelated identity
  // changes to `query.data`.
  const queryName = query.data?.name;
  const queryNotes = query.data?.notes;
  React.useEffect(() => {
    if (queryName === undefined && queryNotes === undefined) return;
    setNameDraft(queryName ?? "");
    setNotesDraft(queryNotes ?? "");
  }, [queryName, queryNotes]);

  const updateFolder = trpc.folders.update.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      utils.folders.byId.invalidate({ id: folderId });
      setEditingName(false);
      toast.success("Folder updated");
    },
    onError: () => toast.error("Failed to update folder"),
  });

  const deleteFolder = trpc.folders.delete.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      utils.projects.list.invalidate();
      toast.success("Folder deleted. Projects moved to root.");
      router.push("/tasks/projects");
    },
    onError: () => toast.error("Failed to delete folder"),
  });

  const createSubfolder = trpc.folders.create.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      utils.folders.byId.invalidate({ id: folderId });
      setAddingSubfolder(false);
      setSubfolderNameDraft("");
      toast.success("Subfolder created");
    },
    onError: () => toast.error("Failed to create subfolder"),
  });

  function handleSaveName() {
    const name = nameDraft.trim();
    if (!name) return;
    updateFolder.mutate({ id: folderId, name });
  }

  function handleSaveNotes() {
    setEditingNotes(false);
    const notes = notesDraft.trim() || null;
    if (notes !== (query.data?.notes ?? null)) {
      updateFolder.mutate({ id: folderId, notes: notes ?? undefined });
    }
  }

  function handleDelete() {
    const folder = query.data;
    if (!folder) return;
    const msg = [
      `Delete folder "${folder.name}"?`,
      folder.children?.length
        ? `${folder.children.length} sub-folder(s) will be moved to root.`
        : "",
      folder.projects?.length
        ? `${folder.projects.length} project(s) will be moved to root.`
        : "",
      "This cannot be undone.",
    ]
      .filter(Boolean)
      .join("\n");

    if (!confirm(msg)) return;
    deleteFolder.mutate({ id: folderId });
  }

  function handleAddSubfolder() {
    setSubfolderNameDraft("");
    setAddingSubfolder(true);
  }

  function handleSubmitSubfolder(e: React.FormEvent) {
    e.preventDefault();
    const name = subfolderNameDraft.trim();
    if (!name) return;
    createSubfolder.mutate({ name, parent_id: folderId });
  }

  function handleCancelSubfolder() {
    setAddingSubfolder(false);
    setSubfolderNameDraft("");
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-ui text-sm text-text-tertiary">Loading folder…</p>
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-ui text-sm text-accent-danger">Folder not found</p>
      </div>
    );
  }

  const folder = query.data;

  const subfolderForm = (
    <form onSubmit={handleSubmitSubfolder} className="flex items-center gap-1.5 rounded-sm border border-border-focus px-3 py-1.5">
      <Folder size={12} className="shrink-0 text-text-tertiary" />
      <input
        autoFocus
        value={subfolderNameDraft}
        onChange={(e) => setSubfolderNameDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") handleCancelSubfolder(); }}
        placeholder="Subfolder name"
        className="min-w-0 flex-1 bg-transparent font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
      <button
        type="submit"
        disabled={!subfolderNameDraft.trim() || createSubfolder.isPending}
        className="rounded-sm bg-accent-primary px-2 py-0.5 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={handleCancelSubfolder}
        className="rounded-sm border border-border-default px-2 py-0.5 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
      >
        Cancel
      </button>
    </form>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FolderOpen size={14} className="shrink-0 text-text-tertiary" />
          {editingName ? (
            <div className="flex flex-1 items-center gap-1">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="flex-1 rounded-sm border border-border-focus bg-surface-base px-2 py-0.5 font-ui text-base font-semibold text-text-primary outline-none"
              />
              <button type="button" onClick={handleSaveName} className="p-0.5 text-accent-success">
                <Check size={14} />
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="p-0.5 text-text-tertiary">
                <X size={14} />
              </button>
            </div>
          ) : (
            <h1
              className="flex-1 truncate cursor-pointer font-ui text-base font-semibold text-text-primary hover:text-accent-primary"
              onDoubleClick={() => setEditingName(true)}
              title="Double-click to rename"
            >
              {folder.name}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditingName(true)}
            aria-label="Rename folder"
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Delete folder"
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-accent-danger"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Notes section */}
        <section className="mb-6">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1 font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
              <StickyNote size={10} />
              Notes
            </h2>
            {!editingNotes && (
              <button
                type="button"
                onClick={() => setEditingNotes(true)}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-disabled hover:bg-surface-hover hover:text-text-tertiary"
              >
                <Pencil size={9} />
                Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={4}
                placeholder="Add notes about this folder…"
                className="w-full resize-none rounded-md border border-border-focus bg-surface-overlay p-2 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="rounded-sm bg-accent-primary px-2.5 py-1 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingNotes(false); setNotesDraft(folder.notes ?? ""); }}
                  className="rounded-sm border border-border-default px-2.5 py-1 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : folder.notes ? (
            <p className="whitespace-pre-wrap rounded-md bg-surface-raised p-3 font-ui text-sm text-text-secondary">
              {folder.notes}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="block w-full rounded-md border border-dashed border-border-subtle py-3 text-center font-ui text-xs text-text-disabled hover:border-border-default hover:text-text-tertiary"
            >
              Add notes about this folder…
            </button>
          )}
        </section>

        {folder.children && folder.children.length > 0 && (
          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
                Sub-folders ({folder.children.length})
              </h2>
              {!addingSubfolder && (
                <button
                  type="button"
                  onClick={handleAddSubfolder}
                  className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Plus size={10} />
                  Add
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {folder.children.map((child) => {
                const childTaskCount = (child as typeof child & { task_count?: number }).task_count ?? 0;
                return (
                  <Link
                    key={child.id}
                    href={`/tasks/folders/${child.id}`}
                    className="flex items-center gap-2 rounded-sm border border-border-subtle px-3 py-2 hover:bg-surface-hover"
                  >
                    <Folder size={12} className="shrink-0 text-text-tertiary" />
                    <span className="flex-1 truncate font-ui text-sm text-text-primary">{child.name}</span>
                    {childTaskCount > 0 && (
                      <span className="font-mono text-2xs text-text-tertiary tabular-nums">{childTaskCount} tasks</span>
                    )}
                  </Link>
                );
              })}
              {addingSubfolder && subfolderForm}
            </div>
          </section>
        )}

        {folder.children && folder.children.length === 0 && (
          <div className="mb-4">
            {addingSubfolder ? subfolderForm : (
              <button
                type="button"
                onClick={handleAddSubfolder}
                className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border-default px-3 py-1.5 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
              >
                <Plus size={12} />
                Add sub-folder
              </button>
            )}
          </div>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
              Projects ({folder.projects?.length ?? 0})
            </h2>
          </div>
          {folder.projects && folder.projects.length > 0 ? (
            <div className="flex flex-col gap-1">
              {folder.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/tasks/projects/${project.id}`}
                  className="flex items-center gap-2 rounded-sm border border-border-subtle px-3 py-2 hover:bg-surface-hover"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", colorDotClass(project.color))} />
                  <span className="flex-1 truncate font-ui text-sm text-text-primary">{project.title}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 font-ui text-2xs capitalize",
                      project.status === "active" && "bg-accent-success-muted text-accent-success",
                      project.status === "on_hold" && "bg-accent-warning-muted text-accent-warning",
                      project.status === "completed" && "bg-surface-raised text-text-tertiary",
                      project.status === "dropped" && "bg-surface-raised text-text-disabled",
                    )}
                  >
                    {project.status.replace("_", " ")}
                  </span>
                  {"task_count" in project && (project as { task_count: number }).task_count > 0 && (
                    <span className="font-mono text-2xs text-text-tertiary tabular-nums">
                      {(project as { task_count: number }).task_count}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border-subtle py-6 text-center">
              <p className="font-ui text-sm text-text-tertiary">No projects in this folder</p>
              <p className="font-ui text-2xs text-text-disabled">
                Drag projects here from the sidebar, or move them from a project&apos;s settings.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
