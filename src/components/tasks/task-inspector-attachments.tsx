"use client";

import * as React from "react";
import { Paperclip, Download, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-surface-base">
        <Paperclip size={16} className="text-text-tertiary" />
      </span>
    );
  }
  // Attachments are served from a dynamic, app-internal blob endpoint
  // (`/api/attachments/<file_id>`) and may be any user-uploaded image format.
  // next/image's optimizer would require a remote pattern + per-asset
  // width/height we don't know at render time, and provides no real benefit
  // for 48px thumbnails of authenticated content. Plain <img> is intentional.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-sm object-cover"
    />
  );
}

interface TaskInspectorAttachmentsProps {
  taskId: string;
  inTrash?: boolean;
}

export function TaskInspectorAttachments({ taskId, inTrash }: TaskInspectorAttachmentsProps) {
  const utils = trpc.useUtils();
  const attachments = trpc.attachments.byTaskId.useQuery(
    { task_id: taskId },
    { staleTime: 30_000, enabled: Boolean(taskId) },
  );
  const deleteAttachment = trpc.attachments.delete.useMutation({
    onSuccess: () => utils.attachments.byTaskId.invalidate({ task_id: taskId }),
    onError: () => toast.error("Failed to remove attachment"),
  });
  const list = attachments.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="mt-4">
      <h3 className="mb-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary flex items-center gap-1">
        <Paperclip size={10} />
        Attachments
      </h3>
      <ul className="flex flex-col gap-1">
        {list.map((att) => {
          const isImage = att.content_type?.startsWith("image/");
          const src = `/api/attachments/${att.file_id}`;
          return (
            <li
              key={att.id}
              className="flex items-center justify-between gap-2 rounded-sm border border-border-subtle bg-surface-base px-2 py-1.5"
            >
              {isImage ? (
                <a
                  href={src}
                  download={att.filename}
                  className="shrink-0"
                  aria-label={`Download ${att.filename}`}
                >
                  <AttachmentThumbnail src={src} alt={att.filename} />
                </a>
              ) : (
                <Paperclip size={20} className="shrink-0 text-text-tertiary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-ui text-xs text-text-primary" title={att.filename}>
                  {att.filename}
                </p>
                <p className="font-ui text-2xs text-text-tertiary">
                  {formatBytes(att.size_bytes)}
                </p>
              </div>
              <a
                href={src}
                download={att.filename}
                className="shrink-0 rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                aria-label={`Download ${att.filename}`}
              >
                <Download size={13} />
              </a>
              {!inTrash && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove "${att.filename}"?`)) {
                      deleteAttachment.mutate({ id: att.id });
                    }
                  }}
                  disabled={deleteAttachment.isPending}
                  className="shrink-0 rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-accent-danger"
                  aria-label={`Remove ${att.filename}`}
                >
                  <X size={13} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
