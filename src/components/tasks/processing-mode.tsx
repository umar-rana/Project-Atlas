"use client";

import * as React from "react";
import { X, Undo2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useShellStore } from "@/lib/shell/store";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ProcessingModeCard } from "./processing-mode-card";
import { DispositionTaskForm } from "./disposition-task-form";
import { DispositionNoteForm } from "./disposition-note-form";
import { DispositionProjectForm } from "./disposition-project-form";
import { DispositionSomedayForm } from "./disposition-someday-form";
import { DispositionWaitingForForm } from "./disposition-waiting-for-form";
import { DispositionTwoMinForm } from "./disposition-two-min-form";
import { DispositionTrashForm } from "./disposition-trash-form";

type Disposition = "task" | "note" | "project" | "someday" | "waiting" | "two_min" | "trash" | null;

interface InboxCapture {
  id: string;
  raw_text: string;
  title: string | null;
  tags: string[];
  state: string;
  migration_source: string | null;
  ai_parsed: boolean;
  parser_proposal: unknown;
  due_date: Date | string | null;
  created_at: Date | string;
}

interface ParserProposal {
  title?: string;
  due_date?: string | null;
  defer_date?: string | null;
  project_hint?: string | null;
  tags?: string[];
  contexts?: string[];
  person_refs?: string[];
  flagged?: boolean;
  estimated_minutes?: number | null;
  parse_tier?: string;
  local_confidence?: number;
}

function deriveProposedDisposition(p: ParserProposal): Disposition | null {
  if (p.project_hint) return "project";
  if (p.person_refs && p.person_refs.length > 0) return "waiting";
  const lowerTags = (p.tags ?? []).map((t) => t.toLowerCase());
  if (lowerTags.some((t) => t === "someday" || t === "maybe")) return "someday";
  if (p.title || p.due_date || p.flagged) return "task";
  return null;
}

let savedCaptureId: string | null = null;

const DISPOSITION_LABELS: Record<NonNullable<Disposition>, string> = {
  task: "Task",
  note: "Note",
  project: "Project",
  someday: "Someday/Maybe",
  waiting: "Waiting For",
  two_min: "2-Minute Done",
  trash: "Trash",
};

const KEY_MAP: Record<string, Disposition> = {
  t: "task",
  n: "note",
  p: "project",
  d: "someday",
  w: "waiting",
  "1": "two_min",
  x: "trash",
};

function ProcessingModeInner({
  captures,
  onClose,
}: {
  captures: InboxCapture[];
  onClose: () => void;
}): React.ReactElement {
  const utils = trpc.useUtils();
  const { data: rawUser } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const tasksPrefs =
    typeof (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs === "object" &&
    (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs !== null
      ? ((rawUser as { tasks_prefs?: unknown } | undefined)!.tasks_prefs as Record<string, unknown>)
      : {};
  const twoMinuteReminderEnabled =
    (tasksPrefs.gtd_two_minute_reminder as boolean | undefined) ?? true;

  const [currentCaptureId, setCurrentCaptureId] = React.useState<string | null>(() => {
    if (savedCaptureId && captures.some((c) => c.id === savedCaptureId)) {
      return savedCaptureId;
    }
    return captures[0]?.id ?? null;
  });

  const [disposition, setDisposition] = React.useState<Disposition>(null);
  const [isAiSuggested, setIsAiSuggested] = React.useState(false);
  const [lastProcessedId, setLastProcessedId] = React.useState<string | null>(null);
  const [canUndo, setCanUndo] = React.useState(false);

  React.useEffect(() => {
    savedCaptureId = currentCaptureId;
  }, [currentCaptureId]);

  const undoMut = trpc.capture.undoLastProcessing.useMutation({
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.counts.invalidate();
      setCanUndo(false);
      if (lastProcessedId) {
        setCurrentCaptureId(lastProcessedId);
      }
      setLastProcessedId(null);
      toast.success("Undone — capture returned to inbox");
    },
    onError: (err) => toast.error(err.message),
  });

  const currentCapture = captures.find((c) => c.id === currentCaptureId) ?? captures[0] ?? null;
  const proposal = currentCapture?.parser_proposal as ParserProposal | null | undefined;

  React.useEffect(() => {
    if (!proposal) {
      setDisposition(null);
      setIsAiSuggested(false);
      return;
    }
    const suggested = deriveProposedDisposition(proposal);
    if (suggested) {
      setDisposition(suggested);
      setIsAiSuggested(true);
    } else {
      setDisposition(null);
      setIsAiSuggested(false);
    }
  }, [currentCaptureId, proposal]);

  function advance() {
    setDisposition(null);
    setIsAiSuggested(false);
    const currentIndex = captures.findIndex((c) => c.id === currentCaptureId);
    const nextCapture = captures[currentIndex + 1] ?? null;
    if (nextCapture) {
      setCurrentCaptureId(nextCapture.id);
    } else {
      onClose();
    }
  }

  function handleDispositionConfirm() {
    const id = currentCapture?.id ?? null;
    setLastProcessedId(id);
    setCanUndo(true);
    advance();
  }

  function handleCancel() {
    setDisposition(null);
    setIsAiSuggested(false);
  }

  function handleManualDisposition(disp: Disposition) {
    setDisposition(disp);
    setIsAiSuggested(false);
  }

  function handleUndo() {
    if (!lastProcessedId) return;
    undoMut.mutate({ capture_id: lastProcessedId });
  }

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      if (target.tagName === "SELECT" || target.tagName === "BUTTON") return;

      if (e.key === "Escape") {
        if (disposition) {
          e.preventDefault();
          setDisposition(null);
          setIsAiSuggested(false);
        } else {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (disposition) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (canUndo && lastProcessedId) handleUndo();
        return;
      }

      if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        const idx = captures.findIndex((c) => c.id === currentCaptureId);
        const next = captures[idx + 1];
        if (next) setCurrentCaptureId(next.id);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        const idx = captures.findIndex((c) => c.id === currentCaptureId);
        const prev = captures[idx - 1];
        if (prev) setCurrentCaptureId(prev.id);
        return;
      }

      const disp = KEY_MAP[e.key.toLowerCase()];
      if (disp) {
        e.preventDefault();
        handleManualDisposition(disp);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [disposition, captures, canUndo, lastProcessedId, currentCaptureId, onClose]);

  const currentIndex = captures.findIndex((c) => c.id === currentCapture?.id);

  if (!currentCapture) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="font-ui text-lg font-medium text-text-primary">Inbox zero!</p>
        <p className="font-ui text-sm text-text-secondary">All captures have been processed.</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-ui text-base font-semibold text-text-primary">Process Inbox</h2>
          {canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1 font-ui text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              title="⌘Z"
            >
              <Undo2 size={12} aria-hidden />
              Undo
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          aria-label="Close processing mode"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
          <ProcessingModeCard
            capture={{
              ...currentCapture,
              created_at: String(currentCapture.created_at),
            }}
            queuePosition={currentIndex + 1}
            queueTotal={captures.length}
          />

          {disposition ? (
            <div
              className={cn(
                "rounded-lg border bg-surface-overlay px-6 py-5",
                isAiSuggested ? "border-accent-info/40" : "border-border-default",
              )}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-ui text-sm font-semibold text-text-primary">
                    {DISPOSITION_LABELS[disposition]}
                  </h3>
                  {isAiSuggested && (
                    <span className="border-accent-info/40 bg-accent-info/10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-ui text-2xs font-medium text-accent-info">
                      <Sparkles size={9} aria-hidden />
                      AI suggestion
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              {disposition === "task" && (
                <DispositionTaskForm
                  captureId={currentCapture.id}
                  proposal={proposal}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
              {disposition === "note" && (
                <DispositionNoteForm
                  captureId={currentCapture.id}
                  rawText={currentCapture.raw_text}
                  proposal={proposal}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
              {disposition === "project" && (
                <DispositionProjectForm
                  captureId={currentCapture.id}
                  rawText={currentCapture.raw_text}
                  proposal={proposal}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
              {disposition === "someday" && (
                <DispositionSomedayForm
                  captureId={currentCapture.id}
                  proposal={proposal}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
              {disposition === "waiting" && (
                <DispositionWaitingForForm
                  captureId={currentCapture.id}
                  proposal={proposal}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
              {disposition === "two_min" && (
                <DispositionTwoMinForm
                  captureId={currentCapture.id}
                  rawText={currentCapture.raw_text}
                  proposal={proposal}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
              {disposition === "trash" && (
                <DispositionTrashForm
                  captureId={currentCapture.id}
                  title={currentCapture.title ?? currentCapture.raw_text.slice(0, 120)}
                  onConfirm={handleDispositionConfirm}
                  onCancel={handleCancel}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {twoMinuteReminderEnabled &&
                (currentCapture.raw_text.length < 150 ||
                  /^(call|email|send|text|ask|buy|check|reply|remind|schedule|book|pay|confirm|tell)\b/i.test(
                    currentCapture.raw_text.trim(),
                  )) && (
                  <p className="border-accent-success/30 bg-accent-success/8 rounded-md border px-3 py-1.5 font-ui text-xs text-accent-success">
                    2-minute rule: if this takes less than 2 minutes, do it now — then mark it done.
                  </p>
                )}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "T", disp: "task" as Disposition, label: "Task" },
                    { key: "N", disp: "note" as Disposition, label: "Note" },
                    { key: "P", disp: "project" as Disposition, label: "Project" },
                    { key: "D", disp: "someday" as Disposition, label: "Someday/Maybe" },
                    { key: "W", disp: "waiting" as Disposition, label: "Waiting For" },
                    { key: "1", disp: "two_min" as Disposition, label: "2-Min Done" },
                    { key: "X", disp: "trash" as Disposition, label: "Trash" },
                  ] as const
                ).map(({ key, disp, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleManualDisposition(disp)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 font-ui text-sm transition-colors hover:bg-surface-hover",
                      disp === "trash"
                        ? "border-accent-danger/30 hover:bg-accent-danger/8 text-accent-danger"
                        : disp === "two_min"
                          ? "border-accent-success/30 hover:bg-accent-success/8 text-accent-success"
                          : "border-border-default text-text-primary",
                    )}
                  >
                    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-surface-raised px-1 font-mono text-xs font-bold text-text-secondary">
                      {key}
                    </kbd>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProcessingMode(): React.ReactElement | null {
  const open = useShellStore((s) => s.processingModeOpen);
  const setOpen = useShellStore((s) => s.setProcessingModeOpen);

  const inboxQuery = trpc.capture.listInbox.useQuery(
    { limit: 200 },
    { enabled: open, staleTime: 0 },
  );

  if (!open) return null;

  const captures = (inboxQuery.data ?? []) as unknown as InboxCapture[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Process Inbox"
    >
      <div className="relative mx-auto my-8 flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-base shadow-2xl">
        {inboxQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="font-ui text-sm text-text-tertiary">Loading captures…</div>
          </div>
        ) : (
          <ProcessingModeInner captures={captures} onClose={() => setOpen(false)} />
        )}
      </div>
    </div>
  );
}
