"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { KeyboardShortcut } from "./keyboard-shortcut";

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export interface TooltipContentProps extends React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
> {
  shortcut?: string[];
}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(function TooltipContent({ className, sideOffset = 6, children, shortcut, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-tooltip inline-flex items-center gap-2 rounded-sm bg-text-primary px-2 py-1 text-2xs font-medium leading-snug text-surface-base shadow-2",
          "data-[state=delayed-open]:animate-atlas-fade-in",
          className,
        )}
        {...props}
      >
        <span>{children}</span>
        {shortcut ? <KeyboardShortcut keys={shortcut} variant="subtle" /> : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});

export interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  shortcut?: string[];
  delayDuration?: number;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function Tooltip({
  children,
  content,
  shortcut,
  delayDuration = 300,
  side = "top",
  align = "center",
}: TooltipProps): React.ReactElement {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align} shortcut={shortcut}>
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
