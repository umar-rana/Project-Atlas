"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TextCellProps {
  value: string | null;
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string | null) => void;
  onCancel: () => void;
}

export function TextCell({ value, isSelected, isEditing, onStartEdit, onCommit, onCancel }: TextCellProps) {
  const [draft, setDraft] = React.useState(value ?? "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      setDraft(value ?? "");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onCommit(draft || null); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        className="absolute inset-0 w-full bg-surface-base px-2 py-1 font-ui text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
      />
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className={cn(
        "flex h-full w-full cursor-pointer items-center px-2 font-ui text-sm",
        isSelected ? "ring-1 ring-inset ring-accent-primary" : "",
        value ? "text-text-primary" : "text-text-disabled",
      )}
    >
      <span className="truncate">{value ?? ""}</span>
    </div>
  );
}
