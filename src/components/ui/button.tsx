"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none",
    "font-medium font-ui",
    "border border-transparent rounded-md",
    "transition-colors duration-fast ease-standard",
    "focus-visible:focus-ring",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-accent-primary text-text-on-accent hover:bg-accent-primary-hover active:bg-accent-primary-active",
        secondary:
          "bg-surface-raised border-border-default text-text-primary hover:bg-surface-hover hover:border-border-strong active:bg-surface-active",
        ghost:
          "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active",
        destructive: "bg-accent-danger text-text-on-accent hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-22 px-2 text-2xs rounded-sm",
        md: "h-28 px-2.5 text-xs",
        lg: "h-36 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Spinner = ({ size = 14 }: { size?: number }) => (
  <span
    aria-hidden
    className="inline-block animate-atlas-spin rounded-full border-2 border-current border-r-transparent"
    style={{ width: size, height: size }}
  />
);

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, isLoading, leftIcon, rightIcon, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={isLoading || undefined}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {leftIcon ? <span aria-hidden className="-ml-0.5 inline-flex">{leftIcon}</span> : null}
          <span>{children}</span>
          {rightIcon ? <span aria-hidden className="-mr-0.5 inline-flex">{rightIcon}</span> : null}
        </>
      )}
    </Comp>
  );
});
