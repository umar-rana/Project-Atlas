"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TagPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Hashtag text without the leading `#`. */
  tag: string;
}

/**
 * TagPill — inline `#tag` reference rendered inside body text.
 *
 * Locked decision 5: this is the inline composed pill. Standalone
 * editor/list-row tags use the <Tag> primitive in `ui/tag.tsx`.
 */
export function TagPill({ tag, className, ...props }: TagPillProps): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex h-control-pill items-center whitespace-nowrap rounded-xs border border-border-subtle bg-surface-raised px-1 align-middle font-ui text-2xs font-medium leading-none text-text-secondary",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="mr-px text-text-tertiary">
        #
      </span>
      {tag}
    </span>
  );
}
