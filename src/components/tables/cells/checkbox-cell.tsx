"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxCellProps {
  value: boolean | null;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: boolean) => void;
  onCancel: () => void;
}

export function CheckboxCell({ value, isSelected, onCommit }: CheckboxCellProps) {
  const checked = value === true;

  return (
    <div
      onClick={() => onCommit(!checked)}
      className={cn(
        "flex h-full w-full cursor-pointer items-center justify-center",
        isSelected ? "ring-1 ring-inset ring-accent-primary" : "",
      )}
    >
      <div className={cn(
        "flex h-4 w-4 items-center justify-center rounded-sm border transition-colors",
        checked
          ? "border-accent-primary bg-accent-primary"
          : "border-border-default bg-surface-base",
      )}>
        {checked && <Check size={10} className="text-text-on-accent" />}
      </div>
    </div>
  );
}
