"use client";

import React, { useCallback, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { PROVIDER_ASPECT, PROVIDER_LABELS, type EmbedProvider, type AspectRatioClass } from "@/core/notes/embed-providers";
import { cn } from "@/lib/utils";

export type EmbedAttrs = {
  provider: EmbedProvider | null;
  url: string;
  embed_url: string;
  title: string;
  thumbnail_url: string;
};

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";

const fixedAspectStyles: Partial<Record<AspectRatioClass, string>> = {
  video: "aspect-video",
  music: "h-[152px]",
  code: "h-[400px]",
};

export function iframeSandbox(_provider: EmbedProvider | null): string {
  return IFRAME_SANDBOX;
}

function EmbedNodeView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as EmbedAttrs;
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const aspect = attrs.provider ? PROVIDER_ASPECT[attrs.provider] : "video";
  const providerLabel = attrs.provider ? PROVIDER_LABELS[attrs.provider] : "Embed";
  const isTweet = aspect === "tweet";

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => {
    setLoaded(true);
    setErrored(true);
  }, []);

  return (
    <NodeViewWrapper
      className={cn(
        "embed-node my-3 w-full overflow-hidden rounded-lg border border-border-default bg-surface-raised",
        selected && "ring-2 ring-accent-primary",
      )}
      data-type="embed"
      contentEditable={false}
    >
      {attrs.title && (
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <span className="text-xs font-medium text-text-tertiary">{providerLabel}</span>
          <span className="truncate text-xs text-text-secondary">{attrs.title}</span>
        </div>
      )}

      {isTweet ? (
        <div className="relative w-full min-h-[200px] bg-surface-sunken">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
              <div className="h-2 w-32 animate-pulse rounded bg-surface-hover" />
              <div className="h-2 w-20 animate-pulse rounded bg-surface-hover" />
            </div>
          )}
          {errored ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4 text-center min-h-[200px]">
              <span className="text-sm font-medium text-text-secondary">Embed unavailable</span>
              <a
                href={attrs.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-text-link hover:text-text-link-hover underline"
              >
                {attrs.url}
              </a>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={attrs.embed_url}
              title={attrs.title || providerLabel}
              className="w-full border-0"
              style={{ minHeight: 200, display: loaded ? "block" : "none" }}
              sandbox={IFRAME_SANDBOX}
              allowFullScreen
              loading="lazy"
              onLoad={handleLoad}
              onError={handleError}
            />
          )}
        </div>
      ) : (
        <div className={cn("relative w-full bg-surface-sunken", fixedAspectStyles[aspect])}>
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
              {attrs.thumbnail_url && (
                <img
                  src={attrs.thumbnail_url}
                  alt={attrs.title || "Embed preview"}
                  className="max-h-24 rounded object-cover opacity-60"
                />
              )}
              <div className="h-2 w-32 animate-pulse rounded bg-surface-hover" />
              <div className="h-2 w-20 animate-pulse rounded bg-surface-hover" />
            </div>
          )}

          {errored ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <span className="text-sm font-medium text-text-secondary">Embed unavailable</span>
              <a
                href={attrs.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-text-link hover:text-text-link-hover underline"
              >
                {attrs.url}
              </a>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={attrs.embed_url}
              title={attrs.title || providerLabel}
              className={cn(
                "absolute inset-0 h-full w-full border-0 transition-opacity duration-300",
                loaded ? "opacity-100" : "opacity-0",
              )}
              sandbox={IFRAME_SANDBOX}
              allowFullScreen
              loading="lazy"
              onLoad={handleLoad}
              onError={handleError}
            />
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const EmbedNode = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: { default: null },
      url: { default: "" },
      embed_url: { default: "" },
      title: { default: "" },
      thumbnail_url: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='embed']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "embed" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },
});
