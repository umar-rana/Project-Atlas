"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface MigrationSummary {
  converted: number;
  kept: number;
  errors: number;
  ranAt: string;
}

interface MigrationSummaryModalProps {
  summary: MigrationSummary;
  onClose: () => void;
}

export function MigrationSummaryModal({
  summary,
  onClose,
}: MigrationSummaryModalProps): React.ReactElement {
  const router = useRouter();
  const { converted, kept } = summary;
  const total = converted + kept;

  function handleReviewCaptures() {
    onClose();
  }

  function handleViewTasks() {
    router.push("/tasks/inbox");
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Inbox organized</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-4 py-3">
          <p className="font-ui text-sm text-text-secondary">
            Your inbox has been updated to use the new GTD capture workflow.
          </p>

          <div className="space-y-2 rounded-lg border border-border-default bg-surface-raised p-3">
            <div className="flex items-center justify-between font-ui text-sm">
              <span className="text-text-secondary">Items converted to captures</span>
              <span className="font-semibold tabular-nums text-accent-success">{converted}</span>
            </div>
            <div className="flex items-center justify-between font-ui text-sm">
              <span className="text-text-secondary">Tasks kept as-is</span>
              <span className="font-semibold tabular-nums text-text-primary">{kept}</span>
            </div>
            {total > 0 && (
              <div className="flex items-center justify-between border-t border-border-subtle pt-2 font-ui text-xs text-text-tertiary">
                <span>Total items</span>
                <span className="tabular-nums">{total}</span>
              </div>
            )}
          </div>

          {converted > 0 && (
            <p className="font-ui text-xs text-text-tertiary">
              Converted items now appear at the top of your inbox as unprocessed captures. Use the
              process button to decide what to do with each one.
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleViewTasks}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
          >
            View tasks in Inbox
          </button>
          <button
            type="button"
            onClick={handleReviewCaptures}
            className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            Review captures
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
