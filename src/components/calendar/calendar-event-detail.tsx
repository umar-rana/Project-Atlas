"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ExternalLink, CheckSquare, Users, MapPin, Clock, Calendar, RefreshCw, Link, FolderOpen, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { getHumanReadableRRule } from "@/core/calendar/rrule";

type CalendarEventDetail = {
  id: string;
  _originalId?: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: Date | string;
  end_at: Date | string;
  all_day: boolean;
  status: string;
  source: string;
  external_url: string | null;
  recurrence_rule: string | null;
  organizer_email: string | null;
  organizer_name: string | null;
  calendar?: { id: string; name: string; google_color_id: string | null; color_override: string | null } | null;
  attendees?: Array<{
    id: string;
    email: string;
    display_name: string | null;
    response_status: string;
    is_organizer: boolean;
    is_self: boolean;
    person?: { id: string; display_name: string | null; given_name: string | null; family_name: string | null } | null;
  }>;
  linked_task?: { id: string; title: string; status: string } | null;
  linked_project?: { id: string; title: string; color: string | null } | null;
  linked_note?: { id: string; title: string } | null;
};

const RESPONSE_STATUS_LABELS: Record<string, string> = {
  accepted: "✓ Accepted",
  declined: "✗ Declined",
  tentative: "? Tentative",
  needsAction: "· Pending",
};

function formatEventTime(start: Date | string, end: Date | string, allDay: boolean): string {
  const s = new Date(start);
  const e = new Date(end);

  if (allDay) {
    return s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  const date = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const startTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${startTime} – ${endTime}`;
}

function durationLabel(start: Date | string, end: Date | string): string {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function ColorDot({ calendarColor }: { calendarColor: string }) {
  return (
    <span
      className="inline-block size-2.5 rounded-full flex-shrink-0"
      style={{ background: `var(--${calendarColor}-fill)` }}
    />
  );
}

type LinkPickerType = "task" | "project" | "note" | null;

function LinkPicker({
  type,
  onSelect,
  onClose,
}: {
  type: LinkPickerType;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  const tasksQuery = trpc.tasks.list.useQuery(
    { perspective: "all", limit: 200 },
    { enabled: type === "task", staleTime: 30_000 },
  );
  const projectsQuery = trpc.projects.list.useQuery(
    { status: "active" },
    { enabled: type === "project", staleTime: 30_000 },
  );
  const notesQuery = trpc.notes.list.useQuery(
    { limit: 100 },
    { enabled: type === "note", staleTime: 30_000 },
  );

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const items: Array<{ id: string; label: string }> = React.useMemo(() => {
    if (type === "task") {
      const data = (tasksQuery.data as Array<{ id: string; title: string }> | undefined) ?? [];
      return data.filter((t) =>
        !search || t.title.toLowerCase().includes(search.toLowerCase())
      ).map((t) => ({ id: t.id, label: t.title }));
    }
    if (type === "project") {
      const data = (projectsQuery.data as Array<{ id: string; title: string }> | undefined) ?? [];
      return data.filter((p) =>
        !search || p.title.toLowerCase().includes(search.toLowerCase())
      ).map((p) => ({ id: p.id, label: p.title }));
    }
    if (type === "note") {
      const data = notesQuery.data?.notes ?? [];
      return data.filter((n) =>
        !search || (n.title ?? "").toLowerCase().includes(search.toLowerCase())
      ).map((n) => ({ id: n.id, label: n.title || "Untitled note" }));
    }
    return [];
  }, [type, search, tasksQuery.data, projectsQuery.data, notesQuery.data]);

  if (!type) return null;

  const placeholder = type === "task" ? "Search tasks…" : type === "project" ? "Search projects…" : "Search notes…";

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-border-default bg-surface-raised shadow-4"
    >
      <div className="p-2">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-border-default bg-surface-base px-2 py-1.5 font-ui text-xs text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none"
        />
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <li className="px-3 py-2 font-ui text-xs text-text-disabled">No results</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left font-ui text-xs text-text-primary hover:bg-surface-hover truncate"
                onClick={() => { onSelect(item.id); onClose(); }}
              >
                {item.label}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

interface CalendarEventDetailProps {
  event: CalendarEventDetail | null;
  open: boolean;
  onClose: () => void;
  onCreateTask?: (eventId: string) => void;
}

export function CalendarEventDetail({ event, open, onClose, onCreateTask }: CalendarEventDetailProps) {
  const utils = trpc.useUtils();
  const [pickerOpen, setPickerOpen] = React.useState<LinkPickerType>(null);

  const linkMutation = trpc.calendar.events.link.useMutation({
    onSuccess: () => {
      utils.calendar.events.list.invalidate();
      setPickerOpen(null);
    },
  });

  if (!event) return null;

  const mutationId = event._originalId ?? event.id;

  const calColor = event.calendar?.color_override
    ?? (event.calendar?.google_color_id
      ? `cal-${event.calendar.google_color_id}`
      : "cal-1");

  const isCancelled = event.status === "cancelled";

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-surface-raised p-5 shadow-4 focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {event.calendar && <ColorDot calendarColor={calColor} />}
              <div className="min-w-0">
                <Dialog.Title
                  className={cn(
                    "font-ui text-base font-semibold text-text-primary",
                    isCancelled && "line-through text-text-tertiary",
                  )}
                >
                  {event.title || "(No title)"}
                </Dialog.Title>
                {isCancelled && (
                  <span className="mt-0.5 inline-flex items-center rounded-full bg-accent-danger-muted px-2 py-0.5 font-ui text-2xs font-medium text-accent-danger">
                    Cancelled
                  </span>
                )}
              </div>
            </div>
            <Dialog.Close className="flex-shrink-0 rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 font-ui text-sm text-text-secondary">
              <Clock size={14} className="mt-0.5 flex-shrink-0 text-text-tertiary" />
              <div>
                <p>{formatEventTime(event.start_at, event.end_at, event.all_day)}</p>
                {!event.all_day && (
                  <p className="text-text-tertiary text-xs">{durationLabel(event.start_at, event.end_at)}</p>
                )}
              </div>
            </div>

            {event.location && (
              <div className="flex items-center gap-2 font-ui text-sm text-text-secondary">
                <MapPin size={14} className="flex-shrink-0 text-text-tertiary" />
                <span>{event.location}</span>
              </div>
            )}

            {event.calendar && (
              <div className="flex items-center gap-2 font-ui text-sm text-text-secondary">
                <Calendar size={14} className="flex-shrink-0 text-text-tertiary" />
                <span>{event.calendar.name}</span>
              </div>
            )}

            {event.recurrence_rule && (
              <div className="flex items-center gap-2 font-ui text-sm text-text-secondary">
                <RefreshCw size={14} className="flex-shrink-0 text-text-tertiary" />
                <span className="capitalize">{getHumanReadableRRule(event.recurrence_rule)}</span>
              </div>
            )}

            {event.description && (
              <div className="rounded-lg bg-surface-base px-3 py-2">
                <p className="font-ui text-sm text-text-secondary whitespace-pre-wrap">{event.description}</p>
              </div>
            )}

            {event.attendees && event.attendees.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Users size={13} className="text-text-tertiary" />
                  <span className="font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Attendees ({event.attendees.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {event.attendees.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {a.is_organizer && (
                          <span className="text-accent-warning" title="Organizer">★</span>
                        )}
                        <span className="font-ui text-sm text-text-primary truncate">
                          {a.person?.display_name ?? a.person?.given_name ?? a.display_name ?? a.email}
                        </span>
                        {a.is_self && (
                          <span className="text-text-tertiary font-ui text-2xs">(you)</span>
                        )}
                      </div>
                      <span className={cn(
                        "flex-shrink-0 font-ui text-2xs",
                        a.response_status === "accepted" && "text-accent-success",
                        a.response_status === "declined" && "text-accent-danger",
                        a.response_status === "tentative" && "text-accent-warning",
                        a.response_status === "needsAction" && "text-text-disabled",
                      )}>
                        {RESPONSE_STATUS_LABELS[a.response_status] ?? a.response_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">Linked</p>
              <div className="flex flex-wrap gap-1.5">
                {event.linked_task ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-secondary">
                    <CheckSquare size={11} />
                    {event.linked_task.title}
                    <button
                      className="ml-0.5 opacity-50 hover:opacity-100"
                      onClick={() => linkMutation.mutate({ id: mutationId, linked_task_id: null })}
                      title="Remove link"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPickerOpen((p) => p === "task" ? null : "task")}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-default px-2 py-1 font-ui text-xs text-text-tertiary hover:border-border-default hover:text-text-secondary"
                    >
                      <CheckSquare size={11} />
                      + Link task
                    </button>
                    {pickerOpen === "task" && (
                      <LinkPicker
                        type="task"
                        onSelect={(id) => linkMutation.mutate({ id: mutationId, linked_task_id: id })}
                        onClose={() => setPickerOpen(null)}
                      />
                    )}
                  </div>
                )}

                {event.linked_project ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-secondary">
                    <FolderOpen size={11} />
                    {event.linked_project.title}
                    <button
                      className="ml-0.5 opacity-50 hover:opacity-100"
                      onClick={() => linkMutation.mutate({ id: mutationId, linked_project_id: null })}
                      title="Remove link"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPickerOpen((p) => p === "project" ? null : "project")}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-default px-2 py-1 font-ui text-xs text-text-tertiary hover:border-border-default hover:text-text-secondary"
                    >
                      <FolderOpen size={11} />
                      + Link project
                    </button>
                    {pickerOpen === "project" && (
                      <LinkPicker
                        type="project"
                        onSelect={(id) => linkMutation.mutate({ id: mutationId, linked_project_id: id })}
                        onClose={() => setPickerOpen(null)}
                      />
                    )}
                  </div>
                )}

                {event.linked_note ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-surface-base px-2 py-1 font-ui text-xs text-text-secondary">
                    <FileText size={11} />
                    {event.linked_note.title || "Untitled note"}
                    <button
                      className="ml-0.5 opacity-50 hover:opacity-100"
                      onClick={() => linkMutation.mutate({ id: mutationId, linked_note_id: null })}
                      title="Remove link"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPickerOpen((p) => p === "note" ? null : "note")}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-default px-2 py-1 font-ui text-xs text-text-tertiary hover:border-border-default hover:text-text-secondary"
                    >
                      <FileText size={11} />
                      + Link note
                    </button>
                    {pickerOpen === "note" && (
                      <LinkPicker
                        type="note"
                        onSelect={(id) => linkMutation.mutate({ id: mutationId, linked_note_id: id })}
                        onClose={() => setPickerOpen(null)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
            {onCreateTask && (
              <button
                onClick={() => { onCreateTask(event.id); onClose(); }}
                className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                <CheckSquare size={13} />
                Create task from this
              </button>
            )}

            <button
              className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary opacity-50 cursor-not-allowed"
              title="Coming in Wave 5a-ii"
              disabled
            >
              Log as interaction
            </button>

            {event.source === "google" && event.external_url && (
              <a
                href={event.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                <ExternalLink size={13} />
                Open in Google Calendar
              </a>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
