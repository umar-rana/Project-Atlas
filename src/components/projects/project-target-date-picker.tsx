"use client";

import * as React from "react";
import { Calendar, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatTargetDate(date: Date | string | null | undefined): string {
  if (!date) return "Set target date";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function ProjectTargetDatePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: Date | string | null | undefined;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const inputValue = React.useMemo(() => {
    if (!value) return "";
    const d = typeof value === "string" ? new Date(value) : value;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (!v) {
      onChange(null);
    } else {
      onChange(new Date(v).toISOString());
    }
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  const hasValue = !!value;

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs transition-colors",
            hasValue ? "text-text-secondary hover:bg-surface-hover" : "text-text-disabled hover:bg-surface-hover hover:text-text-tertiary",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Calendar size={10} />
          <span>
            {hasValue ? `Target: ${formatTargetDate(value)}` : "Set target date"}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <p className="mb-1.5 font-ui text-2xs font-medium text-text-secondary">Target date</p>
          <input
            type="date"
            defaultValue={inputValue}
            onChange={handleChange}
            className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
          />
          {hasValue && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="mt-1.5 block w-full rounded-sm px-2 py-0.5 text-left font-ui text-2xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              Clear date
            </button>
          )}
        </PopoverContent>
      </Popover>
      {hasValue && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          aria-label="Clear target date"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
