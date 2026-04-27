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
import { parseQuickAdd } from "@/lib/tasks/parse-quick-add";

export function CaptureModal(): React.ReactElement {
  const router = useRouter();
  const captureModalOpen = useShellStore((s) => s.captureModalOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const [text, setText] = React.useState("");
  const utils = trpc.useUtils();

  const tagsList = trpc.tags.list.useQuery({ limit: 500 }, { enabled: captureModalOpen });
  const contextsList = trpc.contexts.list.useQuery(undefined, { enabled: captureModalOpen });
  const tagCreate = trpc.tags.create.useMutation();
  const contextCreate = trpc.contexts.create.useMutation();
  const taskCreate = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.tags.list.invalidate();
      utils.contexts.list.invalidate();
    },
  });

  const close = React.useCallback(() => {
    setText("");
    setCaptureModalOpen(false);
  }, [setCaptureModalOpen]);

  async function handleSubmit() {
    const value = text.trim();
    if (!value) return;

    const parsed = parseQuickAdd(value);
    if (!parsed.title) {
      toast.error("Capture needs a title");
      return;
    }

    // Resolve tags & contexts (create as needed).
    const knownTags = tagsList.data ?? [];
    const knownContexts = contextsList.data ?? [];
    const tagIds: string[] = [];
    const contextIds: string[] = [];

    try {
      for (const t of parsed.tags) {
        const existing = knownTags.find((x) => x.name === t);
        if (existing) tagIds.push(existing.id);
        else {
          const created = await tagCreate.mutateAsync({ name: t });
          tagIds.push(created.id);
        }
      }
      for (const c of parsed.contexts) {
        const existing = knownContexts.find((x) => x.name.toLowerCase() === c.toLowerCase());
        if (existing) {
          contextIds.push(existing.id);
          continue;
        }
        try {
          const created = await contextCreate.mutateAsync({ name: c });
          contextIds.push(created.id);
        } catch (err) {
          // Race: another tab/request created the same context first.
          // Re-fetch and reuse it instead of failing the capture.
          const code =
            err && typeof err === "object" && "data" in err
              ? (err as { data?: { code?: string } }).data?.code
              : undefined;
          if (code === "CONFLICT") {
            const refreshed = await utils.contexts.list.fetch();
            const found = refreshed.find((x) => x.name.toLowerCase() === c.toLowerCase());
            if (found) {
              contextIds.push(found.id);
              continue;
            }
          }
          throw err;
        }
      }

      // Preserve the original capture text as notes so the server-side
      // reference resolver can pick up @person and [[entity]] mentions
      // alongside the explicit tag/context ids parsed client-side.
      const hasReferenceTokens = /(^|\s)(@\w|\[\[)/.test(value);
      await taskCreate.mutateAsync({
        title: parsed.title,
        notes: hasReferenceTokens ? value : undefined,
        project_title: parsed.project_title,
        due_date: parsed.due_date ?? null,
        tag_ids: tagIds,
        context_ids: contextIds,
      });

      toast.success("Captured to Inbox", {
        action: {
          label: "View",
          onClick: () => router.push("/tasks/inbox"),
        },
      });
      close();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Capture failed";
      toast.error(msg);
    }
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
            onClick={handleSubmit}
            disabled={!text.trim() || taskCreate.isPending}
            className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {taskCreate.isPending ? "Capturing…" : "Capture"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
