"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Always-visible left rail (typically <ModuleSwitcher>). */
  rail: React.ReactNode;
  /** Top bar (typically <TopBar>). */
  topBar?: React.ReactNode;
  /** Main pane content (commonly a Two/Three pane layout). */
  children: React.ReactNode;
  /** Toast region. Sonner draws its own portal; this slot is a no-op marker. */
  toaster?: React.ReactNode;
}

/**
 * AppShell — outermost layout chrome.
 *
 *   ┌──────────────────────────────────┐
 *   │ rail │ topBar                    │
 *   │      ├───────────────────────────│
 *   │      │ children (panes/page)     │
 *   └──────────────────────────────────┘
 */
export function AppShell({
  rail,
  topBar,
  children,
  toaster,
  className,
  ...props
}: AppShellProps): React.ReactElement {
  return (
    <div
      className={cn(
        "grid h-screen w-full bg-surface-base text-text-primary",
        "grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]",
        className,
      )}
      {...props}
    >
      <div className="row-span-2 max-mobile:hidden">{rail}</div>
      <div className="col-start-2 row-start-1">{topBar}</div>
      <main className="col-start-2 row-start-2 min-h-0 overflow-hidden">{children}</main>
      {toaster}
    </div>
  );
}
