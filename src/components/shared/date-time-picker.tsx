"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Combined date + time picker with an "Include time" checkbox.
 * Capture Processing Refinement CR §3.4.3 (CP-5).
 *
 * Presentational component — caller owns the three state pieces. Layout
 * is inline: date input  | checkbox label "Include time" | time input.
 * When `hasTime` is false the time input is rendered but disabled and
 * visually muted; the date is still authoritative.
 *
 * Rule 8.10 — "don't invent times": flipping the checkbox on does NOT
 * auto-commit a time to the data; it just enables the time input. If
 * the time field is empty when toggled on, `defaultTime` (typically the
 * user's `default_event_time` preference) is applied via onTimeChange.
 *
 * Rule 8.12 — locale formatting: the browser's <input type="time">
 * renders in the user's OS locale. A future CR can swap this for a
 * custom 12h/24h-aware picker if needed; the API stays the same.
 */
export interface DateTimePickerProps {
  /** ISO date `yyyy-mm-dd`, or empty string for "no date". */
  dateValue: string;
  /** `HH:MM` (24h), or empty string. Ignored visually when hasTime=false. */
  timeValue: string;
  hasTime: boolean;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onHasTimeChange: (has: boolean) => void;
  /** Applied to time when the user enables "Include time" with no time set. Default "09:00". */
  defaultTime?: string;
  /** Disable both inputs and the checkbox. */
  disabled?: boolean;
  /** Override classes on the outer wrapper. */
  className?: string;
}

const FALLBACK_DEFAULT_TIME = "09:00";

export function DateTimePicker({
  dateValue,
  timeValue,
  hasTime,
  onDateChange,
  onTimeChange,
  onHasTimeChange,
  defaultTime = FALLBACK_DEFAULT_TIME,
  disabled,
  className,
}: DateTimePickerProps): React.ReactElement {
  const checkboxId = React.useId();

  function handleHasTimeToggle(next: boolean) {
    onHasTimeChange(next);
    if (next && !timeValue) {
      onTimeChange(defaultTime);
    }
  }

  const inputCls =
    "min-w-0 rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input
        type="date"
        value={dateValue}
        onChange={(e) => onDateChange(e.target.value)}
        disabled={disabled}
        className={cn(inputCls, "flex-1")}
        aria-label="Date"
      />
      <label
        htmlFor={checkboxId}
        className={cn(
          "flex shrink-0 cursor-pointer items-center gap-1 font-ui text-2xs text-text-secondary",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={hasTime}
          onChange={(e) => handleHasTimeToggle(e.target.checked)}
          disabled={disabled || !dateValue}
          className="h-3 w-3 cursor-pointer accent-accent-primary disabled:cursor-not-allowed"
        />
        Include time
      </label>
      <input
        type="time"
        value={timeValue}
        onChange={(e) => onTimeChange(e.target.value)}
        disabled={disabled || !hasTime}
        aria-label="Time"
        className={cn(inputCls, "w-28", !hasTime && "text-text-tertiary")}
      />
    </div>
  );
}
