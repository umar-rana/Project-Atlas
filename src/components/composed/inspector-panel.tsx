"use client";

import * as React from "react";
import { Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InspectorSection {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export interface InspectorPanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
  sections?: InspectorSection[];
  footer?: React.ReactNode;
}

/**
 * InspectorPanel — right-pane property/details surface used across modules.
 * Always renders the toggle-pin (locked decision 18). Sections are
 * collapsible, persisted by the consumer via id.
 */
export function InspectorPanel({
  title,
  subtitle,
  pinned,
  onTogglePin,
  onClose,
  sections = [],
  footer,
  className,
  children,
  ...props
}: InspectorPanelProps): React.ReactElement {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-l border-border-subtle bg-surface-overlay",
        className,
      )}
      aria-label="Inspector"
      {...props}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate font-ui text-sm font-semibold text-text-primary">{title}</h2>
          {subtitle ? (
            <p className="m-0 truncate font-ui text-2xs text-text-tertiary">{subtitle}</p>
          ) : null}
        </div>
        {onTogglePin ? (
          <button
            type="button"
            aria-label={pinned ? "Unpin inspector" : "Pin inspector"}
            aria-pressed={pinned ? true : undefined}
            onClick={onTogglePin}
            className="inline-flex size-22 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            aria-label="Close inspector"
            onClick={onClose}
            className="inline-flex size-22 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
          >
            <X size={14} />
          </button>
        ) : null}
      </header>
      <div className="flex-1 overflow-y-auto">
        {children}
        {sections.map((section) => (
          <details
            key={section.id}
            open={section.defaultOpen ?? true}
            className="border-b border-border-subtle [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-ui text-2xs font-semibold uppercase tracking-caps text-text-secondary hover:bg-surface-hover">
              {section.title}
              <span aria-hidden className="font-mono text-text-tertiary transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1">{section.children}</div>
          </details>
        ))}
      </div>
      {footer ? (
        <footer className="border-t border-border-subtle px-3 py-2">{footer}</footer>
      ) : null}
    </aside>
  );
}
