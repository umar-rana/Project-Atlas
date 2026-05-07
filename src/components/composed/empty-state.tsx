"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon | React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** Smaller variant for nested empty states (e.g. inspector pane). */
  size?: "md" | "sm";
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  size = "md",
  className,
  ...props
}: EmptyStateProps): React.ReactElement {
  const padding = size === "sm" ? "py-8 px-3" : "py-12 px-4";
  const renderedIcon = React.isValidElement(icon)
    ? icon
    : icon
      ? React.createElement(icon as LucideIcon, {
          size: size === "sm" ? 22 : 28,
          "aria-hidden": true,
        })
      : null;
  return (
    <div
      role="status"
      className={cn(
        "mx-auto flex max-w-empty-state flex-col items-center justify-center gap-2 text-center",
        padding,
        className,
      )}
      {...props}
    >
      {renderedIcon ? <span className="mb-1 text-text-disabled">{renderedIcon}</span> : null}
      <h3 className="m-0 font-ui text-md font-semibold leading-snug text-text-primary">{title}</h3>
      {body ? (
        <p className="m-0 font-ui text-sm leading-relaxed text-text-tertiary">{body}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
