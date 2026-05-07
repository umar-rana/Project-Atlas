"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SingleSelectOption, MultiSelectValue } from "@/core/tables/types";

interface MultiSelectCellProps {
  value: MultiSelectValue | null;
  options: SingleSelectOption[];
  isSelected: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: MultiSelectValue | null) => void;
  onCancel: () => void;
  onCreateOption?: (label: string) => SingleSelectOption;
}

const MAX_VISIBLE_CHIPS = 3;

export function MultiSelectCell({
  value,
  options,
  isSelected,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  onCreateOption,
}: MultiSelectCellProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState("");
  const [localSelected, setLocalSelected] = React.useState<string[]>(
    () => (value?.option_ids ?? []),
  );

  const selectedOptions = localSelected
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is SingleSelectOption => Boolean(o));

  const commitAndClose = React.useCallback(() => {
    if (localSelected.length === 0) {
      onCommit(null);
    } else {
      onCommit({ option_ids: localSelected });
    }
  }, [localSelected, onCommit]);

  React.useEffect(() => {
    if (isEditing) {
      setLocalSelected(value?.option_ids ?? []);
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isEditing, value]);

  React.useEffect(() => {
    if (!isEditing) return;

    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        commitAndClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isEditing, commitAndClose, onCancel]);

  function toggleOption(id: string) {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleCreateOption() {
    const label = search.trim();
    if (!label || !onCreateOption) return;
    const newOpt = onCreateOption(label);
    setLocalSelected((prev) => [...prev, newOpt.id]);
    setSearch("");
  }

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const canCreate =
    search.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase()) &&
    Boolean(onCreateOption);

  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-x-0 top-0 z-overlay min-w-[200px] rounded-md border border-border-default bg-surface-raised shadow-3"
      >
        {/* Search input */}
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-1.5">
          <Search size={11} className="shrink-0 text-text-disabled" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search options\u2026"
            className="min-w-0 flex-1 bg-transparent font-ui text-xs text-text-primary placeholder:text-text-disabled focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                handleCreateOption();
              }
            }}
          />
        </div>

        {/* Options list */}
        <div className="max-h-48 overflow-y-auto py-1">
          {filtered.map((opt) => {
            const active = localSelected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleOption(opt.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-sm hover:bg-surface-hover",
                  active ? "text-accent-primary" : "text-text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                    active
                      ? "border-accent-primary bg-accent-primary"
                      : "border-border-default bg-transparent",
                  )}
                >
                  {active && (
                    <svg viewBox="0 0 10 8" fill="none" className="h-2 w-2">
                      <path
                        d="M1 4l3 3 5-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-text-on-accent"
                      />
                    </svg>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {opt.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  <span className="truncate">{opt.label}</span>
                </span>
              </button>
            );
          })}

          {filtered.length === 0 && !canCreate && (
            <p className="px-3 py-2 font-ui text-sm text-text-disabled">No options found</p>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={handleCreateOption}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-sm text-text-secondary hover:bg-surface-hover"
            >
              <Plus size={11} className="shrink-0 text-accent-primary" />
              <span>
                Create{" "}
                <strong className="font-semibold text-text-primary">
                  &ldquo;{search.trim()}&rdquo;
                </strong>
              </span>
            </button>
          )}
        </div>

        {/* Footer — done button */}
        <div className="border-t border-border-subtle px-2 py-1.5">
          <button
            type="button"
            onClick={commitAndClose}
            className="w-full rounded-sm bg-accent-primary-subtle px-2 py-1 font-ui text-xs font-medium text-accent-primary hover:bg-accent-primary-muted"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Display mode
  const visible = selectedOptions.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = selectedOptions.length - MAX_VISIBLE_CHIPS;

  return (
    <div
      onClick={onStartEdit}
      className={cn(
        "flex h-full w-full cursor-pointer items-center gap-1 overflow-hidden px-1.5",
        isSelected ? "bg-accent-primary-subtle ring-1 ring-inset ring-accent-primary" : "",
      )}
    >
      {visible.length > 0 ? (
        <>
          {visible.map((opt) => (
            <span
              key={opt.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-1.5 py-px font-ui text-xs text-text-primary"
            >
              {opt.color && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: opt.color }}
                />
              )}
              <span className="max-w-[80px] truncate">{opt.label}</span>
            </span>
          ))}
          {overflow > 0 && (
            <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-px font-ui text-xs text-text-disabled">
              +{overflow}
            </span>
          )}
        </>
      ) : (
        <span className="font-ui text-sm text-text-disabled" />
      )}
    </div>
  );
}
