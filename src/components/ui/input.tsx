"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const inputWrapVariants = cva(
  [
    "inline-flex w-full items-center gap-1.5",
    "bg-surface-sunken border border-border-default rounded-md",
    "text-text-primary",
    "transition-colors duration-fast ease-standard",
    "hover:border-border-strong",
    "focus-within:border-border-focus focus-within:bg-surface-base focus-within:shadow-ring-input",
    "data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed",
    "data-[error=true]:border-border-error",
    "data-[error=true]:focus-within:shadow-ring-input-error",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-control-input px-1.5 text-xs",
        md: "h-control-input-md px-2 text-sm",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix">,
    VariantProps<typeof inputWrapVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  error?: boolean;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    containerClassName,
    leftIcon,
    rightIcon,
    prefix,
    suffix,
    error,
    size,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <div
      className={cn(inputWrapVariants({ size }), containerClassName)}
      data-disabled={disabled || undefined}
      data-error={error || undefined}
    >
      {leftIcon ? <span aria-hidden className="text-text-tertiary inline-flex shrink-0">{leftIcon}</span> : null}
      {prefix ? <span className="font-mono text-xs font-medium text-text-tertiary shrink-0">{prefix}</span> : null}
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none",
          "placeholder:text-text-tertiary",
          className,
        )}
        {...props}
      />
      {suffix ? <span className="font-mono text-xs font-medium text-text-tertiary shrink-0">{suffix}</span> : null}
      {rightIcon ? <span aria-hidden className="text-text-tertiary inline-flex shrink-0">{rightIcon}</span> : null}
    </div>
  );
});
