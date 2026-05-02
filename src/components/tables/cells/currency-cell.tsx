"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CurrencyCellProps {
  value: number | null;
  currencySymbol?: string;
  decimalPlaces?: number;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: number | null) => void;
  onCancel: () => void;
}

export function CurrencyCell({ value, currencySymbol = "$", decimalPlaces = 2, isSelected, isEditing, onStartEdit, onCommit, onCancel }: CurrencyCellProps) {
  const [draft, setDraft] = React.useState(value !== null ? String(value) : "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      setDraft(value !== null ? String(value) : "");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing, value]);

  function commit() {
    const n = parseFloat(draft);
    onCommit(isNaN(n) ? null : n);
  }

  if (isEditing) {
    return (
      <div className="absolute inset-0 flex items-center ring-2 ring-inset ring-accent-primary bg-surface-base">
        <span className="pl-2 font-ui text-sm text-text-tertiary">{currencySymbol}</span>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          }}
          className="flex-1 bg-transparent px-1 py-1 font-ui text-sm text-right text-text-primary focus:outline-none"
        />
      </div>
    );
  }

  const formatted = value !== null
    ? `${currencySymbol}${value.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}`
    : "";

  return (
    <div
      onClick={onStartEdit}
      className={cn(
        "flex h-full w-full cursor-pointer items-center justify-end px-2 font-ui text-sm tabular-nums",
        isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
        value !== null ? "text-text-primary" : "text-text-disabled",
      )}
    >
      {formatted}
    </div>
  );
}
