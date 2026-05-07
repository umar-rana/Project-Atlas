"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * KeyboardShortcut — keycap display.
 *
 * Per Stratum PATTERNS.md:
 *  - Unicode glyphs only (⌘ ⇧ ⌃ ⌥ ⏎ ⌫ ⎋ ⇥). Never `Cmd+K` text.
 *  - Combos separated by hair-spaces (U+200A), never `+`.
 *  - Sequences separated by middle dot (·).
 */
const HAIR_SPACE = "\u200A";

export const KEY_GLYPHS: Record<string, string> = {
  cmd: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  shift: "⇧",
  alt: "⌥",
  opt: "⌥",
  enter: "⏎",
  return: "⏎",
  backspace: "⌫",
  delete: "⌫",
  esc: "⎋",
  escape: "⎋",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  space: "␣",
};

function glyphify(key: string): string {
  const lower = key.toLowerCase();
  return KEY_GLYPHS[lower] ?? key.toUpperCase();
}

export interface KeyboardShortcutProps extends React.HTMLAttributes<HTMLElement> {
  /** Combo keys joined with hair-space (e.g. ["cmd","K"]). */
  keys?: string[];
  /** Sequences of combos joined with middle dot (e.g. [["g"],["i"]]). */
  sequence?: string[][];
  variant?: "default" | "subtle";
}

export function KeyboardShortcut({
  keys,
  sequence,
  variant = "default",
  className,
  children,
  ...props
}: KeyboardShortcutProps): React.ReactElement {
  const renderCombo = (combo: string[]) =>
    combo.map((k, i) => (
      <React.Fragment key={`${k}-${i}`}>
        {i > 0 ? <span aria-hidden>{HAIR_SPACE}</span> : null}
        <Key variant={variant}>{glyphify(k)}</Key>
      </React.Fragment>
    ));

  const segments = sequence ?? (keys ? [keys] : []);

  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-1 align-middle font-mono text-3xs leading-none",
        className,
      )}
      {...props}
    >
      {segments.length > 0
        ? segments.map((combo, i) => (
            <React.Fragment key={i}>
              {i > 0 ? (
                <span className="px-0.5 text-text-tertiary" aria-hidden>
                  ·
                </span>
              ) : null}
              {renderCombo(combo)}
            </React.Fragment>
          ))
        : children}
    </kbd>
  );
}

function Key({
  variant,
  children,
}: {
  variant: "default" | "subtle";
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex min-w-4 items-center justify-center rounded-2xs px-1 py-px font-mono text-3xs font-medium leading-none",
        variant === "subtle"
          ? "border-current/20 bg-current/10 border text-current opacity-70"
          : "border border-b-2 border-border-subtle bg-surface-sunken text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}
