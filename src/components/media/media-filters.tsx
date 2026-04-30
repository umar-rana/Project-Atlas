"use client";

import * as React from "react";
import { X } from "lucide-react";

export type FileType = "image" | "pdf" | "video" | "audio" | "doc" | "other";
export type SourceFilter = "tasks" | "orphaned";

export interface MediaFiltersState {
  file_type?: FileType;
  source?: SourceFilter;
  reviewed?: boolean;
  tag_id?: string;
  search: string;
  date_from?: string;
  date_to?: string;
}

interface MediaFiltersProps {
  filters: MediaFiltersState;
  onChange: (filters: MediaFiltersState) => void;
  tags: { id: string; name: string }[];
}

const FILE_TYPES: { value: FileType; label: string }[] = [
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "doc", label: "Documents" },
  { value: "other", label: "Other" },
];

const SELECT_CLASS = "rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-border-focus";

export function MediaFilters({ filters, onChange, tags }: MediaFiltersProps) {
  const hasActiveFilters =
    filters.file_type || filters.source || filters.reviewed !== undefined ||
    filters.tag_id || filters.search || filters.date_from || filters.date_to;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search attachments…"
        className="w-44 rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
      />

      <select
        value={filters.file_type ?? ""}
        onChange={(e) => onChange({ ...filters, file_type: (e.target.value as FileType) || undefined })}
        className={SELECT_CLASS}
      >
        <option value="">All types</option>
        {FILE_TYPES.map((ft) => (
          <option key={ft.value} value={ft.value}>{ft.label}</option>
        ))}
      </select>

      <select
        value={filters.source ?? ""}
        onChange={(e) => onChange({ ...filters, source: (e.target.value as SourceFilter) || undefined })}
        className={SELECT_CLASS}
      >
        <option value="">All sources</option>
        <option value="tasks">Tasks</option>
        <option value="orphaned">Orphaned</option>
      </select>

      <select
        value={filters.reviewed === undefined ? "" : filters.reviewed ? "yes" : "no"}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...filters, reviewed: v === "" ? undefined : v === "yes" });
        }}
        className={SELECT_CLASS}
      >
        <option value="">Any status</option>
        <option value="yes">Reviewed</option>
        <option value="no">Unreviewed</option>
      </select>

      {tags.length > 0 && (
        <select
          value={filters.tag_id ?? ""}
          onChange={(e) => onChange({ ...filters, tag_id: e.target.value || undefined })}
          className={SELECT_CLASS}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>#{t.name}</option>
          ))}
        </select>
      )}

      <input
        type="date"
        value={filters.date_from ?? ""}
        onChange={(e) => onChange({ ...filters, date_from: e.target.value || undefined })}
        className={SELECT_CLASS}
        title="From date"
      />
      <input
        type="date"
        value={filters.date_to ?? ""}
        onChange={(e) => onChange({ ...filters, date_to: e.target.value || undefined })}
        className={SELECT_CLASS}
        title="To date"
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange({ search: "" })}
          className="flex items-center gap-1 rounded-sm border border-border-default px-2 py-1 font-ui text-xs text-text-secondary hover:bg-surface-hover"
        >
          <X size={10} />
          Reset
        </button>
      )}
    </div>
  );
}
