"use client";

import * as React from "react";
import {
  Star,
  Link2,
  Paperclip,
  ChevronDown,
  ChevronRight,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  Download,
  FileDown,
  Loader2,
  Tag,
  Plus,
} from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BacklinksPanel } from "./backlinks-panel";
import { ExportPdfDialog } from "./export-pdf-dialog";

type Purpose = "note" | "meeting_note" | "project_brief" | "reading_note";

const PURPOSE_OPTIONS: { value: Purpose; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "meeting_note", label: "Meeting Note" },
  { value: "project_brief", label: "Project Brief" },
  { value: "reading_note", label: "Reading Note" },
];

interface NoteMetadataPanelProps {
  noteId: string;
  noteTitle?: string;
  purpose: Purpose;
  is_project_brief: boolean;
  folder_id: string | null;
  project_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function fileTypeIcon(filename: string, mimeType?: string | null): React.ReactElement {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType ?? "";
  if (mime === "application/pdf" || ext === "pdf") {
    return <FileText size={13} className="shrink-0 text-red-400" />;
  }
  if (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)
  ) {
    return <Image size={13} className="shrink-0 text-blue-400" />;
  }
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return <Film size={13} className="shrink-0 text-purple-400" />;
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "flac", "aac"].includes(ext)) {
    return <Music size={13} className="shrink-0 text-green-400" />;
  }
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) {
    return <Archive size={13} className="shrink-0 text-amber-400" />;
  }
  if (["doc", "docx", "txt", "md", "csv", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
    return <FileText size={13} className="shrink-0 text-text-secondary" />;
  }
  return <File size={13} className="shrink-0 text-text-disabled" />;
}

function isImageMime(mime?: string | null, filename?: string): boolean {
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  return (
    (!!mime && mime.startsWith("image/")) ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)
  );
}

function AttachmentThumbnail({
  fileId,
  filename,
  mimeType,
}: {
  fileId: string;
  filename: string;
  mimeType?: string | null;
}) {
  const [imgError, setImgError] = React.useState(false);

  if (isImageMime(mimeType, filename) && !imgError) {
    return (
      <img
        src={`/api/attachments/${fileId}`}
        alt={filename}
        onError={() => setImgError(true)}
        className="h-8 w-8 shrink-0 rounded border border-border-default object-cover"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
      {fileTypeIcon(filename, mimeType)}
    </div>
  );
}

function NoteTagsSection({ noteId }: { noteId: string }) {
  const utils = trpc.useUtils();
  const noteQuery = trpc.notes.get.useQuery({ id: noteId });
  const tagsQuery = trpc.tags.list.useQuery();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [removingTagId, setRemovingTagId] = React.useState<string | null>(null);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  const addTag = trpc.notes.addTag.useMutation({
    onSuccess: () => {
      void utils.notes.get.invalidate({ id: noteId });
      void utils.notes.list.invalidate();
      setPickerOpen(false);
    },
    onError: () => toast.error("Failed to add tag"),
  });

  const removeTag = trpc.notes.removeTag.useMutation({
    onSuccess: () => {
      void utils.notes.get.invalidate({ id: noteId });
      void utils.notes.list.invalidate();
      setRemovingTagId(null);
    },
    onError: () => toast.error("Failed to remove tag"),
  });

  React.useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const note = noteQuery.data;
  const currentTags =
    (
      note as
        | { tag_on_notes?: { tag: { id: string; name: string; color: string | null } }[] }
        | null
        | undefined
    )?.tag_on_notes ?? [];
  const currentTagIds = new Set(currentTags.map((t) => t.tag.id));
  const allTags = tagsQuery.data ?? [];
  const availableTags = allTags.filter((t) => !currentTagIds.has(t.id));

  return (
    <CollapsibleSection
      label="Tags"
      icon={<Tag size={11} className="text-text-tertiary" />}
      defaultOpen
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1">
          {currentTags.map(({ tag }) => (
            <Hint key={tag.id} label={`Remove "${tag.name}"`} side="top" delayDuration={600}>
              <button
                type="button"
                onClick={() => {
                  if (removingTagId === tag.id) {
                    removeTag.mutate({ note_id: noteId, tag_id: tag.id });
                  } else {
                    setRemovingTagId(tag.id);
                    setTimeout(() => setRemovingTagId(null), 3000);
                  }
                }}
                disabled={removeTag.isPending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-2xs font-medium transition-colors",
                  removingTagId === tag.id
                    ? "bg-accent-danger-muted text-accent-danger"
                    : "bg-accent-primary-muted text-accent-primary hover:bg-accent-danger-muted hover:text-accent-danger",
                )}
              >
                <span>#</span>
                <span>{tag.name}</span>
                {removingTagId === tag.id && <span className="ml-0.5">×</span>}
              </button>
            </Hint>
          ))}
          <div className="relative" ref={pickerRef}>
            <Hint label="Add tag" side="top">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-default px-2 py-0.5 font-ui text-2xs text-text-disabled hover:border-border-focus hover:text-accent-primary"
              >
                <Plus size={10} />
                Tag
              </button>
            </Hint>
            {pickerOpen && (
              <div className="absolute left-0 top-full z-overlay mt-1 w-48 rounded-md border border-border-default bg-surface-raised shadow-2">
                <div className="max-h-40 overflow-y-auto py-1">
                  {availableTags.length === 0 ? (
                    <p className="px-3 py-2 font-ui text-2xs text-text-disabled">
                      {allTags.length === 0 ? "No tags yet" : "All tags added"}
                    </p>
                  ) : (
                    availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => addTag.mutate({ note_id: noteId, tag_id: tag.id })}
                        disabled={addTag.isPending}
                        className="flex w-full items-center gap-2 px-3 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <span className="text-text-tertiary">#</span>
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

function CollapsibleSection({
  label,
  labelHint,
  icon,
  defaultOpen = true,
  children,
}: {
  label: string;
  labelHint?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="flex flex-col gap-1">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5">
        {icon}
        {labelHint ? (
          <Hint label={labelHint} side="right" delayDuration={800}>
            <span className="flex-1 text-left font-ui text-2xs font-medium text-text-tertiary">
              {label}
            </span>
          </Hint>
        ) : (
          <span className="flex-1 text-left font-ui text-2xs font-medium text-text-tertiary">
            {label}
          </span>
        )}
        {open ? (
          <ChevronDown size={10} className="text-text-disabled" />
        ) : (
          <ChevronRight size={10} className="text-text-disabled" />
        )}
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
  noteTitle,
}: NoteMetadataPanelProps & { noteTitle?: string }): React.ReactElement {
  const utils = trpc.useUtils();
  const [showPdfDialog, setShowPdfDialog] = React.useState(false);

  const exportMarkdown = trpc.convert.exportMarkdown.useMutation({
    onSuccess(data) {
      const blob = new Blob([data.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError(err) {
      toast.error(err.message ?? "Markdown export failed");
    },
  });

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
    onError: () => toast.error("Failed to set as project brief"),
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
      <h2 className="font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
        Metadata
      </h2>

      <CollapsibleSection
        label="Purpose"
        labelHint="Categorizes this note: Reference, Project support, Someday/Maybe, or Archive"
      >
        <select
          value={purpose}
          onChange={(e) => handlePurposeChange(e.target.value as Purpose)}
          className="w-full rounded-md border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary focus:border-border-focus focus:outline-none"
        >
          {PURPOSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
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
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        {project_id && (
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Star
                size={13}
                className={cn(
                  is_project_brief ? "fill-amber-400 text-amber-400" : "text-text-disabled",
                )}
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
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
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

      <NoteTagsSection noteId={noteId} />

      <CollapsibleSection
        label={`Backlinks${backlinks.length > 0 ? ` (${backlinks.length})` : ""}`}
        labelHint="Backlinks show other notes, tasks, or contacts that link to this note"
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
          className="hover:bg-accent-primary-subtle/20 flex min-h-12 flex-col gap-1 rounded-md border border-dashed border-border-default p-2 transition-colors hover:border-accent-primary"
        >
          {attachments.length === 0 ? (
            <p className="flex-1 text-center font-ui text-2xs text-text-disabled">
              Drop files here to attach
            </p>
          ) : (
            attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5">
                <AttachmentThumbnail
                  fileId={att.file_id}
                  filename={att.filename}
                  mimeType={att.content_type}
                />
                <span className="flex-1 truncate font-ui text-xs text-text-secondary">
                  {att.filename}
                </span>
                <button
                  type="button"
                  onClick={() => deleteAttachment.mutate({ id: att.id })}
                  className="shrink-0 font-ui text-2xs text-text-disabled hover:text-accent-danger"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>

      {/* Actions section */}
      <CollapsibleSection
        label="Actions"
        icon={<Download size={11} className="text-text-tertiary" />}
        defaultOpen={false}
      >
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowPdfDialog(true)}
            className="flex w-full items-center gap-2 rounded-md border border-border-default px-3 py-2 font-ui text-xs text-text-secondary hover:border-border-focus hover:bg-surface-raised hover:text-text-primary focus-visible:focus-ring"
          >
            <FileDown size={12} className="shrink-0 text-text-disabled" aria-hidden />
            Export as PDF
          </button>
          <button
            type="button"
            onClick={() => exportMarkdown.mutate({ noteId })}
            disabled={exportMarkdown.isPending}
            className="flex w-full items-center gap-2 rounded-md border border-border-default px-3 py-2 font-ui text-xs text-text-secondary hover:border-border-focus hover:bg-surface-raised hover:text-text-primary focus-visible:focus-ring disabled:opacity-50"
          >
            {exportMarkdown.isPending ? (
              <Loader2 size={12} className="shrink-0 animate-spin text-text-disabled" aria-hidden />
            ) : (
              <Download size={12} className="shrink-0 text-text-disabled" aria-hidden />
            )}
            {exportMarkdown.isPending ? "Exporting…" : "Export as Markdown"}
          </button>
        </div>
      </CollapsibleSection>

      <ExportPdfDialog
        open={showPdfDialog}
        onOpenChange={setShowPdfDialog}
        noteId={noteId}
        noteTitle={noteTitle ?? "Note"}
      />
    </div>
  );
}
