"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const spinnerVariants = cva(
  "inline-block animate-atlas-spin rounded-full border-border-default border-t-accent-primary",
  {
    variants: {
      size: {
        sm: "size-2.5 border-1.5",
        md: "size-3.5 border-2",
        lg: "size-6 border-2.5",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

export function Spinner({
  size,
  label = "Loading",
  className,
  ...props
}: SpinnerProps): React.ReactElement {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-busy="true"
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  );
}
