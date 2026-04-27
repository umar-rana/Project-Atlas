"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const COLORS = ["blue", "green", "amber", "red", "purple", "teal", "pink", "orange"];

export function ProjectAddForm({ onDone }: { onDone?: () => void }): React.ReactElement {
  const [title, setTitle] = React.useState("");
  const [color, setColor] = React.useState<string>("blue");
  const [sequential, setSequential] = React.useState(false);
  const utils = trpc.useUtils();
  const create = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Project created");
      onDone?.();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create.mutate({ title: t, color, sequential, status: "active" });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Project title"
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
