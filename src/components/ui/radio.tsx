"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Root ref={ref} className={cn("grid gap-1.5", className)} {...props} />
  );
});

export const Radio = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function Radio({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "inline-grid size-3.5 cursor-pointer place-content-center rounded-full",
        "border border-border-strong bg-surface-sunken",
        "transition-colors duration-fast ease-standard",
        "hover:border-accent-primary",
        "focus-visible:focus-ring",
        "data-[state=checked]:border-accent-primary data-[state=checked]:bg-accent-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="block size-1.5 rounded-full bg-text-on-accent" />
    </RadioGroupPrimitive.Item>
  );
});
