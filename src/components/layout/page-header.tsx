"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional row rendered below the title (filters, tabs, etc). */
  toolbar?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
  toolbar,
  className,
  ...props
}: PageHeaderProps): React.ReactElement {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border-subtle px-4 py-4 mobile:px-6",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-3 mobile:flex-row mobile:items-start mobile:justify-between mobile:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 truncate font-ui text-2xl font-semibold leading-tight tracking-tight text-text-primary">
            {title}
          </h1>
          {description ? (
            <p className="m-0 max-w-paragraph font-ui text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5 font-ui text-xs text-text-tertiary">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
    </header>
  );
}
