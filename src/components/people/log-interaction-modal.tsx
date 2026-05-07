"use client";

import React, { useState, useEffect } from "react";
import {
  Phone,
  Video,
  MessageSquare,
  Mail,
  Coffee,
  UtensilsCrossed,
  StickyNote,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";

export interface InteractionRow {
  id: string;
  kind: string;
  occurred_at: Date | string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
}

interface Props {
  personId: string;
  personName: string;
  existing?: InteractionRow;
  onClose: () => void;
  onSuccess: () => void;
}

const CURATED_KINDS = [
  { kind: "meeting", label: "Meeting", icon: <Video size={14} /> },
  { kind: "call", label: "Call", icon: <Phone size={14} /> },
  { kind: "message", label: "Message", icon: <MessageSquare size={14} /> },
  { kind: "email", label: "Email", icon: <Mail size={14} /> },
  { kind: "coffee", label: "Coffee", icon: <Coffee size={14} /> },
  { kind: "lunch", label: "Lunch", icon: <UtensilsCrossed size={14} /> },
  { kind: "dinner", label: "Dinner", icon: <UtensilsCrossed size={14} /> },
  { kind: "note", label: "Note", icon: <StickyNote size={14} /> },
  { kind: "other", label: "Other", icon: <Activity size={14} /> },
];

export function kindIcon(kind: string): React.ReactElement {
  const map: Record<string, React.ReactElement> = {
    meeting: <Video size={14} />,
    call: <Phone size={14} />,
    message: <MessageSquare size={14} />,
    email: <Mail size={14} />,
    coffee: <Coffee size={14} />,
    lunch: <UtensilsCrossed size={14} />,
    dinner: <UtensilsCrossed size={14} />,
    note: <StickyNote size={14} />,
    other: <Activity size={14} />,
  };
  return map[kind] ?? <Activity size={14} />;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const INPUT =
  "w-full rounded-md border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-border-focus";

export function LogInteractionModal({ personId, personName, existing, onClose, onSuccess }: Props) {
  const isEdit = !!existing;

  const [kind, setKind] = useState<string>(existing?.kind ?? "meeting");
  const [isCustomKind, setIsCustomKind] = useState(false);
  const [customKind, setCustomKind] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    existing
      ? toLocalDatetimeValue(new Date(existing.occurred_at))
      : toLocalDatetimeValue(new Date()),
  );
  const [durationStr, setDurationStr] = useState(
    existing?.duration_minutes != null ? String(existing.duration_minutes) : "",
  );
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (existing) {
      const existingKind = existing.kind;
      const isCurated = CURATED_KINDS.some((k) => k.kind === existingKind);
      if (!isCurated) {
        setIsCustomKind(true);
        setCustomKind(existingKind);
        setKind("__custom__");
      } else {
        setKind(existingKind);
      }
    }
  }, [existing]);

  const utils = trpc.useUtils();

  const createMutation = trpc.people.interactions.create.useMutation({
    onSuccess: () => {
      void utils.people.interactions.list.invalidate({ person_id: personId });
      void utils.people.get.invalidate({ id: personId });
      onSuccess();
    },
  });

  const updateMutation = trpc.people.interactions.update.useMutation({
    onSuccess: () => {
      void utils.people.interactions.list.invalidate({ person_id: personId });
      void utils.people.get.invalidate({ id: personId });
      onSuccess();
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const effectiveKind = isCustomKind ? customKind.trim() : kind;
    if (!effectiveKind) {
      setError("Interaction type is required.");
      return;
    }

    const occurredAtDate = new Date(occurredAt);
    if (isNaN(occurredAtDate.getTime())) {
      setError("Invalid date.");
      return;
    }
    if (occurredAtDate.getTime() > Date.now() + 5 * 60 * 1000) {
      setError("Date cannot be more than 5 minutes in the future.");
      return;
    }

    const durationMinutes = durationStr.trim() ? parseInt(durationStr, 10) : undefined;
    if (
      durationStr.trim() &&
      (isNaN(durationMinutes!) || durationMinutes! < 0 || durationMinutes! > 1440)
    ) {
      setError("Duration must be between 0 and 1440 minutes.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && existing) {
        await updateMutation.mutateAsync({
          id: existing.id,
          kind: effectiveKind,
          occurred_at: occurredAtDate.toISOString(),
          duration_minutes: durationStr.trim() ? durationMinutes : null,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        await createMutation.mutateAsync({
          person_id: personId,
          kind: effectiveKind,
          occurred_at: occurredAtDate.toISOString(),
          duration_minutes: durationMinutes,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="z-modal bg-surface-base/60 fixed inset-0 flex items-start justify-center backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 mt-[12vh] w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">
            {isEdit ? "Edit interaction" : `Log interaction with ${personName}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-disabled transition-colors hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="bg-accent-danger/10 rounded-md border border-accent-danger px-3 py-2 text-sm text-accent-danger">
              {error}
            </div>
          )}

          {/* Kind */}
          <div>
            <label className="mb-1.5 block text-xs text-text-tertiary">Type</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {CURATED_KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => {
                    setKind(k.kind);
                    setIsCustomKind(false);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                    !isCustomKind && kind === k.kind
                      ? "border-accent-primary bg-accent-primary-subtle font-medium text-accent-primary"
                      : "border-border-default text-text-tertiary hover:border-border-strong hover:text-text-primary",
                  )}
                >
                  {k.icon}
                  {k.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIsCustomKind(true);
                  setKind("__custom__");
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                  isCustomKind
                    ? "border-accent-primary bg-accent-primary-subtle font-medium text-accent-primary"
                    : "border-border-default text-text-tertiary hover:text-text-primary",
                )}
              >
                Custom…
              </button>
            </div>
            {isCustomKind && (
              <input
                className={INPUT}
                value={customKind}
                onChange={(e) => setCustomKind(e.target.value)}
                placeholder="e.g. workshop, interview, review…"
                autoFocus
                maxLength={32}
              />
            )}
          </div>

          {/* Date & time */}
          <div>
            <label className="mb-1.5 block text-xs text-text-tertiary">Date & time</label>
            <input
              type="datetime-local"
              className={INPUT}
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
          </div>

          {/* Duration */}
          <div>
            <label className="mb-1.5 block text-xs text-text-tertiary">
              Duration (minutes, optional)
            </label>
            <input
              type="number"
              className={INPUT}
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              placeholder="e.g. 30"
              min={0}
              max={1440}
            />
          </div>

          {/* Location */}
          <div>
            <label className="mb-1.5 block text-xs text-text-tertiary">Location (optional)</label>
            <input
              className={INPUT}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Zoom, coffee shop, their office…"
              maxLength={500}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs text-text-tertiary">Notes (optional)</label>
            <textarea
              className={cn(INPUT, "min-h-[80px] resize-y")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key points, follow-ups, impressions…"
              maxLength={10000}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent-primary px-4 py-1.5 text-sm text-text-on-accent transition-colors hover:bg-accent-primary-hover disabled:opacity-60"
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Log interaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
