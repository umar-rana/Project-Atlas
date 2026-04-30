"use client";

import * as React from "react";
import { Tag, CheckSquare, Trash2, Unlink, Vault } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/tooltip";

interface MediaBulkBarProps {
  selectedIds: string[];
  onClear: () => void;
  onComplete?: () => void;
}

export function MediaBulkBar({ selectedIds, onClear, onComplete }: MediaBulkBarProps) {
  const utils = trpc.useUtils();

  const bulkDelete = trpc.attachments.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} attachment${data.deleted === 1 ? "" : "s"}`);
      utils.media.list.invalidate();
      utils.media.stats.invalidate();
      onClear();
      onComplete?.();
    },
    onError: () => toast.error("Failed to delete attachments"),
  });

  const bulkDetach = trpc.attachments.bulkDetach.useMutation({
    onSuccess: (data) => {
      toast.success(`Detached ${data.detached} attachment${data.detached === 1 ? "" : "s"}`);
      utils.media.list.invalidate();
      onClear();
    },
    onError: () => toast.error("Failed to detach attachments"),
  });

  const bulkMarkReviewed = trpc.attachments.bulkMarkReviewed.useMutation({
    onSuccess: (data) => {
      toast.success(`Marked ${data.updated} as reviewed`);
      utils.media.list.invalidate();
      onClear();
    },
    onError: () => toast.error("Failed to update attachments"),
  });

  const count = selectedIds.length;
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-overlay px-3 py-2 shadow-md">
      <span className="font-ui text-xs font-medium text-text-primary">
        {count} selected
      </span>
      <div className="h-4 w-px bg-border-subtle" />

      <button
        type="button"
        onClick={() => bulkMarkReviewed.mutate({ ids: selectedIds, reviewed: true })}
        disabled={bulkMarkReviewed.isPending}
        className="flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        <CheckSquare size={12} />
        Mark reviewed
      </button>

      <button
        type="button"
        onClick={() => bulkDetach.mutate({ ids: selectedIds })}
        disabled={bulkDetach.isPending}
        className="flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
      >
        <Unlink size={12} />
        Detach
      </button>

      <Tooltip content="Vault coming soon" side="top">
        <button
          type="button"
          disabled
          className="flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-xs text-text-disabled cursor-not-allowed opacity-50"
        >
          <Vault size={12} />
          Promote to Vault
        </button>
      </Tooltip>

      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete ${count} attachment${count === 1 ? "" : "s"} permanently?`)) {
            bulkDelete.mutate({ ids: selectedIds });
          }
        }}
        disabled={bulkDelete.isPending}
        className="flex items-center gap-1.5 rounded-sm px-2 py-1 font-ui text-xs text-accent-danger hover:bg-accent-danger/10 disabled:opacity-50"
      >
        <Trash2 size={12} />
        Delete
      </button>

      <div className="h-4 w-px bg-border-subtle" />
      <button
        type="button"
        onClick={onClear}
        className="font-ui text-xs text-text-tertiary hover:text-text-secondary"
      >
        Cancel
      </button>
    </div>
  );
}
