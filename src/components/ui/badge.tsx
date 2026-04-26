"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-1 font-mono font-semibold leading-none tabular-nums",
  {
    variants: {
      variant: {
        primary: "bg-accent-primary text-text-on-accent",
        neutral: "bg-surface-active text-text-secondary",
        success: "bg-accent-success text-text-on-accent",
        warning: "bg-accent-warning text-text-on-accent",
        danger: "bg-accent-danger text-text-on-accent",
      },
      size: {
        sm: "min-w-4 h-4 text-3xs",
        md: "min-w-5 h-5 text-2xs",
      },
      shape: { count: "", dot: "min-w-2 size-2 p-0" },
    },
    defaultVariants: { variant: "primary", size: "sm", shape: "count" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  count?: number;
  max?: number;
}

export function Badge({
  className,
  variant,
  size,
  shape,
  count,
  max = 99,
  children,
  ...props
}: BadgeProps): React.ReactElement {
  const content = shape === "dot" ? null : count !== undefined ? (count > max ? `${max}+` : count) : children;
  return (
    <span
      role={shape === "dot" ? "status" : undefined}
      className={cn(badgeVariants({ variant, size, shape }), className)}
      {...props}
    >
      {content}
    </span>
  );
}
