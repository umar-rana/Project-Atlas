"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";

export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Left slot — breadcrumbs, workspace title, etc. */
  leading?: React.ReactNode;
  /** Right slot — sync status, avatar, etc. */
  trailing?: React.ReactNode;
  /** Node rendered immediately to the right of the search trigger (e.g. capture button). */
  captureNode?: React.ReactNode;
  /** Center search trigger placeholder. */
  searchPlaceholder?: string;
  onOpenSearch?: () => void;
  searchShortcut?: string[];
}

export function TopBar({
  leading,
  trailing,
  captureNode,
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
        "relative flex h-12 shrink-0 items-center border-b border-border-subtle bg-surface-base px-3",
        className,
      )}
      {...props}
    >
      {/* Left slot */}
      <div className="flex shrink-0 items-center gap-2">{leading}</div>

      {/* Center: search + capture — absolutely centered so it's always in the middle */}
      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center">
        <div className="pointer-events-auto flex w-full max-w-[556px] min-w-[340px] items-center gap-2 px-4">
          <button
            type="button"
            onClick={onOpenSearch}
            className={cn(
              "inline-flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-sunken px-2 text-left text-sm text-text-tertiary",
              "transition-colors duration-fast ease-standard",
              "hover:border-border-strong hover:bg-surface-hover",
              "focus-visible:focus-ring",
            )}
          >
            <Search size={12} aria-hidden />
            <span className="flex-1 truncate">{searchPlaceholder}</span>
            <KeyboardShortcut keys={searchShortcut} variant="subtle" />
          </button>
          {captureNode}
        </div>
      </div>

      {/* Right slot */}
      <div className="ml-auto flex shrink-0 items-center gap-1">{trailing}</div>
    </header>
  );
}
