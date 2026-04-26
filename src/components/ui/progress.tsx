"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number | null;
  size?: "sm" | "md";
  variant?: "primary" | "success" | "danger";
}

const VARIANT: Record<NonNullable<ProgressProps["variant"]>, string> = {
  primary: "bg-accent-primary",
  success: "bg-accent-success",
  danger: "bg-accent-danger",
};

export function Progress({
  className,
  value,
  size = "sm",
  variant = "primary",
  ...props
}: ProgressProps): React.ReactElement {
  const indeterminate = value === null || value === undefined;
  return (
    <ProgressPrimitive.Root
      value={indeterminate ? undefined : value}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-surface-sunken",
        size === "md" ? "h-1.5" : "h-1",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full rounded-full transition-[transform,width] duration-medium ease-standard",
          VARIANT[variant],
          indeterminate && "absolute inset-y-0 left-0 w-progress-indet animate-atlas-indet",
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - (value ?? 0)}%)`, width: "100%" }}
      />
    </ProgressPrimitive.Root>
  );
}

export interface ProgressRingProps extends React.SVGAttributes<SVGSVGElement> {
  value: number;
  size?: number;
  strokeWidth?: number;
  variant?: "primary" | "success" | "danger";
}

export function ProgressRing({
  value,
  size = 32,
  strokeWidth = 3,
  variant = "primary",
  className,
  ...props
}: ProgressRingProps): React.ReactElement {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const stroke =
    variant === "success"
      ? "var(--accent-success)"
      : variant === "danger"
        ? "var(--accent-danger)"
        : "var(--accent-primary)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("-rotate-90", className)}
      {...props}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--surface-sunken)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset var(--motion-medium) var(--ease-standard)" }}
      />
    </svg>
  );
}
