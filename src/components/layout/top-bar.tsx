"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";

export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Left slot — usually breadcrumbs or workspace title. */
  leading?: React.ReactNode;
  /** Right slot — usually action icons + avatar. */
  trailing?: React.ReactNode;
  /** Center search trigger. */
  searchPlaceholder?: string;
  onOpenSearch?: () => void;
  searchShortcut?: string[];
}

export function TopBar({
  leading,
  trailing,
  searchPlaceholder = "Search Atlas",
  onOpenSearch,
  searchShortcut = ["cmd", "K"],
  className,
  ...props
}: TopBarProps): React.ReactElement {
  return (
    <header
      role="banner"
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-base px-3",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{leading}</div>
      <button
        type="button"
        onClick={onOpenSearch}
        className={cn(
          "inline-flex h-30 min-w-0 max-w-top-bar-search flex-1 cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-sunken px-2 text-left text-sm text-text-tertiary",
          "transition-colors duration-fast ease-standard",
          "hover:border-border-strong hover:bg-surface-hover",
          "focus-visible:focus-ring",
        )}
      >
        <Search size={12} aria-hidden />
        <span className="flex-1 truncate">{searchPlaceholder}</span>
        <KeyboardShortcut keys={searchShortcut} variant="subtle" />
      </button>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </header>
  );
}
