"use client";

import * as React from "react";
import { HelpCircle, BookOpen, Keyboard } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useShellStore } from "@/lib/shell/store";

export function TopbarHelpMenu(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const setShortcutsOverlayOpen = useShellStore((s) => s.setShortcutsOverlayOpen);

  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative grid size-8 place-items-center rounded-md transition-colors duration-fast ease-standard",
          "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary focus-visible:focus-ring",
          open && "bg-surface-hover text-text-secondary",
        )}
      >
        <HelpCircle size={16} aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-overlay mt-1 w-48 rounded-lg border border-border-default bg-surface-raised py-1 shadow-2">
          <Link
            href="/welcome"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
          >
            <BookOpen size={14} aria-hidden className="shrink-0 text-text-tertiary" />
            Getting started
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShortcutsOverlayOpen(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
          >
            <Keyboard size={14} aria-hidden className="shrink-0 text-text-tertiary" />
            Keyboard shortcuts
          </button>
        </div>
      )}
    </div>
  );
}
