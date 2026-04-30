"use client";

import * as React from "react";

export type SortOption = "newest" | "oldest" | "largest" | "smallest" | "name_asc" | "name_desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest", label: "Largest first" },
  { value: "smallest", label: "Smallest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
];

interface MediaSortProps {
  value: SortOption;
  onChange: (sort: SortOption) => void;
}

export function MediaSort({ value, onChange }: MediaSortProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortOption)}
      className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus"
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
