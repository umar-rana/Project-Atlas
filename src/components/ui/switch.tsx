"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  size?: "sm" | "md";
}

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch({ className, size = "sm", ...props }, ref) {
  const trackDim = size === "md" ? "h-control-pill w-switch-track-md" : "h-4 w-switch-track-sm";
  const thumbDim = size === "md" ? "size-3.5" : "size-3";
  const thumbTranslate = size === "md" ? "data-[state=checked]:translate-x-3.5" : "data-[state=checked]:translate-x-3";
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full",
        "bg-border-default transition-colors duration-fast ease-standard",
        "data-[state=checked]:bg-accent-primary",
        "focus-visible:focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        trackDim,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block translate-x-0.5 rounded-full bg-text-primary transition-transform duration-fast ease-standard",
          "data-[state=checked]:bg-text-on-accent",
          thumbDim,
          thumbTranslate,
        )}
      />
    </SwitchPrimitive.Root>
  );
});
