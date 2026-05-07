"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DateCellProps {
  value: string | null;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
}

export function DateCell({
  value,
  isSelected,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
}: DateCellProps) {
  const [draft, setDraft] = React.useState(value ? value.slice(0, 10) : "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      setDraft(value ? value.slice(0, 10) : "");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(draft || null);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="absolute inset-0 w-full bg-surface-base px-2 py-1 font-ui text-sm text-text-primary ring-2 ring-inset ring-accent-primary focus:outline-none"
      />
    );
  }

  const display = value
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div
      onClick={onStartEdit}
      className={cn(
        "flex h-full w-full cursor-pointer items-center px-2 font-ui text-sm",
        isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
        value ? "text-text-primary" : "text-text-disabled",
      )}
    >
      {display}
    </div>
  );
}
