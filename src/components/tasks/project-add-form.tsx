"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { displayType } from "@/core/projects/type-suggestions";
import { getSuggestedTypes } from "@/core/projects/type-suggestions";
import { CustomTypeDialog } from "@/components/projects/custom-type-dialog";

const COLORS = ["blue", "green", "amber", "red", "purple", "teal", "pink", "orange"];

const CORE_TYPES = ["project", "goal"];

export function ProjectAddForm({
  onDone,
  defaultType = "project",
}: {
  onDone?: () => void;
  defaultType?: string;
}): React.ReactElement {
  const [title, setTitle] = React.useState("");
  const [color, setColor] = React.useState<string>("blue");
  const [sequential, setSequential] = React.useState(false);
  const [type, setType] = React.useState<string>(defaultType);
  const [showCustom, setShowCustom] = React.useState(false);
  const utils = trpc.useUtils();

  const typesQuery = trpc.projects.distinctTypes.useQuery(undefined, { staleTime: 30_000 });
  const existingTypes = (typesQuery.data ?? []).map((t) => t.type);
  const suggestions = getSuggestedTypes(typesQuery.data ?? []);

  const create = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.projects.distinctTypes.invalidate();
      toast.success(`${displayType(type)} created`);
      onDone?.();
    },
  });

  React.useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create.mutate({ title: t, color, sequential, status: "active", type });
  }

  const allTypeOptions = [...CORE_TYPES, ...suggestions.filter((s) => !CORE_TYPES.includes(s))];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="relative mb-0.5 flex flex-wrap items-center gap-1">
        {allTypeOptions.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs transition-colors",
              type === t
                ? "bg-accent-primary-subtle font-medium text-accent-primary"
                : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary",
            )}
          >
            {displayType(t)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs text-text-disabled transition-colors hover:bg-surface-hover hover:text-text-tertiary"
        >
          Custom…
        </button>
        {showCustom && (
          <CustomTypeDialog
            existingTypes={existingTypes}
            onConfirm={(t) => {
              setType(t);
              setShowCustom(false);
            }}
            onCancel={() => setShowCustom(false)}
          />
        )}
      </div>

      {type && !allTypeOptions.includes(type) && (
        <div className="flex items-center gap-1">
          <span className="font-ui text-2xs text-text-tertiary">Type:</span>
          <span className="rounded-sm bg-accent-primary-subtle px-1.5 py-0.5 font-ui text-2xs font-medium text-accent-primary">
            {displayType(type)}
          </span>
        </div>
      )}

      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`${displayType(type)} title`}
        className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
      />
      <div className="flex flex-wrap gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => setColor(c)}
            className={cn(
              "size-4 rounded-full border-2 transition",
              color === c ? "border-text-primary" : "border-transparent",
            )}
            style={{ backgroundColor: c === "amber" ? "#d97706" : c }}
          />
        ))}
      </div>
      <label className="flex items-center gap-1.5 font-ui text-2xs text-text-secondary">
        <input
          type="checkbox"
          checked={sequential}
          onChange={(e) => setSequential(e.target.checked)}
          className="size-3"
        />
        Sequential
      </label>
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={!title.trim() || create.isPending}
          className="flex-1 rounded-sm bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => onDone?.()}
          className="rounded-sm border border-border-default px-2 py-1 font-ui text-2xs text-text-secondary hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
