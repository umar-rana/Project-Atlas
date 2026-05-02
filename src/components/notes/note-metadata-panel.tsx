"use client";

import * as React from "react";
import { Star, Link2, Paperclip, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BacklinksPanel } from "./backlinks-panel";

type Purpose = "note" | "meeting_note" | "project_brief" | "reading_note";

const PURPOSE_OPTIONS: { value: Purpose; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "meeting_note", label: "Meeting Note" },
  { value: "project_brief", label: "Project Brief" },
  { value: "reading_note", label: "Reading Note" },
];

interface NoteMetadataPanelProps {
  noteId: string;
  purpose: Purpose;
  is_project_brief: boolean;
  folder_id: string | null;
  project_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function CollapsibleSection({
  label,
  icon,
  defaultOpen = true,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5"
      >
        {icon}
        <span className="flex-1 text-left font-ui text-2xs font-medium text-text-tertiary">{label}</span>
        {open ? <ChevronDown size={10} className="text-text-disabled" /> : <ChevronRight size={10} className="text-text-disabled" />}
      </button>
      {open ? <div>{children}</div> : null}
    </section>
  );
}

export function NoteMetadataPanel({
  noteId,
  purpose,
  is_project_brief,
  folder_id,
  project_id,
  created_at,
  updated_at,
}: NoteMetadataPanelProps): React.ReactElement {
  const utils = trpc.useUtils();

  const foldersQuery = trpc.notesFolder.list.useQuery();
  const projectsQuery = trpc.projects.list.useQuery({ status: "active" });
  const backlinksQuery = trpc.links.inbound.useQuery({ target_type: "Note", target_id: noteId });
  const attachmentsQuery = trpc.attachments.byParentId.useQuery(
    { parent_type: "Note", parent_id: noteId },
    { refetchOnWindowFocus: false },
  );

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: () => utils.notes.get.invalidate({ id: noteId }),
    onError: () => toast.error("Failed to update note"),
  });

  const designateBrief = trpc.notes.designateBrief.useMutation({
    onSuccess: () => utils.notes.get.invalidate({ id: noteId }),
    onError: (err) => toast.error(err.message || "Failed to set as brief"),
  });

  const undesignateBrief = trpc.notes.undesignateBrief.useMutation({
    onSuccess: () => utils.notes.get.invalidate({ id: noteId }),
    onError: () => toast.error("Failed to unset brief"),
  });

  const deleteAttachment = trpc.attachments.delete.useMutation({
    onSuccess: () => attachmentsQuery.refetch(),
    onError: () => toast.error("Failed to delete attachment"),
  });

  function handlePurposeChange(newPurpose: Purpose) {
    updateNote.mutate({ id: noteId, purpose: newPurpose });
  }

  function handleFolderChange(newFolderId: string | null) {
    updateNote.mutate({ id: noteId, folder_id: newFolderId });
  }

  function handleProjectChange(newProjectId: string | null) {
    updateNote.mutate({ id: noteId, project_id: newProjectId });
  }

  function handleBriefToggle() {
    if (is_project_brief) {
      undesignateBrief.mutate({ id: noteId });
    } else {
      if (!project_id) {
        toast.error("Attach this note to a project first");
        return;
      }
      designateBrief.mutate({ id: noteId });
    }
  }

  async function handleAttachmentDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("parent_type", "Note");
      formData.append("parent_id", noteId);
      try {
        await fetch("/api/attachments/upload", { method: "POST", body: formData });
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    attachmentsQuery.refetch();
  }

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  function flattenFolders(
    nodes: { id: string; name: string; parent_id: string | null; children: typeof nodes }[],
    depth = 0,
  ): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = [];
    for (const n of nodes) {
      out.push({ id: n.id, label: `${"  ".repeat(depth)}${n.name}` });
      out.push(...flattenFolders(n.children, depth + 1));
    }
    return out;
  }

  const flatFolders = flattenFolders(foldersQuery.data ?? []);
  const projects = projectsQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const backlinks = backlinksQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">Metadata</h2>

      <CollapsibleSection label="Purpose">
        <select
          value={purpose}
          onChange={(e) => handlePurposeChange(e.target.value as Purpose)}
          className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:border-border-focus focus:outline-none"
        >
          {PURPOSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </CollapsibleSection>

      <CollapsibleSection label="Project">
        <select
          value={project_id ?? ""}
          onChange={(e) => handleProjectChange(e.target.value || null)}
          className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:border-border-focus focus:outline-none"
        >
          <option value="">— No project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>

        {project_id && (
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Star
                size={13}
                className={cn(is_project_brief ? "fill-amber-400 text-amber-400" : "text-text-disabled")}
              />
              <span className="font-ui text-xs text-text-secondary">Mark as brief</span>
            </div>
            <button
              type="button"
              onClick={handleBriefToggle}
              disabled={designateBrief.isPending || undesignateBrief.isPending}
              className={cn(
                "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
                is_project_brief
                  ? "border-amber-400 bg-amber-400"
                  : "border-border-default bg-surface-raised",
              )}
            >
              <span
                className={cn(
                  "block size-3 rounded-full bg-white shadow transition-transform",
                  is_project_brief ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection label="Folder">
        <select
          value={folder_id ?? ""}
          onChange={(e) => handleFolderChange(e.target.value || null)}
          className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:border-border-focus focus:outline-none"
        >
          <option value="">— No folder —</option>
          {flatFolders.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </CollapsibleSection>

      <CollapsibleSection label="Dates">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-ui text-2xs text-text-disabled">Created</span>
            <span className="font-ui text-xs text-text-secondary">{formatDate(created_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-ui text-2xs text-text-disabled">Updated</span>
            <span className="font-ui text-xs text-text-secondary">{formatDate(updated_at)}</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection label="Tags" defaultOpen={false}>
        <div className="flex flex-wrap gap-1">
          <p className="font-ui text-2xs text-text-disabled">
            Note tagging is planned for a future update.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        label={`Backlinks${backlinks.length > 0 ? ` (${backlinks.length})` : ""}`}
        icon={<Link2 size={11} className="text-text-tertiary" />}
        defaultOpen={backlinks.length > 0}
      >
        <BacklinksPanel backlinks={backlinks} />
      </CollapsibleSection>

      <CollapsibleSection
        label={`Attachments${attachments.length > 0 ? ` (${attachments.length})` : ""}`}
        icon={<Paperclip size={11} className="text-text-tertiary" />}
        defaultOpen={false}
      >
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleAttachmentDrop}
          className="flex min-h-12 flex-col gap-1 rounded-md border border-dashed border-border-default p-2 transition-colors hover:border-accent-primary hover:bg-accent-primary-subtle/20"
        >
          {attachments.length === 0 ? (
            <p className="flex-1 text-center font-ui text-2xs text-text-disabled">
              Drop files here to attach
            </p>
          ) : (
            attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5">
                <span className="flex-1 truncate font-ui text-xs text-text-secondary">{att.filename}</span>
                <button
                  type="button"
                  onClick={() => deleteAttachment.mutate({ id: att.id })}
                  className="shrink-0 font-ui text-2xs text-text-disabled hover:text-destructive"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
