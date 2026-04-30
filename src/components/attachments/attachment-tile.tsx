"use client";

import * as React from "react";
import { Paperclip, FileText, Film, Music, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyContentType, formatBytes } from "@/core/attachments/validators";
import { format } from "date-fns";

interface AttachmentTileProps {
  id: string;
  file_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  thumbnail_path: string | null;
  source_label: string;
  is_orphan: boolean;
  reviewed: boolean;
  created_at: Date | string;
  selected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onClick: (id: string) => void;
}

function TypeIcon({ contentType }: { contentType: string }) {
  const type = classifyContentType(contentType);
  const cls = "size-8 text-text-disabled";
  switch (type) {
    case "pdf": return <FileText className={cls} />;
    case "video": return <Film className={cls} />;
    case "audio": return <Music className={cls} />;
    case "doc": return <FileText className={cls} />;
    default: return <File className={cls} />;
  }
}

function ThumbnailImg({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover object-center"
    />
  );
}

export function AttachmentTile({
  id,
  file_id,
  filename,
  content_type,
  size_bytes,
  source_label,
  is_orphan,
  reviewed,
  created_at,
  selected,
  onSelect,
  onClick,
}: AttachmentTileProps) {
  const isImage = content_type.startsWith("image/");
  const src = `/api/attachments/${file_id}`;
  const date = typeof created_at === "string" ? new Date(created_at) : created_at;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onSelect(id, e);
        } else {
          onClick(id);
        }
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(id); }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border transition-colors",
        selected
          ? "border-accent-primary bg-accent-primary-subtle ring-2 ring-accent-primary"
          : "border-border-subtle bg-surface-base hover:border-border-default hover:bg-surface-hover",
        is_orphan && "border-dashed",
      )}
    >
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-surface-raised">
        {isImage ? (
          <ThumbnailImg src={src} alt={filename} />
        ) : (
          <TypeIcon contentType={content_type} />
        )}
        {reviewed && (
          <span className="absolute right-1 top-1 rounded-full bg-accent-success/90 px-1.5 py-0.5 font-ui text-2xs font-medium text-white">
            ✓
          </span>
        )}
        {selected && (
          <div className="absolute inset-0 bg-accent-primary/20" />
        )}
        <div
          className="absolute left-1 top-1"
          onClick={(e) => { e.stopPropagation(); onSelect(id, e); }}
        >
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="h-3.5 w-3.5 cursor-pointer rounded border-border-default opacity-0 transition-opacity group-hover:opacity-100 checked:opacity-100"
          />
        </div>
      </div>
      <div className="p-2">
        <p className="truncate font-ui text-xs font-medium text-text-primary" title={filename}>
          {filename}
        </p>
        <p className="mt-0.5 truncate font-ui text-2xs text-text-tertiary" title={source_label}>
          {source_label}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-ui text-2xs text-text-disabled">{formatBytes(size_bytes)}</span>
          <span className="font-ui text-2xs text-text-disabled">{format(date, "MMM d")}</span>
        </div>
      </div>
    </div>
  );
}

export function AttachmentTileEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Paperclip size={32} className="mb-3 text-text-disabled" />
      <p className="font-ui text-sm font-medium text-text-secondary">No attachments yet</p>
      <p className="mt-1 font-ui text-xs text-text-tertiary">
        Attach files to tasks to see them here.
      </p>
    </div>
  );
}
