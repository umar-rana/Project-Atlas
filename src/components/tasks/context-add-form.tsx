"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";

export function ContextAddForm({ onDone }: { onDone?: () => void }): React.ReactElement {
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("");
  const utils = trpc.useUtils();
  const create = trpc.contexts.create.useMutation({
    onSuccess: () => {
      utils.contexts.list.invalidate();
      toast.success("Context created");
      onDone?.();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim();
    if (!t) return;
    create.mutate({ name: t, icon: icon.trim() || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Context name (e.g. Home)"
        className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
      />
      <input
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        placeholder="Icon (emoji or short tag, optional)"
        className="rounded-sm border border-border-default bg-surface-base px-2 py-1 font-ui text-2xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-border-focus"
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
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
