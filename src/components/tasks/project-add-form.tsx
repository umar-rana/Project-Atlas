"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { ProjectType } from "@/components/projects/project-type-selector";
import { PROJECT_TYPE_LABELS, PROJECT_TYPE_ICONS } from "@/components/projects/project-type-selector";

const COLORS = ["blue", "green", "amber", "red", "purple", "teal", "pink", "orange"];

export function ProjectAddForm({
  onDone,
  defaultType = "project",
}: {
  onDone?: () => void;
  defaultType?: ProjectType;
}): React.ReactElement {
  const [title, setTitle] = React.useState("");
  const [color, setColor] = React.useState<string>("blue");
  const [sequential, setSequential] = React.useState(false);
  const [type, setType] = React.useState<ProjectType>(defaultType);
  const utils = trpc.useUtils();
  const create = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success(`${PROJECT_TYPE_LABELS[type]} created`);
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex items-center gap-1 mb-0.5">
        {(["project", "goal", "habit"] as ProjectType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-ui text-2xs transition-colors",
              type === t
                ? "bg-accent-primary-subtle text-accent-primary font-medium"
                : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary",
            )}
          >
            <span>{PROJECT_TYPE_ICONS[t]}</span>
            {PROJECT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`${PROJECT_TYPE_LABELS[type]} title`}
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
            /* WCAG exemption: decorative colour-swatch only — WCAG 1.4.11 applies, not 1.4.3. */
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
