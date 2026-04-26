"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TwoPaneLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  list: React.ReactNode;
  detail: React.ReactNode;
  listWidth?: number;
  /** When true, hides the list pane below tablet breakpoint. */
  collapseListBelowTablet?: boolean;
}

/**
 * TwoPaneLayout — list + detail. Used by Inbox, Notes, Search.
 */
export function TwoPaneLayout({
  list,
  detail,
  listWidth = 320,
  collapseListBelowTablet = true,
  className,
  style,
  ...props
}: TwoPaneLayoutProps): React.ReactElement {
  return (
    <div
      className={cn("grid h-full min-h-0 w-full overflow-hidden", className)}
      style={{
        gridTemplateColumns: `${listWidth}px minmax(0,1fr)`,
        ...style,
      }}
      {...props}
    >
      <div
        className={cn(
          "min-h-0 overflow-y-auto border-r border-border-subtle bg-surface-base",
          collapseListBelowTablet && "max-mobile:hidden",
        )}
      >
        {list}
      </div>
      <div className="min-h-0 overflow-y-auto bg-surface-base">{detail}</div>
    </div>
  );
}
