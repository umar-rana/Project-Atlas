"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, selected, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-interactive={interactive || undefined}
      data-selected={selected || undefined}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-raised p-3",
        interactive &&
          "cursor-pointer transition-colors duration-fast ease-standard hover:border-border-default hover:bg-surface-hover hover:shadow-1",
        selected && "border-accent-primary shadow-ring-card-selected",
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-between gap-2", className)}
        {...props}
      />
    );
  },
);

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn("m-0 font-ui text-sm font-semibold leading-snug text-text-primary", className)}
      {...props}
    />
  );
});

export const CardSubtitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardSubtitle({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={cn("m-0 font-ui text-xs leading-snug text-text-tertiary", className)}
      {...props}
    />
  );
});

export const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("font-ui text-xs leading-relaxed text-text-secondary", className)}
        {...props}
      />
    );
  },
);

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-between gap-2", className)}
        {...props}
      />
    );
  },
);
