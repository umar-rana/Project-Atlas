"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface NumberCellProps {
  value: number | null;
  decimalPlaces?: number;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: number | null) => void;
  onCancel: () => void;
}

export function NumberCell({
  value,
  decimalPlaces = 2,
  isSelected,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
}: NumberCellProps) {
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
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="absolute inset-0 w-full bg-surface-base px-2 py-1 text-right font-ui text-sm text-text-primary ring-2 ring-inset ring-accent-primary focus:outline-none"
      />
    );
  }

  const formatted =
    value !== null
      ? value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: decimalPlaces,
        })
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
