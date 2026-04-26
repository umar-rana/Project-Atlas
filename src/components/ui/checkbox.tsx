"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  size?: "sm" | "md";
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ className, size = "sm", ...props }, ref) {
  const dim = size === "md" ? "size-4" : "size-3.5";
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "inline-grid shrink-0 cursor-pointer place-content-center rounded-2xs",
        "border border-border-strong bg-surface-sunken",
        "transition-colors duration-fast ease-standard",
        "hover:border-accent-primary",
        "focus-visible:focus-ring",
        "data-[state=checked]:border-accent-primary data-[state=checked]:bg-accent-primary",
        "data-[state=indeterminate]:border-accent-primary data-[state=indeterminate]:bg-accent-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        dim,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-text-on-accent">
        {props.checked === "indeterminate" ? <Minus size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
