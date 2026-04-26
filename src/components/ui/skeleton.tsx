"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "text" | "line" | "circle" | "block";
  width?: number | string;
  height?: number | string;
}

const variantClass: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  text: "h-2.5 rounded-xs",
  line: "h-3 rounded-xs",
  circle: "rounded-full",
  block: "h-skeleton-block rounded-md",
};

export function Skeleton({
  variant = "line",
  width,
  height,
  style,
  className,
  ...props
}: SkeletonProps): React.ReactElement {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "block animate-atlas-skeleton-pulse rounded-sm bg-surface-hover",
        variantClass[variant],
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
