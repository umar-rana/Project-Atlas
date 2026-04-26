"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Tag — list-row tag primitive used for editing-style references.
 *
 * Per locked decision 5: this is the single Tag primitive. It accepts a
 * `family` prop ("format" | "purpose" | "freeform") that maps to Stratum's
 * outlined / filled / soft visual treatments. Inline `#tag` references in
 * rendered text use the separate <TagPill> composed component.
 */
const tagVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap font-ui font-medium leading-snug",
  {
    variants: {
      family: {
        format: "border border-border-default bg-transparent text-text-secondary rounded-xs",
        purpose: "border border-transparent bg-accent-neutral-muted text-text-primary rounded-xs",
        freeform: "border border-border-subtle bg-surface-raised text-text-secondary rounded-full",
      },
      size: {
        sm: "h-control-pill px-1.5 text-2xs",
        md: "h-5 px-2 text-xs",
      },
    },
    defaultVariants: { family: "format", size: "sm" },
  },
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {
  removable?: boolean;
  onRemove?: () => void;
  /** Map onto a calendar palette hue (1-12). */
  hue?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
}

const HUE_STYLES: Record<number, string> = {
  1: "text-cal-1-border border-cal-1-border [&[data-family=purpose]]:bg-cal-1-soft [&[data-family=purpose]]:text-cal-1-border",
  2: "text-cal-2-border border-cal-2-border [&[data-family=purpose]]:bg-cal-2-soft [&[data-family=purpose]]:text-cal-2-border",
  3: "text-cal-3-border border-cal-3-border [&[data-family=purpose]]:bg-cal-3-soft [&[data-family=purpose]]:text-cal-3-border",
  4: "text-cal-4-border border-cal-4-border [&[data-family=purpose]]:bg-cal-4-soft [&[data-family=purpose]]:text-cal-4-border",
  5: "text-cal-5-border border-cal-5-border [&[data-family=purpose]]:bg-cal-5-soft [&[data-family=purpose]]:text-cal-5-border",
  6: "text-cal-6-border border-cal-6-border [&[data-family=purpose]]:bg-cal-6-soft [&[data-family=purpose]]:text-cal-6-border",
  7: "text-cal-7-border border-cal-7-border [&[data-family=purpose]]:bg-cal-7-soft [&[data-family=purpose]]:text-cal-7-border",
  8: "text-cal-8-border border-cal-8-border [&[data-family=purpose]]:bg-cal-8-soft [&[data-family=purpose]]:text-cal-8-border",
  9: "text-cal-9-border border-cal-9-border [&[data-family=purpose]]:bg-cal-9-soft [&[data-family=purpose]]:text-cal-9-border",
  10: "text-cal-10-border border-cal-10-border [&[data-family=purpose]]:bg-cal-10-soft [&[data-family=purpose]]:text-cal-10-border",
  11: "text-cal-11-border border-cal-11-border [&[data-family=purpose]]:bg-cal-11-soft [&[data-family=purpose]]:text-cal-11-border",
  12: "text-cal-12-border border-cal-12-border [&[data-family=purpose]]:bg-cal-12-soft [&[data-family=purpose]]:text-cal-12-border",
};

export function Tag({
  className,
  family = "format",
  size,
  removable,
  onRemove,
  hue,
  children,
  ...props
}: TagProps): React.ReactElement {
  return (
    <span
      data-family={family}
      className={cn(tagVariants({ family, size }), hue ? HUE_STYLES[hue] : undefined, className)}
      {...props}
    >
      {children}
      {removable ? (
        <button
          type="button"
          aria-label="Remove tag"
          onClick={onRemove}
          className="-mr-0.5 inline-flex shrink-0 cursor-pointer p-0 opacity-60 hover:opacity-100"
        >
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}
