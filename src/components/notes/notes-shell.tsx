"use client";

import * as React from "react";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotesSidebar } from "./notes-sidebar";

interface NotesShellProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
}

const PANEL_STORAGE_KEY = "notes-right-panel-collapsed";

export function NotesShell({ children, rightPanel }: NotesShellProps): React.ReactElement {
  const [panelCollapsed, setPanelCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(PANEL_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  function togglePanel() {
    setPanelCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(PANEL_STORAGE_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  const showRight = rightPanel && !panelCollapsed;

  const cols = showRight
    ? "grid-cols-[220px_minmax(0,1fr)_320px]"
    : "grid-cols-[220px_minmax(0,1fr)]";

  return (
    <div className={cn("grid h-full min-h-0 w-full overflow-hidden", cols)}>
      <aside
        aria-label="Notes navigation"
        className="min-h-0 overflow-y-auto border-r border-border-subtle bg-surface-sunken max-mobile:hidden"
      >
        <NotesSidebar />
      </aside>

      <div className="relative min-h-0 overflow-hidden">
        {rightPanel ? (
          <button
            type="button"
            onClick={togglePanel}
            aria-label={panelCollapsed ? "Open inspector" : "Close inspector"}
            aria-pressed={!panelCollapsed}
            className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-sm border border-border-default bg-surface-base text-text-tertiary shadow-1 hover:bg-surface-hover hover:text-text-primary"
          >
            <PanelRight size={13} className={cn(panelCollapsed && "rotate-180")} />
          </button>
        ) : null}
        {children}
      </div>

      {showRight ? (
        <aside
          aria-label="Note metadata"
          className="min-h-0 overflow-y-auto border-l border-border-subtle bg-surface-overlay max-tablet:hidden"
        >
          {rightPanel}
        </aside>
      ) : null}
    </div>
  );
}
