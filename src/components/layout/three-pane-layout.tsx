"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ThreePaneLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  nav: React.ReactNode;
  list: React.ReactNode;
  detail: React.ReactNode;
  inspector?: React.ReactNode;
  navWidth?: number;
  listWidth?: number;
  inspectorWidth?: number;
}

/**
 * ThreePaneLayout — nav + list + detail (+ optional inspector). The inspector
 * collapses below tablet and the nav collapses below mobile breakpoints.
 */
export function ThreePaneLayout({
  nav,
  list,
  detail,
  inspector,
  navWidth = 232,
  listWidth = 320,
  inspectorWidth = 320,
  className,
  style,
  ...props
}: ThreePaneLayoutProps): React.ReactElement {
  const cols = inspector
    ? `${navWidth}px ${listWidth}px minmax(0,1fr) ${inspectorWidth}px`
    : `${navWidth}px ${listWidth}px minmax(0,1fr)`;
  return (
    <div
      className={cn("grid h-full min-h-0 w-full overflow-hidden", className)}
      style={{ gridTemplateColumns: cols, ...style }}
      {...props}
    >
      <aside
        aria-label="Navigation"
        className="min-h-0 overflow-y-auto border-r border-border-subtle bg-surface-sunken max-mobile:hidden"
      >
        {nav}
      </aside>
      <div className="min-h-0 overflow-y-auto border-r border-border-subtle bg-surface-base">{list}</div>
      <div className="min-h-0 overflow-y-auto bg-surface-base">{detail}</div>
      {inspector ? (
        <aside
          aria-label="Inspector"
          className="min-h-0 overflow-y-auto bg-surface-overlay max-tablet:hidden"
        >
          {inspector}
        </aside>
      ) : null}
    </div>
  );
}
