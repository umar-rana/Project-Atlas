"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  PauseCircle,
  XCircle,
  SkipForward,
  ChevronLeft,
  X,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

type ReviewAction = "keep_active" | "on_hold" | "completed" | "dropped" | "skip";

type SessionSummary = {
  keep_active: number;
  on_hold: number;
  completed: number;
  dropped: number;
  skip: number;
};

export function ReviewSession(): React.ReactElement {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Fetch the queue once — capture a stable snapshot so index-based navigation
  // never skips projects when reviewed items drop out of the live query.
  const queueQuery = trpc.review.queue.useQuery(undefined, {
    staleTime: Infinity,   // never re-fetch during the session
    refetchOnWindowFocus: false,
  });

  const [stableQueue, setStableQueue] = React.useState<NonNullable<typeof queueQuery.data>["projects"] | null>(null);
  const [currentIdx, setCurrentIdx] = React.useState(0);
  // Track which project IDs the user has acted on this session. Currently used
  // only for analytics-style tracking via the ref; the array is preserved to
  // make a future "undo last" feature trivial without re-instrumenting.
  const historyRef = React.useRef<string[]>([]);
  const [summary, setSummary] = React.useState<SessionSummary | null>(null);
  const [summaryData, setSummaryData] = React.useState<SessionSummary>({
    keep_active: 0,
    on_hold: 0,
    completed: 0,
    dropped: 0,
    skip: 0,
  });
  const [confirmComplete, setConfirmComplete] = React.useState<{
    projectId: string;
    count: number;
  } | null>(null);

  // Snapshot the queue on first successful load
  React.useEffect(() => {
    if (stableQueue === null && queueQuery.data) {
      setStableQueue(queueQuery.data.projects);
    }
  }, [queueQuery.data, stableQueue]);

  const projects = stableQueue ?? queueQuery.data?.projects ?? [];
  const currentProject = projects[currentIdx] ?? null;

  const detailQuery = trpc.review.projectDetail.useQuery(
    { id: currentProject?.id ?? "" },
    { enabled: Boolean(currentProject?.id) },
  );

  const pendingActionRef = React.useRef<ReviewAction | null>(null);
  const summaryDataRef = React.useRef<SessionSummary>(summaryData);
  React.useEffect(() => { summaryDataRef.current = summaryData; }, [summaryData]);
  const currentIdxRef = React.useRef(currentIdx);
  React.useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  const projectsLengthRef = React.useRef(projects.length);
  React.useEffect(() => { projectsLengthRef.current = projects.length; }, [projects.length]);

  const reviewMutation = trpc.review.reviewProject.useMutation({
    onSuccess: (data) => {
      if (!data.ok && data.needs_confirmation) {
        setConfirmComplete({
          projectId: currentProject?.id ?? "",
          count: data.incomplete_count,
        });
        pendingActionRef.current = null;
        return;
      }
      utils.review.queue.invalidate();
      utils.review.overdueCount.invalidate();
      utils.projects.list.invalidate();
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      const nextSummaryData = action
        ? { ...summaryDataRef.current, [action]: (summaryDataRef.current[action] ?? 0) + 1 }
        : summaryDataRef.current;
      setSummaryData(nextSummaryData);
      const nextIdx = currentIdxRef.current + 1;
      if (nextIdx >= projectsLengthRef.current) {
        setSummary(nextSummaryData);
      } else {
        setCurrentIdx(nextIdx);
      }
    },
    onError: () => {
      toast.error("Review action failed");
      pendingActionRef.current = null;
    },
  });

  const [notesDraft, setNotesDraft] = React.useState("");
  // Reset draft only when the *project* changes, not when its server-side notes
  // shift (e.g., another tab updates them) — that would clobber the user's
  // in-progress edits. Tracking the last-applied id in a ref lets us include
  // both deps to satisfy exhaustive-deps without changing semantics.
  const notesProjectIdRef = React.useRef<string | null>(null);
  const currentProjectId = currentProject?.id ?? null;
  const currentProjectNotes = currentProject?.notes ?? "";
  React.useEffect(() => {
    if (notesProjectIdRef.current !== currentProjectId) {
      notesProjectIdRef.current = currentProjectId;
      setNotesDraft(currentProjectNotes);
    }
  }, [currentProjectId, currentProjectNotes]);

  function handleAction(action: ReviewAction) {
    if (!currentProject || reviewMutation.isPending) return;

    historyRef.current = [...historyRef.current, currentProject.id];
    pendingActionRef.current = action;

    reviewMutation.mutate({
      id: currentProject.id,
      action,
      notes: notesDraft !== currentProject.notes ? notesDraft : undefined,
    });
  }

  function handlePrevious() {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  }

  function handleForceComplete() {
    if (!confirmComplete) return;
    pendingActionRef.current = "completed";
    reviewMutation.mutate({
      id: confirmComplete.projectId,
      action: "completed",
      force: true,
    });
    setConfirmComplete(null);
  }

  const handleExit = React.useCallback(() => {
    router.push("/tasks");
  }, [router]);

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleExit();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleExit]);

  if (queueQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base">
        <p className="font-ui text-sm text-text-tertiary">Loading review queue…</p>
      </div>
    );
  }

  if (summary !== null) {
    const total = Object.values(summaryData).reduce((a, b) => a + b, 0);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-surface-base p-8">
        <div className="w-full max-w-md">
          <div className="mb-4 flex items-center gap-2">
            <RefreshCw size={16} className="text-accent-success" />
            <h1 className="font-display text-xl font-semibold text-text-primary">Review complete</h1>
          </div>
          <p className="mb-6 font-ui text-sm text-text-secondary">
            You reviewed {total} project{total !== 1 ? "s" : ""}. Nice work.
          </p>

          <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-4">
            {summaryData.keep_active > 0 && (
              <div className="flex items-center justify-between font-ui text-sm">
                <span className="text-text-secondary">Kept active</span>
                <span className="font-semibold text-text-primary tabular-nums">{summaryData.keep_active}</span>
              </div>
            )}
            {summaryData.on_hold > 0 && (
              <div className="flex items-center justify-between font-ui text-sm">
                <span className="text-text-secondary">Put on hold</span>
                <span className="font-semibold text-text-primary tabular-nums">{summaryData.on_hold}</span>
              </div>
            )}
            {summaryData.completed > 0 && (
              <div className="flex items-center justify-between font-ui text-sm">
                <span className="text-text-secondary">Completed</span>
                <span className="font-semibold text-accent-success tabular-nums">{summaryData.completed}</span>
              </div>
            )}
            {summaryData.dropped > 0 && (
              <div className="flex items-center justify-between font-ui text-sm">
                <span className="text-text-secondary">Dropped</span>
                <span className="font-semibold text-text-tertiary tabular-nums">{summaryData.dropped}</span>
              </div>
            )}
            {summaryData.skip > 0 && (
              <div className="flex items-center justify-between font-ui text-sm">
                <span className="text-text-secondary">Skipped</span>
                <span className="font-semibold text-text-tertiary tabular-nums">{summaryData.skip}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExit}
            className="mt-6 w-full rounded-lg bg-accent-primary px-4 py-2.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-base p-8">
        <RefreshCw size={28} className="text-text-disabled" />
        <h1 className="font-display text-xl font-semibold text-text-primary">Nothing to review</h1>
        <p className="text-center font-ui text-sm text-text-secondary">
          All your projects are up to date. Set a review interval on a project to schedule its next review.
        </p>
        <button
          type="button"
          onClick={handleExit}
          className="rounded-lg border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
        >
          Back to Tasks
        </button>
      </div>
    );
  }

  const detail = detailQuery.data;
  const progress = ((currentIdx) / projects.length) * 100;

  return (
    <div className="flex h-full flex-col bg-surface-base">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIdx === 0}
            aria-label="Previous project"
            className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <RefreshCw size={12} className="text-text-tertiary" />
            <span className="font-ui text-xs text-text-secondary">
              {currentIdx + 1} of {projects.length}
            </span>
          </div>
        </div>

        <div className="flex-1 mx-4">
          <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleExit}
          aria-label="Exit review (Esc)"
          className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <X size={16} />
        </button>
      </div>

      {confirmComplete && (
        <div className="border-b border-accent-warning bg-accent-warning-muted px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-accent-warning" />
            <div className="flex-1">
              <p className="font-ui text-sm font-medium text-text-primary">
                This project has {confirmComplete.count} incomplete task{confirmComplete.count !== 1 ? "s" : ""}
              </p>
              <p className="font-ui text-xs text-text-secondary">
                Completing it will also complete all remaining tasks.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleForceComplete}
                  className="rounded-sm bg-accent-warning px-3 py-1 font-ui text-xs font-medium text-white hover:opacity-90"
                >
                  Complete anyway
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmComplete(null)}
                  className="rounded-sm border border-border-default px-3 py-1 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {currentProject && (
            <div className="mx-auto max-w-2xl">
              <div className="mb-1 flex items-center gap-2">
                {currentProject.color && (
                  <span className={cn("size-3 rounded-full", {
                    "bg-cal-1-border": currentProject.color === "blue",
                    "bg-cal-2-border": currentProject.color === "green",
                    "bg-cal-3-border": currentProject.color === "amber",
                    "bg-cal-4-border": currentProject.color === "red",
                    "bg-cal-5-border": currentProject.color === "purple",
                  })} />
                )}
                <span className="font-ui text-xs uppercase tracking-caps text-text-tertiary">Project</span>
              </div>

              <h1 className="mb-4 font-display text-2xl font-semibold text-text-primary">
                {currentProject.title}
              </h1>

              <div className="mb-4 flex items-center gap-4 font-ui text-xs text-text-tertiary">
                {currentProject.last_reviewed_at && (
                  <span>
                    Last reviewed {formatDistanceToNow(new Date(currentProject.last_reviewed_at))} ago
                  </span>
                )}
                {!currentProject.last_reviewed_at && (
                  <span>Never reviewed</span>
                )}
                <span>{currentProject.task_count} active task{currentProject.task_count !== 1 ? "s" : ""}</span>
              </div>

              <div className="mb-6">
                <label className="mb-1 block font-ui text-2xs font-medium text-text-tertiary">
                  Project notes
                </label>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={4}
                  placeholder="No notes yet. Add context, goals, or next steps…"
                  className="w-full resize-none rounded-md border border-border-default bg-surface-overlay p-3 font-ui text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-border-focus"
                />
              </div>

              {detail && (
                <>
                  {detail.stale_tasks.length > 0 && (
                    <div className="mb-4 rounded-md border border-accent-warning bg-accent-warning-muted p-3">
                      <p className="mb-2 font-ui text-xs font-medium text-accent-warning">
                        {detail.stale_tasks.length} stale task{detail.stale_tasks.length !== 1 ? "s" : ""} (no due date, not updated in 14+ days)
                      </p>
                      <ul className="flex flex-col gap-1">
                        {(detail.stale_tasks as Array<{ id: string; title: string }>).slice(0, 5).map((t) => (
                          <li key={t.id} className="font-ui text-xs text-text-secondary">• {t.title}</li>
                        ))}
                        {detail.stale_tasks.length > 5 && (
                          <li className="font-ui text-xs text-text-tertiary">
                            +{detail.stale_tasks.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {detail.tasks.length > 0 && (
                    <div className="mb-4">
                      <h3 className="mb-2 font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
                        Tasks ({detail.incomplete_count} active)
                      </h3>
                      <ul className="flex flex-col gap-1">
                        {(detail.tasks as Array<{ id: string; title: string; status: string; due_date: Date | string | null }>).slice(0, 10).map((t) => (
                          <li
                            key={t.id}
                            className={cn(
                              "flex items-center gap-2 font-ui text-sm",
                              t.status === "completed" ? "text-text-disabled line-through" : "text-text-secondary",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full shrink-0", t.status === "completed" ? "bg-text-disabled" : "bg-accent-primary")} />
                            {t.title}
                            {t.due_date && (
                              <span className="ml-auto font-ui text-2xs text-text-tertiary">
                                {format(new Date(t.due_date), "MMM d")}
                              </span>
                            )}
                          </li>
                        ))}
                        {detail.tasks.length > 10 && (
                          <li className="font-ui text-xs text-text-tertiary">
                            +{detail.tasks.length - 10} more tasks
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border-subtle bg-surface-sunken px-8 py-4">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleAction("keep_active")}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-accent-success bg-accent-success-muted px-4 py-2 font-ui text-sm font-medium text-accent-success hover:bg-opacity-80 disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              Keep active
            </button>
            <button
              type="button"
              onClick={() => handleAction("on_hold")}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-accent-warning bg-accent-warning-muted px-4 py-2 font-ui text-sm font-medium text-accent-warning hover:bg-opacity-80 disabled:opacity-50"
            >
              <PauseCircle size={14} />
              On hold
            </button>
            <button
              type="button"
              onClick={() => handleAction("completed")}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-accent-info bg-accent-info-muted px-4 py-2 font-ui text-sm font-medium text-accent-info hover:bg-opacity-80 disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              Mark complete
            </button>
            <button
              type="button"
              onClick={() => handleAction("dropped")}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-accent-danger bg-accent-danger-muted px-4 py-2 font-ui text-sm font-medium text-accent-danger hover:bg-opacity-80 disabled:opacity-50"
            >
              <XCircle size={14} />
              Drop
            </button>
            <button
              type="button"
              onClick={() => handleAction("skip")}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              <SkipForward size={14} />
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
