"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface ParserProposal {
  title?: string;
  tags?: string[];
}

interface DispositionSomedayFormProps {
  captureId: string;
  rawText: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

type ReviewOption = "next_cycle" | "one_month" | "three_months" | "specific" | "none";

function addMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0] ?? "";
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0] ?? "";
}

function deriveTitle(proposal: ParserProposal | null | undefined, rawText: string): string {
  if (proposal?.title?.trim()) return proposal.title.trim();
  const firstLine = rawText.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 80) return firstLine;
  return rawText.slice(0, 80).trim();
}

export function DispositionSomedayForm({
  captureId,
  rawText,
  proposal,
  onConfirm,
  onCancel,
}: DispositionSomedayFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const tags = trpc.tags.list.useQuery({ limit: 200 }, { staleTime: 60_000 });
  const { data: rawUser } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const tasksPrefs =
    typeof (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs === "object" &&
    (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs !== null
      ? ((rawUser as { tasks_prefs?: unknown } | undefined)!.tasks_prefs as Record<string, unknown>)
      : {};
  const somedayCadence = (tasksPrefs.gtd_someday_review_cadence as string | undefined) ?? "weekly";
  const nextCycleDays = somedayCadence === "monthly" ? 30 : somedayCadence === "biweekly" ? 14 : 7;

  const [title, setTitle] = React.useState(() => deriveTitle(proposal, rawText));
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [reviewOption, setReviewOption] = React.useState<ReviewOption>("next_cycle");
  const [specificDate, setSpecificDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    const derived = deriveTitle(proposal, rawText);
    if (derived) setTitle(derived);
    if (proposal?.tags && tags.data) {
      const ids = proposal.tags
        .map((tName) => tags.data.find((t) => t.name === tName.toLowerCase())?.id)
        .filter((id): id is string => !!id);
      setTagIds(ids);
    }
  }, [proposal, rawText, tags.data]);

  function getReviewDate(): string | undefined {
    if (reviewOption === "none") return undefined;
    if (reviewOption === "next_cycle") return new Date(addDays(nextCycleDays)).toISOString();
    if (reviewOption === "one_month") return new Date(addMonths(1)).toISOString();
    if (reviewOption === "three_months") return new Date(addMonths(3)).toISOString();
    if (reviewOption === "specific" && specificDate) return new Date(specificDate).toISOString();
    return undefined;
  }

  const mut = trpc.capture.processToSomeday.useMutation({
    // CP-1: suppress global MutationCache.onError toast — local onError
    // below is more specific. Avoids stacked toasts on failure.
    meta: { suppressGlobalError: true },
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.counts.invalidate();
      onConfirm();
    },
    onError: (err) => {
      const msg = err.message || "Failed to add to Someday. Please try again.";
      import("@/lib/toast").then(({ toast }) => toast.error(msg));
    },
  });

  function submit() {
    const trimmed = title.trim() || deriveTitle(proposal, rawText);
    if (!trimmed) return;
    mut.mutate({
      capture_id: captureId,
      title: trimmed,
      notes: notes || undefined,
      tag_ids: tagIds,
      someday_review_date: getReviewDate(),
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    // CR DR-3 / rule 8.7: Enter and ⌘+Enter both commit the visible form
    // state. Previous ⌘+Enter "Defaults" shortcut removed (silently
    // discarded user edits).
    if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA" && target.tagName !== "SELECT") {
        e.preventDefault();
        submit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  const inputCls =
    "w-full rounded-md border border-border-default bg-surface-base px-3 py-1.5 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus";
  const labelCls = "mb-1 block font-ui text-2xs font-medium text-text-secondary";

  const REVIEW_OPTIONS: { value: ReviewOption; label: string }[] = [
    {
      value: "next_cycle",
      label: `Next review cycle (~${nextCycleDays === 30 ? "1 month" : nextCycleDays === 14 ? "2 weeks" : "1 week"})`,
    },
    { value: "one_month", label: "In a month" },
    { value: "three_months", label: "In three months" },
    { value: "specific", label: "Specific date" },
    { value: "none", label: "No review date" },
  ];

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKey}>
      <div>
        <label className={labelCls}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="Someday task title…"
        />
      </div>

      <div>
        <label className={labelCls}>Review date</label>
        <div className="flex flex-col gap-1.5">
          {REVIEW_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="review_option"
                value={opt.value}
                checked={reviewOption === opt.value}
                onChange={() => setReviewOption(opt.value)}
                className="accent-accent-primary"
              />
              <span className="font-ui text-sm text-text-primary">{opt.label}</span>
            </label>
          ))}
          {reviewOption === "specific" && (
            <input
              type="date"
              value={specificDate}
              onChange={(e) => setSpecificDate(e.target.value)}
              className={cn(inputCls, "mt-1")}
            />
          )}
        </div>
      </div>

      <div>
        <label className={labelCls}>Tags</label>
        <select
          multiple
          value={tagIds}
          onChange={(e) => setTagIds(Array.from(e.target.selectedOptions, (o) => o.value))}
          className={cn(inputCls, "h-20")}
        >
          {(tags.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={cn(inputCls, "resize-none")}
          placeholder="Optional notes…"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={mut.isPending || !title.trim()}
          className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
        >
          {mut.isPending ? "Creating…" : "Add to Someday ↵"}
        </button>
      </div>
    </div>
  );
}
