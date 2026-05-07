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
import { Paperclip, X as XIcon, LayoutTemplate } from "lucide-react";
import { validateFile } from "@/core/attachments/validators";
import { TemplatePicker } from "@/components/task-templates/template-picker";
import type { TemplateFields } from "@/components/task-templates/template-picker";

interface PendingTemplate {
  id: string;
  fields: TemplateFields;
}

export function CaptureModal(): React.ReactElement {
  const router = useRouter();
  const captureModalOpen = useShellStore((s) => s.captureModalOpen);
  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const [text, setText] = React.useState("");
  const [pendingRawText, setPendingRawText] = React.useState("");
  const [reviewFields, setReviewFields] = React.useState<ParsedCaptureFields | null>(null);
  const [stagedFiles, setStagedFiles] = React.useState<File[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [pendingTemplate, setPendingTemplate] = React.useState<PendingTemplate | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
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

  const instantiateTemplate = trpc.taskTemplates.instantiate.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      void utils.taskTemplates.list.invalidate();
      toast.success("Task created from template", {
        action: { label: "View", onClick: () => router.push("/tasks/inbox") },
      });
      close();
    },
    onError: (err) => toast.error(err.message ?? "Failed to create task from template"),
  });

  async function attachFilesToCapture(captureId: string, files: File[]) {
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("parent_type", "Capture");
      form.append("parent_id", captureId);
      try {
        await fetch("/api/attachments/upload", { method: "POST", body: form });
      } catch { /* ignore */ }
    }
    if (files.length > 0) {
      utils.tasks.list.invalidate();
    }
  }

  const parseAndCreate = trpc.capture.parseAndCreate.useMutation({
    onSuccess: async (data) => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.capture.listInbox.invalidate();
      if (stagedFiles.length > 0 && data.captureId) {
        await attachFilesToCapture(data.captureId, stagedFiles);
      }
      const message = data.basic_parse ? "Captured (basic parse)" : "Captured to Inbox";
      toast.success(message, {
        action: { label: "View", onClick: () => router.push("/tasks/inbox") },
      });
      if (saveAndNewRef.current) {
        saveAndNewRef.current = false;
        setText("");
        setReviewFields(null);
        setStagedFiles([]);
        setPendingTemplate(null);
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
        setPendingTemplate(null);
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
    setStagedFiles([]);
    setIsDragging(false);
    setPendingTemplate(null);
    setCaptureModalOpen(false);
  }, [setCaptureModalOpen]);

  function stageFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const valid: File[] = [];
    for (const file of arr) {
      const result = validateFile(file.name, file.type, file.size);
      if (result.ok === false) {
        toast.error(result.error);
        continue;
      }
      valid.push(file);
    }
    setStagedFiles((prev) => [...prev, ...valid]);
  }

  async function handleSubmit() {
    const value = text.trim();

    if (pendingTemplate) {
      instantiateTemplate.mutate({
        id: pendingTemplate.id,
        overrides: {
          title: value || pendingTemplate.fields.title,
          context_ids: pendingTemplate.fields.context_ids,
          tag_ids: pendingTemplate.fields.tag_ids,
        },
      });
      return;
    }

    if (!value) return;

    const reviewMode = capturePrefs.parseReviewModal;

    if (reviewMode === "always" || reviewMode === "when_uncertain") {
      let parsed: Awaited<ReturnType<typeof preview.mutateAsync>> | null = null;
      try {
        parsed = await preview.mutateAsync({ raw_text: value });
      } catch {
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
    if (e.key === "Escape" && pendingTemplate) {
      setPendingTemplate(null);
      setText("");
    }
  }

  function handleTemplateSelect(fields: TemplateFields, templateId: string) {
    setPendingTemplate({ id: templateId, fields });
    setText(fields.title);
  }

  const isPending = parseAndCreate.isPending || preview.isPending || commitReview.isPending || instantiateTemplate.isPending;
  const canCapture = pendingTemplate ? true : !!text.trim();

  return (
    <>
      <Dialog open={captureModalOpen && !reviewFields} onOpenChange={setCaptureModalOpen}>
        <DialogContent size="md" hideClose>
          <DialogHeader>
            <DialogTitle>Quick capture</DialogTitle>
          </DialogHeader>
          <div
            className="px-4 py-3"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) stageFiles(e.dataTransfer.files); }}
          >
            {pendingTemplate && (
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-accent-primary/30 bg-accent-primary-muted px-2.5 py-1.5">
                <LayoutTemplate size={12} className="text-accent-primary" aria-hidden />
                <span className="font-ui text-xs text-accent-primary">
                  Template: {pendingTemplate.fields.title}
                </span>
                <button
                  type="button"
                  aria-label="Clear template"
                  onClick={() => { setPendingTemplate(null); setText(""); }}
                  className="ml-auto text-accent-primary/60 hover:text-accent-primary"
                >
                  <XIcon size={12} aria-hidden />
                </button>
              </div>
            )}
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingTemplate
                ? "Edit task title or press ⌘⏎ to capture…"
                : "What's on your mind? Use #tag, ~~context, >>project, @person, today/tomorrow…"}
              rows={5}
              className={`w-full resize-none rounded-md border bg-surface-base px-3 py-2 font-ui text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus ${isDragging ? "border-accent-primary" : "border-border-default"}`}
            />
            {!pendingTemplate && (
              <p className="mt-1 font-ui text-xs text-text-tertiary">
                Press ⌘⏎ to capture · #tag · ~~context · &gt;&gt;project · @person · today / tomorrow / next monday
              </p>
            )}

            {stagedFiles.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {stagedFiles.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-sm border border-border-subtle bg-surface-raised px-2 py-1">
                    <span className="truncate font-ui text-xs text-text-secondary">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-text-tertiary hover:text-accent-danger"
                    >
                      <XIcon size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <TemplatePicker
              onSelect={handleTemplateSelect}
              side="top"
              align="start"
            />
            <label className="cursor-pointer rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover">
              <Paperclip size={14} className="inline mr-1" />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => { if (e.target.files) { stageFiles(e.target.files); e.target.value = ""; } }}
              />
              Attach
              {stagedFiles.length > 0 && <span className="ml-1 rounded-full bg-accent-primary px-1.5 text-2xs text-white">{stagedFiles.length}</span>}
            </label>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canCapture || isPending}
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
