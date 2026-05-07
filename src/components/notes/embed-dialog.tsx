"use client";

import React, { useCallback, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { Editor } from "@tiptap/react";
import { detectEmbedProvider, PROVIDER_LABELS } from "@/core/notes/embed-providers";
import { cn } from "@/lib/utils";

type Props = {
  editor: Editor;
  from: number;
  queryLength: number;
  onClose: () => void;
};

const SUPPORTED_PROVIDERS = Object.entries(PROVIDER_LABELS)
  .map(([, label]) => label)
  .join(", ");

export function EmbedDialog({ editor, from, queryLength, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolveEmbed = trpc.notes.resolveEmbed.useQuery(
    { url: url.trim() },
    { enabled: false },
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;

      const detected = detectEmbedProvider(trimmed);
      if (!detected) {
        setError(
          "URL not supported. Try pasting it as a link instead. Supported: " +
            SUPPORTED_PROVIDERS,
        );
        return;
      }

      setError(null);
      setLoading(true);

      let title = "";
      let thumbnail_url = "";

      try {
        const result = await resolveEmbed.refetch();
        if (result.data) {
          title = result.data.title ?? "";
          thumbnail_url = result.data.thumbnail_url ?? "";
        }
      } catch {
        // oEmbed is optional — proceed without metadata
      }

      setLoading(false);

      const triggerLength = 1 + queryLength;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to: from + triggerLength })
        .insertContent({
          type: "embed",
          attrs: {
            provider: detected.provider,
            url: detected.canonical_url,
            embed_url: detected.embed_url,
            title,
            thumbnail_url,
          },
        })
        .run();

      onClose();
    },
    [url, queryLength, from, editor, onClose, resolveEmbed],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-modal-backdrop flex items-start justify-center pt-[14vh] bg-scrim-modal"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border-default bg-surface-raised shadow-4 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Insert embed</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Supported: {SUPPORTED_PROVIDERS}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            URL
          </label>
          <input
            ref={inputRef}
            autoFocus
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            className={cn(
              "w-full rounded-md border bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-shadow",
              "focus:shadow-ring-focus border-border-default focus:border-border-focus",
              error && "border-border-error focus:border-border-error",
            )}
          />

          {error && (
            <p className="mt-2 text-xs text-accent-danger">{error}</p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default bg-transparent px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className={cn(
                "rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover transition-colors",
                (loading || !url.trim()) && "opacity-50 cursor-not-allowed",
              )}
            >
              {loading ? "Loading…" : "Embed"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
