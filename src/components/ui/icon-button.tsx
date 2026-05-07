"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center p-0",
    "border border-transparent rounded-sm",
    "bg-transparent text-text-tertiary",
    "transition-colors duration-fast ease-standard",
    "hover:bg-surface-hover hover:text-text-primary",
    "active:bg-surface-active",
    "focus-visible:focus-ring",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "aria-pressed:bg-accent-primary-subtle aria-pressed:text-accent-primary",
  ].join(" "),
  {
    variants: {
      variant: {
        ghost: "",
        solid: "bg-surface-raised border-border-default text-text-secondary hover:bg-surface-hover",
        primary:
          "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover hover:text-text-on-accent",
        destructive: "text-accent-danger hover:bg-accent-danger-muted hover:text-accent-danger",
      },
      size: {
        sm: "w-22 h-22",
        md: "w-28 h-28",
        lg: "w-36 h-36 rounded-md",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  /** Required for screen readers — icon-only buttons must label themselves. */
  "aria-label": string;
  isActive?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant, size, isActive, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={isActive ? true : undefined}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
