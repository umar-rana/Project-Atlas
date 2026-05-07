"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";

interface SaveSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  onSaved?: () => void;
}

export function SaveSnapshotDialog({
  open,
  onOpenChange,
  noteId,
  onSaved,
}: SaveSnapshotDialogProps): React.ReactElement {
  const [summary, setSummary] = React.useState("");

  const saveSnapshot = trpc.notes.versions.saveSnapshot.useMutation({
    onSuccess() {
      toast.success("Snapshot saved");
      setSummary("");
      onOpenChange(false);
      onSaved?.();
    },
    onError(err) {
      toast.error(err.message ?? "Failed to save snapshot");
    },
  });

  function handleSave() {
    saveSnapshot.mutate({
      noteId,
      changeSummary: summary.trim() || undefined,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Save snapshot</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2 pt-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="snapshot-summary" className="font-ui text-xs text-text-secondary">
              Change summary{" "}
              <span className="text-text-disabled">(optional)</span>
            </Label>
            <Textarea
              id="snapshot-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What changed in this snapshot?"
              rows={3}
              autoGrow
              className="text-xs"
            />
            <p className="font-ui text-2xs text-text-disabled">
              A manual snapshot is always created, regardless of when the last auto-save ran.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saveSnapshot.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={saveSnapshot.isPending}
          >
            {saveSnapshot.isPending ? "Saving…" : "Save snapshot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
