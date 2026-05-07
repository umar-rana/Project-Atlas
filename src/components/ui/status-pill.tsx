"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  "on-hold": "On hold",
  blocked: "Blocked",
  complete: "Complete",
  cancelled: "Cancelled",
  archived: "Archived",
};

const pillVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-px text-3xs font-semibold uppercase leading-snug tracking-caps",
  {
    variants: {
      status: {
        active: "bg-accent-info-muted text-accent-info",
        pending: "bg-accent-warning-muted text-accent-warning",
        "on-hold": "bg-accent-neutral-muted text-text-secondary",
        blocked: "bg-accent-danger-muted text-accent-danger",
        complete: "bg-accent-success-muted text-accent-success",
        cancelled: "border border-border-default bg-transparent text-text-tertiary",
        archived: "border border-border-subtle bg-transparent text-text-disabled",
      },
    },
    defaultVariants: { status: "active" },
  },
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pillVariants> {
  status: NonNullable<VariantProps<typeof pillVariants>["status"]>;
  label?: string;
}

export function StatusPill({
  status,
  label,
  className,
  ...props
}: StatusPillProps): React.ReactElement {
  return (
    <span className={cn(pillVariants({ status }), className)} {...props}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
