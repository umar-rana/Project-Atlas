"use client";

import * as React from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";

interface LightboxItem {
  id: string;
  filename: string;
  content_type: string;
  file_id: string;
}

interface AttachmentLightboxProps {
  items: LightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}

export function AttachmentLightbox({ items, initialIndex = 0, onClose }: AttachmentLightboxProps) {
  const [index, setIndex] = React.useState(initialIndex);
  const [zoom, setZoom] = React.useState(1);
  const item = items[index];

  const isImage = item?.content_type?.startsWith("image/");
  const isPdf = item?.content_type === "application/pdf";
  const isVideo = item?.content_type?.startsWith("video/");
  const isAudio = item?.content_type?.startsWith("audio/");

  const src = item ? `/api/attachments/${item.file_id}` : "";

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [items.length, onClose]);

  React.useEffect(() => {
    setZoom(1);
  }, [index]);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attachment viewer"
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between border-b border-white/10 px-4 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="max-w-md truncate font-ui text-sm text-white/80">
          {item.filename}
          {items.length > 1 && (
            <span className="ml-2 text-xs text-white/40">
              {index + 1} / {items.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom((z) => Math.max(0.25, z - 0.25));
                }}
                className="rounded-sm p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Zoom out"
              >
                <ZoomOut size={16} />
              </button>
              <span className="font-ui text-xs text-white/60">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom((z) => Math.min(4, z + 0.25));
                }}
                className="rounded-sm p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Zoom in"
              >
                <ZoomIn size={16} />
              </button>
            </>
          )}
          <a
            href={src}
            download={item.filename}
            onClick={(e) => e.stopPropagation()}
            className="rounded-sm p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Download"
          >
            <Download size={16} />
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="rounded-sm p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {items.length > 1 && index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className="absolute left-2 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Previous"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={item.filename}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center",
                maxHeight: "calc(100vh - 120px)",
                maxWidth: "100%",
              }}
              className="transition-transform"
            />
          )}
          {isPdf && (
            <iframe
              src={src}
              title={item.filename}
              className="h-[calc(100vh-120px)] w-full max-w-4xl rounded-sm"
            />
          )}
          {isVideo && (
            <video src={src} controls className="max-h-[calc(100vh-120px)] max-w-full rounded-sm">
              Your browser does not support video playback.
            </video>
          )}
          {isAudio && (
            <div className="flex flex-col items-center gap-4">
              <p className="font-ui text-white/80">{item.filename}</p>
              <audio src={src} controls className="w-80">
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
          {!isImage && !isPdf && !isVideo && !isAudio && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="font-ui text-lg text-white/80">{item.filename}</p>
              <p className="font-ui text-sm text-white/50">This file type cannot be previewed.</p>
              <a
                href={src}
                download={item.filename}
                className="rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-white hover:bg-accent-primary-hover"
              >
                Download file
              </a>
            </div>
          )}
        </div>

        {items.length > 1 && index < items.length - 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="absolute right-2 z-10 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Next"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
