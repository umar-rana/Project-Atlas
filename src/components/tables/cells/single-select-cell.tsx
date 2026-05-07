"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SingleSelectOption } from "@/core/tables/types";

interface SingleSelectCellProps {
  value: string | null;
  options: SingleSelectOption[];
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
}

export function SingleSelectCell({
  value,
  options,
  isSelected,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
}: SingleSelectCellProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.id === value);

  React.useEffect(() => {
    if (!isEditing) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing, onCancel]);

  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-x-0 top-0 z-overlay min-w-[160px] rounded-md border border-border-default bg-surface-raised shadow-2"
      >
        <div className="max-h-48 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => onCommit(null)}
            className="w-full px-3 py-1.5 text-left font-ui text-sm text-text-tertiary hover:bg-surface-hover"
          >
            — Clear —
          </button>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onCommit(opt.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-sm hover:bg-surface-hover",
                opt.id === value
                  ? "bg-accent-primary-subtle text-accent-primary"
                  : "text-text-primary",
              )}
            >
              {opt.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: opt.color }}
                />
              )}
              {opt.label}
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-2 font-ui text-sm text-text-disabled">No options defined</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className={cn(
        "flex h-full w-full cursor-pointer items-center gap-1.5 px-2",
        isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
      )}
    >
      {selectedOption ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-ui text-xs",
            "bg-surface-sunken text-text-primary",
          )}
        >
          {selectedOption.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          {selectedOption.label}
        </span>
      ) : (
        <span className="font-ui text-sm text-text-disabled"></span>
      )}
      <ChevronDown size={10} className="ml-auto shrink-0 text-text-disabled" />
    </div>
  );
}
