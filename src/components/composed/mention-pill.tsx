"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface MentionPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  handle: string;
  isSelf?: boolean;
}

/**
 * MentionPill — inline `@person` reference rendered inside body text.
 * Aligned to text via baseline; never breaks line in the middle of the handle.
 */
export function MentionPill({
  handle,
  isSelf,
  className,
  ...props
}: MentionPillProps): React.ReactElement {
  return (
    <span
      data-handle={handle}
      className={cn(
        "inline-flex h-control-pill items-center gap-0.5 whitespace-nowrap rounded-sm px-1.25 align-middle font-ui text-2xs font-medium leading-none",
        isSelf
          ? "bg-accent-success-muted text-accent-success"
          : "bg-accent-primary-subtle text-accent-primary",
        className,
      )}
      {...props}
    >
      <span aria-hidden>@</span>
      {handle}
    </span>
  );
}
