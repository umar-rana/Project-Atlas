"use client";

import * as React from "react";
import { validateProjectType, normalizeProjectType } from "@/core/projects/type-validation";

export function CustomTypeDialog({
  existingTypes,
  onConfirm,
  onCancel,
}: {
  existingTypes: string[];
  onConfirm: (type: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { valid, error: err } = validateProjectType(value);
    if (!valid) {
      setError(err ?? "Invalid type");
      return;
    }
    const normalized = normalizeProjectType(value);
    const existing = existingTypes.find((t) => t.toLowerCase() === normalized);
    onConfirm(existing ?? normalized);
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-border-default bg-surface-overlay p-3 shadow-3">
      <p className="mb-2 font-ui text-2xs font-medium text-text-secondary">Custom type</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div>
          <input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            placeholder="e.g. Travel, Finance, Side project"
            className="w-full rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-border-focus"
            maxLength={32}
          />
          {error ? (
            <p className="mt-1 font-ui text-2xs text-accent-danger">{error}</p>
          ) : (
            <p className="mt-1 font-ui text-2xs text-text-disabled">
              Letters, numbers, spaces, hyphens · max 32 chars
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 rounded-sm bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border-default px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
