"use client";

import * as React from "react";

const TRUNCATE_CHARS = 150;
const EXPAND_MAX_HEIGHT = 800;

interface WorklogEntryProps {
  id: string;
  body: string;
  durationMinutes: number | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function WorklogEntry({ id, body, durationMinutes, onEdit, onDelete }: WorklogEntryProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const needsTruncation = body.length > TRUNCATE_CHARS;
  const displayBody = needsTruncation && !expanded ? body.slice(0, TRUNCATE_CHARS) + "…" : body;
  const isLong = expanded && body.length > 800;

  return (
    <div className="group relative flex gap-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-text-tertiary">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2h12v2H2zM2 6h8v2H2zM2 10h10v2H2z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="font-ui text-xs text-text-secondary"
          style={isLong ? { maxHeight: EXPAND_MAX_HEIGHT, overflowY: "auto" } : undefined}
        >
          <span className="whitespace-pre-wrap">{displayBody}</span>
          {needsTruncation && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-1 text-accent hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
        {durationMinutes != null && durationMinutes > 0 && (
          <p className="mt-0.5 font-ui text-2xs text-text-tertiary">
            • {formatDuration(durationMinutes)}
          </p>
        )}
        {confirmDelete && (
          <div className="mt-1 flex items-center gap-2 font-ui text-2xs">
            <span className="text-text-secondary">Delete this entry?</span>
            <button
              onClick={() => onDelete(id)}
              className="text-red-500 hover:underline"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-text-tertiary hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="absolute right-0 top-0 hidden items-center gap-1 group-hover:flex">
        <button
          onClick={() => onEdit(id)}
          title="Edit"
          className="rounded p-0.5 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" />
          </svg>
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          title="Delete"
          className="rounded p-0.5 text-text-tertiary hover:bg-bg-hover hover:text-red-400"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4h10M6 4V2h4v2M5 4v9h6V4H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h}h ${m}m`;
}
