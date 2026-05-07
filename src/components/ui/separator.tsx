"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends React.ComponentPropsWithoutRef<
  typeof SeparatorPrimitive.Root
> {
  label?: string;
  strong?: boolean;
}

export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  SeparatorProps
>(function Separator(
  { className, orientation = "horizontal", decorative = true, label, strong, ...props },
  ref,
) {
  if (label && orientation === "horizontal") {
    return (
      <div
        role={decorative ? undefined : "separator"}
        className={cn("flex w-full items-center gap-2", className)}
      >
        <span
          className={cn(
            "flex-1 border-t",
            strong ? "border-border-default" : "border-border-subtle",
          )}
        />
        <span className="font-ui text-3xs font-medium uppercase tracking-caps text-text-tertiary">
          {label}
        </span>
        <span
          className={cn(
            "flex-1 border-t",
            strong ? "border-border-default" : "border-border-subtle",
          )}
        />
      </div>
    );
  }
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      orientation={orientation}
      decorative={decorative}
      className={cn(
        strong ? "bg-border-default" : "bg-border-subtle",
        orientation === "horizontal" ? "h-px w-full" : "h-full min-h-3 w-px",
        className,
      )}
      {...props}
    />
  );
});
