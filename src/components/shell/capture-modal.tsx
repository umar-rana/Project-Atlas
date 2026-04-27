"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useShellStore } from "@/lib/shell/store";
import { trpc } from "@/lib/trpc/client";

export function CaptureModal(): React.ReactElement {
  const router = useRouter();
  const captureModalOpen = useShellStore((s) => s.captureModalOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const [text, setText] = React.useState("");
  const utils = trpc.useUtils();

  const parseAndCreate = trpc.capture.parseAndCreate.useMutation({
    onSuccess: (data) => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();

      const message = data.basic_parse ? "Captured (basic parse)" : "Captured to Inbox";
      toast.success(message, {
        action: {
          label: "View",
          onClick: () => router.push("/tasks/inbox"),
        },
      });
      close();
    },
    onError: (err) => {
      toast.error(err.message ?? "Capture failed");
    },
  });

  const close = React.useCallback(() => {
    setText("");
    setCaptureModalOpen(false);
  }, [setCaptureModalOpen]);

  async function handleSubmit() {
    const value = text.trim();
    if (!value) return;

    parseAndCreate.mutate({
      raw_text: value,
      source: "modal",
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
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
            placeholder="What's on your mind? Use #tag, ~~context, >>project, @person, today/tomorrow…"
            rows={5}
            className="w-full resize-none rounded-md border border-border-default bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Press ⌘⏎ to capture · #tag · ~~context · &gt;&gt;project · @person · today / tomorrow / next monday
          </p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!text.trim() || parseAndCreate.isPending}
            className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {parseAndCreate.isPending ? "Capturing…" : "Capture"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
