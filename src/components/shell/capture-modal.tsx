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
import { CaptureReviewModal, type ParsedCaptureFields } from "@/components/tasks/capture-review-modal";

export function CaptureModal(): React.ReactElement {
  const router = useRouter();
  const captureModalOpen = useShellStore((s) => s.captureModalOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const [text, setText] = React.useState("");
  const [pendingRawText, setPendingRawText] = React.useState("");
  const [reviewFields, setReviewFields] = React.useState<ParsedCaptureFields | null>(null);
  const saveAndNewRef = React.useRef(false);
  const utils = trpc.useUtils();

  const { data: userData } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const capturePrefs = React.useMemo(() => {
    const rawPrefs = (userData as { tasks_prefs?: unknown } | undefined)?.tasks_prefs;
    const prefs = (rawPrefs !== null && typeof rawPrefs === "object" ? rawPrefs : {}) as Record<string, unknown>;
    const cp = (prefs.capture_prefs !== null && typeof prefs.capture_prefs === "object"
      ? prefs.capture_prefs
      : {}) as Record<string, unknown>;
    return {
      parseReviewModal: (cp.parse_review_modal as string | undefined) ?? "never",
    };
  }, [userData]);

  const confidenceThreshold = userData?.ai_confidence_threshold ?? 0.7;

  const preview = trpc.capture.preview.useMutation();

  const parseAndCreate = trpc.capture.parseAndCreate.useMutation({
    onSuccess: (data) => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      const message = data.basic_parse ? "Captured (basic parse)" : "Captured to Inbox";
      toast.success(message, {
        action: { label: "View", onClick: () => router.push("/tasks/inbox") },
      });
      if (saveAndNewRef.current) {
        saveAndNewRef.current = false;
        setText("");
        setReviewFields(null);
      } else {
        close();
      }
    },
    onError: (err) => {
      toast.error(err.message ?? "Capture failed");
    },
  });

  const commitReview = trpc.capture.commitReview.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      toast.success("Captured to Inbox", {
        action: { label: "View", onClick: () => router.push("/tasks/inbox") },
      });
      if (saveAndNewRef.current) {
        saveAndNewRef.current = false;
        setText("");
        setReviewFields(null);
      } else {
        close();
      }
    },
    onError: (err) => {
      toast.error(err.message ?? "Capture failed");
    },
  });

  const close = React.useCallback(() => {
    saveAndNewRef.current = false;
    setText("");
    setReviewFields(null);
    setCaptureModalOpen(false);
  }, [setCaptureModalOpen]);

  async function handleSubmit() {
    const value = text.trim();
    if (!value) return;

    const reviewMode = capturePrefs.parseReviewModal;

    if (reviewMode === "always" || reviewMode === "when_uncertain") {
      let parsed: Awaited<ReturnType<typeof preview.mutateAsync>> | null = null;
      try {
        parsed = await preview.mutateAsync({ raw_text: value });
      } catch (err) {
        toast.error("Preview failed — capturing without review");
      }
      if (parsed) {
        const shouldReview =
          reviewMode === "always" ||
          (reviewMode === "when_uncertain" && parsed.local_confidence < confidenceThreshold);

        if (shouldReview) {
          setPendingRawText(value);
          setReviewFields({
            title: parsed.title ?? value,
            notes: parsed.notes ?? null,
            due_date: parsed.due_date ?? null,
            defer_date: parsed.defer_date ?? null,
            project_hint: parsed.project_hint ?? null,
            tags: parsed.tags ?? [],
            contexts: parsed.contexts ?? [],
            flagged: parsed.flagged ?? false,
            parse_tier: (parsed.parse_tier as "local_only" | "local_plus_ai" | "fallback_only") ?? "local_only",
            local_confidence: parsed.local_confidence ?? 0,
          });
          return;
        }
      }
    }

    parseAndCreate.mutate({ raw_text: value, source: "modal" });
  }

  function submitReview(fields: ParsedCaptureFields, andNew: boolean) {
    saveAndNewRef.current = andNew;
    commitReview.mutate({
      raw_text: pendingRawText || undefined,
      title: fields.title,
      notes: fields.notes,
      due_date: fields.due_date,
      defer_date: fields.defer_date,
      project_hint: fields.project_hint,
      tags: fields.tags,
      contexts: fields.contexts,
      flagged: fields.flagged,
      overridden_fields: fields.overridden_fields,
      parse_tier: fields.parse_tier,
      local_confidence: fields.local_confidence,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  const isPending = parseAndCreate.isPending || preview.isPending || commitReview.isPending;

  return (
    <>
      <Dialog open={captureModalOpen && !reviewFields} onOpenChange={setCaptureModalOpen}>
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
              disabled={!text.trim() || isPending}
              className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
            >
              {isPending ? "Capturing…" : "Capture"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reviewFields && (
        <CaptureReviewModal
          open={true}
          parsed={reviewFields}
          onSave={(fields) => submitReview(fields, false)}
          onSaveAndNew={(fields) => submitReview(fields, true)}
          onCancel={close}
          confidenceThreshold={confidenceThreshold}
          submitting={commitReview.isPending}
        />
      )}
    </>
  );
}
