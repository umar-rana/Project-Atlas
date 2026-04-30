"use client";

import * as React from "react";
import { X, Download, Trash2, Link2, Eye, CheckSquare, Square } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { classifyContentType, formatBytes } from "@/core/attachments/validators";
import { AttachmentLightbox } from "./attachment-lightbox";
import { cn } from "@/lib/utils";

interface AttachmentDetailPanelProps {
  attachmentId: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function AttachmentDetailPanel({ attachmentId, onClose, onDeleted }: AttachmentDetailPanelProps) {
  const utils = trpc.useUtils();
  const { data: att, isLoading } = trpc.attachments.byId.useQuery(
    { id: attachmentId },
    { staleTime: 30_000 },
  );

  const updateAtt = trpc.attachments.update.useMutation({
    onSuccess: () => utils.attachments.byId.invalidate({ id: attachmentId }),
    onError: () => toast.error("Failed to update"),
  });

  const deleteAtt = trpc.attachments.delete.useMutation({
    onSuccess: () => {
      toast.success("Attachment deleted");
      onDeleted?.();
      onClose();
    },
    onError: () => toast.error("Failed to delete"),
  });

  const detachAtt = trpc.attachments.detach.useMutation({
    onSuccess: () => {
      utils.attachments.byId.invalidate({ id: attachmentId });
      utils.media.list.invalidate();
      toast.success("Attachment detached");
    },
    onError: () => toast.error("Failed to detach"),
  });

  const [descDraft, setDescDraft] = React.useState("");
  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  React.useEffect(() => {
    if (att) setDescDraft(att.description ?? "");
  }, [att?.id, att?.description]);

  if (isLoading || !att) {
    return (
      <aside className="flex h-full w-80 flex-col border-l border-border-subtle bg-surface-overlay">
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
          <span className="font-ui text-sm font-semibold text-text-primary">Attachment</span>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span className="font-ui text-xs text-text-tertiary">Loading…</span>
        </div>
      </aside>
    );
  }

  const isImage = att.content_type.startsWith("image/");
  const isPdf = att.content_type === "application/pdf";
  const isVideo = att.content_type.startsWith("video/");
  const isAudio = att.content_type.startsWith("audio/");
  const fileType = classifyContentType(att.content_type);
  const src = `/api/attachments/${att.file_id}`;
  const isOrphan = !att.parent_type;
  const date = typeof att.created_at === "string" ? new Date(att.created_at) : att.created_at;

  return (
    <aside className="flex h-full w-80 flex-col border-l border-border-subtle bg-surface-overlay">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span className="font-ui text-sm font-semibold text-text-primary truncate mr-2">{att.filename}</span>
        <button type="button" onClick={onClose} className="shrink-0 text-text-tertiary hover:text-text-primary">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex h-40 items-center justify-center overflow-hidden border-b border-border-subtle bg-surface-raised">
          {isImage && (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="h-full w-full overflow-hidden hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={att.filename} className="h-full w-full object-contain" />
            </button>
          )}
          {isPdf && (
            <button
              type="button"
              onClick={() => window.open(src, "_blank")}
              className="flex flex-col items-center gap-2 text-text-tertiary hover:text-text-primary"
            >
              <Eye size={24} />
              <span className="font-ui text-xs">Open PDF</span>
            </button>
          )}
          {isVideo && (
            <video src={src} controls className="max-h-full max-w-full" />
          )}
          {isAudio && (
            <audio src={src} controls className="w-full px-4" />
          )}
          {!isImage && !isPdf && !isVideo && !isAudio && (
            <div className="flex flex-col items-center gap-2 text-text-tertiary">
              <span className="rounded-sm bg-surface-overlay px-2 py-1 font-ui text-sm font-semibold uppercase">{fileType}</span>
              <span className="font-ui text-xs">No preview available</span>
            </div>
          )}
        </div>

        <div className="p-3 space-y-3">
          <div>
            <label className="block font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary mb-1">
              Type
            </label>
            <p className="font-ui text-xs text-text-secondary">{att.content_type}</p>
          </div>

          <div>
            <label className="block font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary mb-1">
              Size
            </label>
            <p className="font-ui text-xs text-text-secondary">{formatBytes(att.size_bytes)}</p>
          </div>

          {att.image_width && att.image_height && (
            <div>
              <label className="block font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary mb-1">
                Dimensions
              </label>
              <p className="font-ui text-xs text-text-secondary">{att.image_width} × {att.image_height}px</p>
            </div>
          )}

          <div>
            <label className="block font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary mb-1">
              Added
            </label>
            <p className="font-ui text-xs text-text-secondary">{format(date, "MMM d, yyyy 'at' h:mm a")}</p>
          </div>

          <div>
            <label className="block font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary mb-1">
              Source
            </label>
            {isOrphan ? (
              <p className="font-ui text-xs text-text-tertiary italic">
                {att.task_id ? "Previously attached to a deleted task" : "Orphaned"}
              </p>
            ) : att.task_id ? (
              <a
                href={`/tasks?task=${att.task_id}`}
                className="flex items-center gap-1 font-ui text-xs text-accent-info hover:underline"
              >
                <Link2 size={10} />
                View task
              </a>
            ) : (
              <p className="font-ui text-xs text-text-secondary capitalize">{att.parent_type}</p>
            )}
          </div>

          <div>
            <label className="block font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary mb-1">
              Description
            </label>
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => {
                if (descDraft !== (att.description ?? "")) {
                  updateAtt.mutate({ id: att.id, description: descDraft || null });
                }
              }}
              rows={3}
              placeholder="Add a description…"
              className="w-full resize-none rounded-sm border border-border-default bg-surface-base p-2 font-ui text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => updateAtt.mutate({ id: att.id, reviewed: !att.reviewed })}
              disabled={updateAtt.isPending}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-ui text-xs transition-colors",
                att.reviewed
                  ? "border-accent-success/40 bg-accent-success/10 text-accent-success hover:bg-accent-success/20"
                  : "border-border-default text-text-secondary hover:bg-surface-hover",
              )}
            >
              {att.reviewed ? <CheckSquare size={12} /> : <Square size={12} />}
              {att.reviewed ? "Reviewed" : "Mark as reviewed"}
            </button>
          </div>

          {isOrphan && att.task_id == null && (
            <div className="rounded-sm border border-border-subtle bg-surface-raised p-2">
              <p className="font-ui text-2xs text-text-secondary">
                This file is not attached to any task. You can re-attach it from the task inspector.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border-subtle p-3 flex items-center gap-2">
        <a
          href={src}
          download={att.filename}
          className="flex items-center gap-1.5 rounded-sm border border-border-default px-2.5 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover"
        >
          <Download size={12} />
          Download
        </a>
        {att.parent_type && (
          <button
            type="button"
            disabled={detachAtt.isPending}
            onClick={() => {
              if (confirm("Detach this file? It will become an orphan in the Media inbox.")) {
                detachAtt.mutate({ id: att.id });
              }
            }}
            className="flex items-center gap-1.5 rounded-sm border border-border-default px-2.5 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            Detach
          </button>
        )}
        <button
          type="button"
          disabled={deleteAtt.isPending}
          onClick={() => {
            if (confirm(`Delete "${att.filename}" permanently?`)) {
              deleteAtt.mutate({ id: att.id });
            }
          }}
          className="ml-auto flex items-center gap-1.5 rounded-sm border border-accent-danger/30 px-2.5 py-1.5 font-ui text-xs text-accent-danger hover:bg-accent-danger/10 disabled:opacity-50"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>

      {lightboxOpen && isImage && (
        <AttachmentLightbox
          items={[{ id: att.id, filename: att.filename, content_type: att.content_type, file_id: att.file_id }]}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </aside>
  );
}
