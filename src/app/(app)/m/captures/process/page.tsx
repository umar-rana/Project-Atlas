"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X,
  ChevronLeft,
  CheckSquare,
  FileText,
  FolderOpen,
  Clock,
  Users,
  CheckCircle,
  Trash2,
  SkipForward,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Capture {
  id: string;
  raw_text: string;
  title: string | null;
  tags: string[];
  state: string;
  ai_parsed: boolean;
  created_at: Date | string;
}

type Disposition =
  | "task"
  | "note"
  | "project"
  | "someday"
  | "waiting_for"
  | "did_it"
  | "trash";

const DISPOSITIONS: {
  id: Disposition;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    id: "task",
    label: "Task",
    icon: CheckSquare,
    color: "bg-accent-primary/10 text-accent-primary border-accent-primary/20",
  },
  {
    id: "note",
    label: "Note",
    icon: FileText,
    color: "bg-accent-info-muted text-accent-info border-accent-info/20",
  },
  {
    id: "project",
    label: "Project",
    icon: FolderOpen,
    color: "bg-accent-success/10 text-accent-success border-accent-success/20",
  },
  {
    id: "someday",
    label: "Someday",
    icon: Clock,
    color: "bg-surface-raised text-text-secondary border-border-subtle",
  },
  {
    id: "waiting_for",
    label: "Waiting For",
    icon: Users,
    color: "bg-surface-raised text-text-secondary border-border-subtle",
  },
  {
    id: "did_it",
    label: "Did it",
    icon: CheckCircle,
    color: "bg-accent-success/10 text-accent-success border-accent-success/20",
  },
  {
    id: "trash",
    label: "Trash",
    icon: Trash2,
    color: "bg-accent-danger/10 text-accent-danger border-accent-danger/20",
  },
];

interface DispositionSheetProps {
  capture: Capture;
  disposition: Disposition;
  onClose: () => void;
  onDone: (captureId: string) => void;
  onUndo: (captureId: string) => void;
}

function DispositionSheet({ capture, disposition, onClose, onDone, onUndo }: DispositionSheetProps) {
  const [title, setTitle] = React.useState(capture.title ?? capture.raw_text.slice(0, 100));
  const [delegateTo, setDelegateTo] = React.useState("");
  const utils = trpc.useUtils();

  const undoProcessing = trpc.capture.undoLastProcessing.useMutation({
    onSuccess: (_data, variables) => {
      utils.capture.listInbox.invalidate();
      onUndo(variables.capture_id);
      toast.success("Capture restored to inbox");
    },
    onError: () => toast.error("Could not undo — undo window may have expired"),
  });

  const completeTask = trpc.tasks.complete.useMutation();

  function showUndoToast(captureId: string, label: string) {
    toast.success(label, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          undoProcessing.mutate({ capture_id: captureId });
        },
      },
    });
  }

  const processToTask = trpc.capture.processToTask.useMutation({
    onSuccess: (data, vars) => {
      utils.capture.listInbox.invalidate();
      const captureId = vars.capture_id;
      if (disposition === "did_it" && data.taskId) {
        completeTask.mutate(
          { id: data.taskId },
          {
            onSettled: () => {
              showUndoToast(captureId, "Marked as done");
              onDone(captureId);
            },
          },
        );
      } else {
        showUndoToast(captureId, "Saved as task");
        onDone(captureId);
      }
    },
    onError: () => toast.error("Failed to save"),
  });

  const processToNote = trpc.capture.processToNote.useMutation({
    onSuccess: (_, vars) => {
      utils.capture.listInbox.invalidate();
      showUndoToast(vars.capture_id, "Saved as note");
      onDone(vars.capture_id);
    },
    onError: () => toast.error("Failed to save"),
  });

  const processToProject = trpc.capture.processToProject.useMutation({
    onSuccess: (_, vars) => {
      utils.capture.listInbox.invalidate();
      showUndoToast(vars.capture_id, "Saved as project");
      onDone(vars.capture_id);
    },
    onError: () => toast.error("Failed to save"),
  });

  const processToSomeday = trpc.capture.processToSomeday.useMutation({
    onSuccess: (_, vars) => {
      utils.capture.listInbox.invalidate();
      showUndoToast(vars.capture_id, "Moved to Someday");
      onDone(vars.capture_id);
    },
    onError: () => toast.error("Failed to save"),
  });

  const processToWaitingFor = trpc.capture.processToWaitingFor.useMutation({
    onSuccess: (_, vars) => {
      utils.capture.listInbox.invalidate();
      showUndoToast(vars.capture_id, "Moved to Waiting For");
      onDone(vars.capture_id);
    },
    onError: () => toast.error("Failed to save"),
  });

  const processToTrash = trpc.capture.processToTrash.useMutation({
    onSuccess: (_, vars) => {
      utils.capture.listInbox.invalidate();
      showUndoToast(vars.capture_id, "Moved to trash");
      onDone(vars.capture_id);
    },
    onError: () => toast.error("Failed to trash capture"),
  });

  function handleSave() {
    const t = title.trim();
    if (!t && disposition !== "trash") return;

    switch (disposition) {
      case "task":
        processToTask.mutate({ capture_id: capture.id, title: t });
        break;
      case "note":
        processToNote.mutate({ capture_id: capture.id, title: t });
        break;
      case "project":
        processToProject.mutate({
          capture_id: capture.id,
          new_project_name: t,
          target_type: "task",
          title: t,
        });
        break;
      case "someday":
        processToSomeday.mutate({ capture_id: capture.id, title: t });
        break;
      case "waiting_for":
        processToWaitingFor.mutate({
          capture_id: capture.id,
          title: t,
          delegated_to_text: delegateTo.trim() || undefined,
        });
        break;
      case "did_it":
        processToTask.mutate({ capture_id: capture.id, title: t });
        break;
      case "trash":
        processToTrash.mutate({ capture_id: capture.id });
        break;
    }
  }

  const isPending =
    processToTask.isPending ||
    processToNote.isPending ||
    processToProject.isPending ||
    processToSomeday.isPending ||
    processToWaitingFor.isPending ||
    processToTrash.isPending;

  const dispositionInfo = DISPOSITIONS.find((d) => d.id === disposition)!;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full rounded-t-2xl bg-surface-base pb-[env(safe-area-inset-bottom)] shadow-xl">
        <div className="mx-auto mb-3 mt-3 h-1 w-10 rounded-full bg-border-default" aria-hidden />
        <div className="flex items-center justify-between px-4 pb-3">
          <p className="font-ui text-sm font-semibold text-text-primary">{dispositionInfo.label}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-text-tertiary"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-4 pb-4">
          {disposition !== "trash" && (
            <div>
              <label className="mb-1 block font-ui text-xs font-medium text-text-tertiary">
                {disposition === "did_it" ? "What did you do?" : "Title"}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                autoFocus
              />
            </div>
          )}

          {disposition === "waiting_for" && (
            <div>
              <label className="mb-1 block font-ui text-xs font-medium text-text-tertiary">
                Waiting for (optional)
              </label>
              <input
                type="text"
                value={delegateTo}
                onChange={(e) => setDelegateTo(e.target.value)}
                placeholder="Person or team…"
                className="w-full rounded-xl border border-border-subtle bg-surface-raised px-3 py-2.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </div>
          )}

          {disposition === "trash" && (
            <p className="font-ui text-sm text-text-secondary">
              Move this capture to trash? You can undo immediately after.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || (disposition !== "trash" && !title.trim())}
            className={cn(
              "flex min-h-[48px] w-full items-center justify-center rounded-xl font-ui text-sm font-semibold transition-colors",
              disposition === "trash"
                ? "bg-accent-danger text-white disabled:opacity-40"
                : "bg-accent-primary text-white disabled:opacity-40",
            )}
          >
            {isPending
              ? "Saving…"
              : disposition === "trash"
                ? "Delete"
                : disposition === "did_it"
                  ? "Mark done"
                  : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CaptureProcessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [processedIds, setProcessedIds] = React.useState<Set<string>>(new Set());
  const [activeDisposition, setActiveDisposition] = React.useState<Disposition | null>(null);

  const query = trpc.capture.listInbox.useQuery({ limit: 200 });
  const rawData: Capture[] = (query.data as Capture[] | undefined) ?? [];
  // Process oldest-first: listInbox returns desc, so reverse for oldest-first
  const oldestFirst = React.useMemo(() => [...rawData].reverse(), [rawData]);
  const captures = oldestFirst.filter((c) => !processedIds.has(c.id));

  const [index, setIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (query.data && index === null) {
      // Resolve starting index from ?id= (preferred) or legacy ?start=
      const captureId = searchParams.get("id");
      if (captureId) {
        const idx = oldestFirst.findIndex((c) => c.id === captureId);
        setIndex(idx >= 0 ? idx : 0);
      } else {
        const param = searchParams.get("start");
        const n = param ? parseInt(param, 10) : NaN;
        setIndex(isNaN(n) ? 0 : Math.max(0, Math.min(n, oldestFirst.length - 1)));
      }
    }
  }, [query.data, index, searchParams, oldestFirst]);

  const currentIndex = index ?? 0;
  const current = captures[currentIndex];
  const total = captures.length + processedIds.size;
  const done = processedIds.size;

  function handleDone(captureId: string) {
    setActiveDisposition(null);
    setProcessedIds((prev) => new Set([...prev, captureId]));
    setIndex((i) => {
      const newCaptures = oldestFirst.filter((c) => !processedIds.has(c.id) && c.id !== captureId);
      const cur = i ?? 0;
      if (cur >= newCaptures.length) return Math.max(0, newCaptures.length - 1);
      return cur;
    });
  }

  function handleSkip() {
    setIndex((i) => Math.min((i ?? 0) + 1, captures.length - 1));
  }

  if (query.isLoading || index === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-ui text-sm text-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/m/captures")}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="flex-1 font-ui text-base font-semibold text-text-primary">Process</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <CheckCircle size={48} className="text-accent-success" aria-hidden />
          <div>
            <p className="font-ui text-base font-semibold text-text-primary">All done!</p>
            <p className="mt-1 font-ui text-sm text-text-tertiary">
              {done > 0
                ? `You processed ${done} capture${done !== 1 ? "s" : ""}.`
                : "No captures to process."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/m/captures")}
            className="flex min-h-[44px] items-center rounded-xl bg-accent-primary px-5 font-ui text-sm font-semibold text-white"
          >
            Back to Captures
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="flex min-h-[56px] items-center gap-2 border-b border-border-subtle px-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/m/captures")}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-accent-primary"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="flex-1 font-ui text-base font-semibold text-text-primary">
            Process ({currentIndex + 1} of {captures.length})
          </h1>
          <button
            type="button"
            onClick={handleSkip}
            disabled={currentIndex >= captures.length - 1}
            aria-label="Skip"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md font-ui text-sm text-text-secondary disabled:opacity-40"
          >
            <SkipForward size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-1 flex h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent-primary transition-all"
              style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
            />
          </div>
          <p className="mb-4 font-ui text-xs text-text-tertiary">
            {done} of {total} processed
          </p>

          <div className="mb-4 rounded-xl border border-border-subtle bg-surface-raised p-4">
            <p className="font-ui text-sm leading-relaxed text-text-primary">{current.raw_text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-ui text-xs text-text-tertiary">
                {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
              </span>
              {current.ai_parsed && (
                <span className="rounded-sm bg-accent-primary/10 px-1.5 py-0.5 font-ui text-[10px] font-medium text-accent-primary">
                  AI parsed
                </span>
              )}
              {current.tags?.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-ui text-xs text-text-tertiary"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          <p className="mb-3 font-ui text-xs font-medium uppercase tracking-wide text-text-tertiary">
            What is this?
          </p>

          <div className="grid grid-cols-2 gap-3">
            {DISPOSITIONS.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveDisposition(id)}
                className={cn(
                  "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition-colors",
                  "active:scale-95 active:opacity-80",
                  color,
                )}
              >
                <Icon size={22} aria-hidden />
                <span className="font-ui text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeDisposition && (
        <DispositionSheet
          capture={current}
          disposition={activeDisposition}
          onClose={() => setActiveDisposition(null)}
          onDone={handleDone}
          onUndo={(captureId) => {
            setProcessedIds((prev) => {
              const next = new Set(prev);
              next.delete(captureId);
              return next;
            });
          }}
        />
      )}
    </>
  );
}
