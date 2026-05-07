"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { KeyboardShortcut } from "./keyboard-shortcut";

export interface HintProps {
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: "sm" | "md";
  delayDuration?: number;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Hint({
  label,
  shortcut,
  side = "top",
  size = "sm",
  delayDuration,
  disabled = false,
  children,
}: HintProps): React.ReactElement {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          avoidCollisions
          className={cn(
            "hint-tooltip z-tooltip inline-flex items-center gap-2 rounded-sm bg-text-primary px-2 py-1 font-medium leading-snug text-surface-base shadow-2",
            "data-[state=delayed-open]:animate-atlas-fade-in",
            size === "sm" ? "text-2xs" : "text-xs",
          )}
        >
          <span>{label}</span>
          {shortcut ? <KeyboardShortcut keys={[shortcut]} variant="subtle" /> : null}
          <TooltipPrimitive.Arrow className="fill-text-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
