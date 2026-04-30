"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";
import { useShellStore } from "@/lib/shell/store";
import { cn } from "@/lib/utils";

export function MobileTopBar(): React.ReactElement {
  const setCommandPaletteOpen = useShellStore((s) => s.setCommandPaletteOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-base px-3 py-2">
      <button
        type="button"
        aria-label="Search"
        onClick={() => setCommandPaletteOpen(true)}
        className={cn(
          "flex min-h-[40px] flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3",
          "text-left transition-colors active:bg-surface-hover",
        )}
      >
        <Search size={15} className="shrink-0 text-text-tertiary" aria-hidden />
        <span className="font-ui text-sm text-text-tertiary">Search…</span>
      </button>

      <button
        type="button"
        aria-label="Add task"
        onClick={() => setCaptureModalOpen(true)}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          "bg-accent-primary text-white",
          "transition-colors active:bg-accent-primary/90",
        )}
      >
        <Plus size={20} aria-hidden />
      </button>
    </header>
  );
}
