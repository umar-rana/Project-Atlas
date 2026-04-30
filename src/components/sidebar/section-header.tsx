"use client";

import * as React from "react";
import { ChevronRight, ChevronDown, Plus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  label,
  expanded,
  onToggle,
  onAdd,
  onManage,
  count,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  onManage?: () => void;
  count?: number;
}) {
  return (
    <div className="mt-3 flex items-center justify-between px-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 font-ui text-3xs font-semibold uppercase tracking-caps text-text-tertiary hover:text-text-secondary"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
        {!expanded && count !== undefined ? (
          <span className="ml-0.5 font-mono text-3xs tabular-nums">({count})</span>
        ) : null}
      </button>
      <div className="flex items-center gap-0.5">
        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            aria-label={`Manage ${label.toLowerCase()}`}
            className="inline-flex size-4 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <Settings2 size={11} />
          </button>
        ) : null}
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add ${label.toLowerCase()}`}
            className="inline-flex size-4 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <Plus size={11} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function useSidebarSection(key: string, defaultOpen: boolean) {
  const storageKey = `sidebar-section-${key}`;
  const [open, setOpenRaw] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored !== null ? stored === "true" : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  function setOpen(value: boolean) {
    setOpenRaw(value);
    try {
      window.localStorage.setItem(storageKey, String(value));
    } catch {
    }
  }

  return [open, setOpen] as const;
}
