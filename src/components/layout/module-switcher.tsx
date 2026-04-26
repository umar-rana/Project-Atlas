"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ModuleSwitcherItem {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string[];
  badgeCount?: number;
}

export interface ModuleSwitcherProps {
  items: ModuleSwitcherItem[];
  active: string;
  onChange: (id: string) => void;
  /** Brand glyph rendered at the top of the rail. */
  brand?: React.ReactNode;
  /** Slots rendered at the bottom (e.g. theme switcher, account avatar). */
  footer?: React.ReactNode;
}

/**
 * ModuleSwitcher — 48px vertical rail of icon-only module entry points.
 * Driven by the active id; the parent owns navigation.
 */
export function ModuleSwitcher({
  items,
  active,
  onChange,
  brand,
  footer,
}: ModuleSwitcherProps): React.ReactElement {
  return (
    <nav
      aria-label="Modules"
      className="flex h-full w-12 flex-col items-center gap-1 border-r border-border-subtle bg-surface-sunken py-2"
    >
      {brand ? <div className="mb-2 grid size-8 place-items-center">{brand}</div> : null}
      <ul className="flex flex-1 flex-col items-center gap-1">
        {items.map(({ id, label, icon: Icon, shortcut, badgeCount }) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <Tooltip content={label} shortcut={shortcut} side="right">
                <button
                  type="button"
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onChange(id)}
                  className={cn(
                    "relative grid size-8 place-items-center rounded-md text-text-tertiary transition-colors duration-fast ease-standard",
                    "hover:bg-surface-hover hover:text-text-primary",
                    "focus-visible:focus-ring",
                    isActive && "bg-accent-primary-subtle text-accent-primary",
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {badgeCount && badgeCount > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-accent-danger px-px font-mono text-4xs font-semibold leading-none text-text-on-accent"
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      {footer ? <div className="flex flex-col items-center gap-1 pt-2">{footer}</div> : null}
    </nav>
  );
}
