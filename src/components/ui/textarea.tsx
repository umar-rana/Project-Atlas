"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoGrow, error, ...props },
  ref,
) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  React.useLayoutEffect(() => {
    if (!autoGrow) return;
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [autoGrow, props.value]);

  return (
    <textarea
      ref={innerRef}
      aria-invalid={error || undefined}
      className={cn(
        "block w-full min-h-textarea resize-y rounded-md border border-border-default bg-surface-sunken px-2.5 py-2",
        "font-ui text-sm leading-snug text-text-primary",
        "transition-colors duration-fast ease-standard",
        "placeholder:text-text-tertiary",
        "hover:border-border-strong",
        "focus:outline-none focus:border-border-focus focus:bg-surface-base focus:shadow-ring-input",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "aria-[invalid=true]:border-border-error",
        autoGrow && "resize-none overflow-hidden",
        className,
      )}
      {...props}
    />
  );
});
