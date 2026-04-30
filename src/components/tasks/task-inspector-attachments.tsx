"use client";

import * as React from "react";
import { Paperclip, Download, X, Eye, Tag, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { AttachmentLightbox } from "@/components/attachments/attachment-lightbox";
import { cn } from "@/lib/utils";
import { validateFile } from "@/core/attachments/validators";
import { formatBytes } from "@/core/attachments/validators";

function getTypeIcon(contentType: string) {
  if (contentType.startsWith("image/")) return null;
  if (contentType === "application/pdf") return "PDF";
  if (contentType.startsWith("video/")) return "VID";
  if (contentType.startsWith("audio/")) return "AUD";
  if (contentType.includes("word") || contentType.includes("document")) return "DOC";
  if (contentType.includes("sheet") || contentType.includes("excel")) return "XLS";
  if (contentType.includes("presentation") || contentType.includes("powerpoint")) return "PPT";
  return "FILE";
}

function AttachmentThumbnailImg({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-surface-base">
        <Paperclip size={16} className="text-text-tertiary" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-16 w-16 shrink-0 rounded-sm object-cover"
    />
  );
}

type Attachment = {
  id: string;
  file_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  thumbnail_path: string | null;
  created_at: Date | string;
};

function AttachmentCard({
  att,
  onDelete,
  onClick,
  inTrash,
  onDetach,
}: {
  att: Attachment;
  onDelete: () => void;
  onClick: () => void;
  inTrash?: boolean;
  onDetach: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const isImage = att.content_type.startsWith("image/");
  const typeLabel = getTypeIcon(att.content_type);
  const src = `/api/attachments/${att.file_id}`;

  return (
    <li
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-sm border border-border-subtle bg-surface-base px-2 py-1.5 text-left hover:bg-surface-hover"
      >
        {isImage ? (
          <AttachmentThumbnailImg src={src} alt={att.filename} />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-surface-raised font-ui text-xs font-semibold text-text-tertiary">
            {typeLabel}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-ui text-xs text-text-primary" title={att.filename}>
            {att.filename}
          </p>
          <p className="font-ui text-2xs text-text-tertiary">
            {formatBytes(att.size_bytes)}
          </p>
        </div>
      </button>

      {hovered && !inTrash && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-sm border border-border-default bg-surface-overlay p-0.5 shadow-sm">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="View"
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <Eye size={11} />
          </a>
          <a
            href={src}
            download={att.filename}
            onClick={(e) => e.stopPropagation()}
            title="Download"
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <Download size={11} />
          </a>
          <button
            type="button"
            title="Detach"
            onClick={(e) => { e.stopPropagation(); onDetach(); }}
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
          >
            <Tag size={11} />
          </button>
          <button
            type="button"
            title="Remove"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-accent-danger"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </li>
  );
}

interface TaskInspectorAttachmentsProps {
  taskId: string;
  inTrash?: boolean;
  scrollRef?: React.RefObject<HTMLElement | null>;
}

export function TaskInspectorAttachments({ taskId, inTrash, scrollRef }: TaskInspectorAttachmentsProps) {
  const utils = trpc.useUtils();
  const attachmentsQuery = trpc.attachments.byTaskId.useQuery(
    { task_id: taskId },
    { staleTime: 30_000, enabled: Boolean(taskId) },
  );

  const deleteAttachment = trpc.attachments.delete.useMutation({
    onSuccess: () => utils.attachments.byTaskId.invalidate({ task_id: taskId }),
    onError: () => toast.error("Failed to remove attachment"),
  });

  const detachAttachment = trpc.attachments.detach.useMutation({
    onSuccess: () => {
      utils.attachments.byTaskId.invalidate({ task_id: taskId });
      toast.success("Attachment detached — find it in Media inbox");
    },
    onError: () => toast.error("Failed to detach attachment"),
  });

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const list = attachmentsQuery.data ?? [];
  const imageItems = list.filter((a) => a.content_type.startsWith("image/"));

  async function uploadFile(file: File) {
    const validation = validateFile(file.name, file.type, file.size);
    if (validation.ok === false) {
      toast.error(validation.error);
      return;
    }
    if (validation.ok === "soft_warn") {
      const ok = confirm((validation as { ok: "soft_warn"; message: string }).message);
      if (!ok) return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("task_id", taskId);
    form.append("parent_type", "Task");
    form.append("parent_id", taskId);

    try {
      const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        toast.error((err as { error?: string }).error ?? "Upload failed");
      } else {
        await utils.attachments.byTaskId.invalidate({ task_id: taskId });
        toast.success("File attached");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    for (const file of arr) {
      await uploadFile(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (inTrash) return;
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  function openLightbox(att: Attachment) {
    const idx = imageItems.findIndex((a) => a.id === att.id);
    if (idx >= 0) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    } else {
      window.open(`/api/attachments/${att.file_id}`, "_blank");
    }
  }

  return (
    <section
      id="task-attachments"
      className="mt-4"
      onDragOver={(e) => { e.preventDefault(); if (!inTrash) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary">
          <Paperclip size={10} />
          Attachments {list.length > 0 && <span className="ml-0.5 text-text-disabled">({list.length})</span>}
        </h3>
        {!inTrash && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
          >
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
            Attach file
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => { if (e.target.files) { void handleFiles(e.target.files); e.target.value = ""; } }}
        />
      </div>

      <div
        className={cn(
          "min-h-6 rounded-sm transition-colors",
          isDragging && "ring-2 ring-accent-primary ring-offset-1 bg-accent-primary-subtle",
        )}
      >
        {list.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {list.map((att) => (
              <AttachmentCard
                key={att.id}
                att={att}
                inTrash={inTrash}
                onClick={() => {
                  const isImage = att.content_type.startsWith("image/");
                  const isPdf = att.content_type === "application/pdf";
                  if (isImage) {
                    openLightbox(att);
                  } else if (isPdf) {
                    window.open(`/api/attachments/${att.file_id}`, "_blank");
                  } else {
                    const a = document.createElement("a");
                    a.href = `/api/attachments/${att.file_id}`;
                    a.download = att.filename;
                    a.click();
                  }
                }}
                onDelete={() => {
                  if (confirm(`Remove "${att.filename}"?`)) {
                    deleteAttachment.mutate({ id: att.id });
                  }
                }}
                onDetach={() => {
                  if (confirm(`Detach "${att.filename}" from this task? It will move to the Media inbox.`)) {
                    detachAttachment.mutate({ id: att.id });
                  }
                }}
              />
            ))}
          </ul>
        ) : (
          !inTrash && (
            <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-border-subtle px-4 py-3 text-center">
              <Paperclip size={16} className="mb-1 text-text-disabled" />
              <p className="font-ui text-2xs text-text-tertiary">
                {isDragging ? "Drop file to attach" : "Drop files here or click Attach file"}
              </p>
            </div>
          )
        )}
      </div>

      {lightboxOpen && imageItems.length > 0 && (
        <AttachmentLightbox
          items={imageItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </section>
  );
}
