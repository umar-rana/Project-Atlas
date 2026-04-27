"use client";

import * as React from "react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useShellStore } from "@/lib/shell/store";

export function CaptureModal(): React.ReactElement {
  const captureModalOpen = useShellStore((s) => s.captureModalOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const [text, setText] = React.useState("");

  function handleSubmit() {
    if (!text.trim()) return;
    toast.success("Captured to inbox (will be processed in Wave 3)");
    setText("");
    setCaptureModalOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Dialog open={captureModalOpen} onOpenChange={setCaptureModalOpen}>
      <DialogContent size="md" hideClose>
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind? Jot anything — tasks, ideas, links…"
            rows={5}
            className="w-full resize-none rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Press ⌘⏎ to capture
          </p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => { setText(""); setCaptureModalOpen(false); }}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            Capture
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
