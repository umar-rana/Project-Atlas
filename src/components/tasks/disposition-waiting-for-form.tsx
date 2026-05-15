"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { DateTimePicker } from "@/components/shared/date-time-picker";

interface ParserProposal {
  title?: string;
  person_refs?: string[];
  follow_up_date?: string | null;
  follow_up_date_has_time?: boolean | null;
}

function fmtTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

function buildDateTimeIso(date: string, time: string, hasTime: boolean): string | undefined {
  if (!date) return undefined;
  const t = hasTime && time ? time : "00:00";
  return new Date(`${date}T${t}:00`).toISOString();
}

interface DispositionWaitingForFormProps {
  captureId: string;
  rawText: string;
  proposal?: ParserProposal | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function deriveTitle(proposal: ParserProposal | null | undefined, rawText: string): string {
  if (proposal?.title?.trim()) return proposal.title.trim();
  const firstLine = rawText.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length <= 80) return firstLine;
  return rawText.slice(0, 80).trim();
}

export function DispositionWaitingForForm({
  captureId,
  rawText,
  proposal,
  onConfirm,
  onCancel,
}: DispositionWaitingForFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const { data: rawUser } = trpc.user.me.useQuery(undefined, { staleTime: 60_000 });
  const tasksPrefs =
    typeof (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs === "object" &&
    (rawUser as { tasks_prefs?: unknown } | undefined)?.tasks_prefs !== null
      ? ((rawUser as { tasks_prefs?: unknown } | undefined)!.tasks_prefs as Record<string, unknown>)
      : {};
  const waitingForWindow =
    (tasksPrefs.gtd_waiting_for_default_window as string | undefined) ?? "1w";
  const defaultFollowUpDays = waitingForWindow === "1m" ? 30 : waitingForWindow === "2w" ? 14 : 7;

  function defaultFollowUpDateString(): string {
    const d = new Date();
    d.setDate(d.getDate() + defaultFollowUpDays);
    return d.toISOString().split("T")[0] ?? "";
  }

  const defaultEventTime = (rawUser as { default_event_time?: string } | undefined)
    ?.default_event_time ?? "09:00";

  const [title, setTitle] = React.useState(() => deriveTitle(proposal, rawText));
  const [delegatedTo, setDelegatedTo] = React.useState(
    () => proposal?.person_refs?.[0] ?? "",
  );
  const [followUpDate, setFollowUpDate] = React.useState(() => {
    if (proposal?.follow_up_date) return proposal.follow_up_date.split("T")[0] ?? "";
    return defaultFollowUpDateString();
  });
  const [followUpTime, setFollowUpTime] = React.useState(() =>
    proposal?.follow_up_date_has_time ? fmtTimeInput(proposal?.follow_up_date) : "",
  );
  const [followUpHasTime, setFollowUpHasTime] = React.useState(
    proposal?.follow_up_date_has_time === true,
  );
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    const derived = deriveTitle(proposal, rawText);
    if (derived) setTitle(derived);
    if (proposal?.person_refs?.[0]) setDelegatedTo(proposal.person_refs[0]);
    if (proposal?.follow_up_date) {
      setFollowUpDate(proposal.follow_up_date.split("T")[0] ?? "");
      if (proposal.follow_up_date_has_time) {
        setFollowUpTime(fmtTimeInput(proposal.follow_up_date));
        setFollowUpHasTime(true);
      }
    }
  }, [proposal, rawText]);

  React.useEffect(() => {
    setFollowUpDate(defaultFollowUpDateString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFollowUpDays]);

  const mut = trpc.capture.processToWaitingFor.useMutation({
    // CP-1: suppress global MutationCache.onError toast — local onError
    // below is more specific. Avoids stacked toasts on failure.
    meta: { suppressGlobalError: true },
    onSuccess: () => {
      utils.capture.listInbox.invalidate();
      utils.tasks.counts.invalidate();
      onConfirm();
    },
    onError: (err) => {
      const msg = err.message || "Failed to add to Waiting For. Please try again.";
      import("@/lib/toast").then(({ toast }) => toast.error(msg));
    },
  });

  function submit() {
    const trimmed = title.trim() || deriveTitle(proposal, rawText);
    if (!trimmed) return;
    mut.mutate({
      capture_id: captureId,
      title: trimmed,
      delegated_to_text: delegatedTo || undefined,
      follow_up_date: buildDateTimeIso(followUpDate, followUpTime, followUpHasTime),
      follow_up_date_has_time: followUpDate ? followUpHasTime : undefined,
      notes: notes || undefined,
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    // CR DR-3 / rule 8.7: Enter and ⌘+Enter both commit the visible form
    // state. Previous ⌘+Enter "Defaults" shortcut removed (silently
    // discarded user edits).
    if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA") {
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

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKey}>
      <div>
        <label className={labelCls}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="Waiting for title…"
        />
      </div>

      <div>
        <label className={labelCls}>Waiting on (person)</label>
        <input
          value={delegatedTo}
          onChange={(e) => setDelegatedTo(e.target.value)}
          className={inputCls}
          placeholder="Name or description…"
        />
      </div>
      <div>
        <label className={labelCls}>Follow-up date</label>
        <DateTimePicker
          dateValue={followUpDate}
          timeValue={followUpTime}
          hasTime={followUpHasTime}
          onDateChange={(d) => {
            setFollowUpDate(d);
            if (!d) setFollowUpHasTime(false);
          }}
          onTimeChange={setFollowUpTime}
          onHasTimeChange={setFollowUpHasTime}
          defaultTime={defaultEventTime}
        />
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
          {mut.isPending ? "Creating…" : "Add to Waiting For ↵"}
        </button>
      </div>
    </div>
  );
}
