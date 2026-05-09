"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { CalendarEventDetail } from "@/components/calendar/calendar-event-detail";
import { BlockTimeForm } from "@/components/calendar/block-time-form";
import { toast } from "@/lib/toast";
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  type View,
  type SlotInfo,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

type ViewType = "day" | "week" | "month";

function parseViewParam(p: string | null): ViewType {
  if (p === "day" || p === "week" || p === "month") return p;
  return "week";
}

function formatHeaderTitle(view: ViewType, anchor: Date): string {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startStr = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} – ${endStr}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function getWindowForView(view: ViewType, anchor: Date): { start: Date; end: Date } {
  if (view === "day") {
    const s = new Date(anchor);
    s.setHours(0, 0, 0, 0);
    const e = new Date(anchor);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  if (view === "week") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

type CalEvent = {
  id: string;
  title: string;
  start_at: Date | string;
  end_at: Date | string;
  all_day: boolean;
  status: string;
  source: string;
  description: string | null;
  location: string | null;
  external_url: string | null;
  recurrence_rule: string | null;
  organizer_email: string | null;
  organizer_name: string | null;
  _originalId?: string;
  _virtualDate?: Date;
  calendar?: {
    id: string;
    name: string;
    google_color_id: string | null;
    color_override: string | null;
  } | null;
  attendees?: Array<{
    id: string;
    email: string;
    display_name: string | null;
    response_status: string;
    is_organizer: boolean;
    is_self: boolean;
    person?: {
      id: string;
      display_name: string | null;
      given_name: string | null;
      family_name: string | null;
    } | null;
  }>;
  linked_task?: { id: string; title: string; status: string } | null;
  linked_project?: { id: string; title: string; color: string | null } | null;
  linked_note?: { id: string; title: string } | null;
};

type RBCEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalEvent;
};

function calEventColor(event: CalEvent): string {
  if (event.source === "atlas") return "cal-1";
  if (event.calendar?.color_override) return event.calendar.color_override;
  if (event.calendar?.google_color_id) return `cal-${event.calendar.google_color_id}`;
  return "cal-1";
}

function toRBCEvent(e: CalEvent): RBCEvent {
  return {
    id: e.id,
    title: e.title || "(No title)",
    start: new Date(e.start_at),
    end: new Date(e.end_at),
    allDay: e.all_day,
    resource: e,
  };
}

function CustomEventComponent({ event }: { event: RBCEvent }) {
  const orig = event.resource;
  const color = calEventColor(orig);
  const isCancelled = orig.status === "cancelled";
  return (
    <span
      className={cn(
        "block truncate px-1 font-ui text-xs font-medium",
        isCancelled && "line-through opacity-60",
      )}
      style={{ color: `var(--${color}-fill)` }}
      title={event.title}
    >
      {event.title}
    </span>
  );
}

export default function CalendarView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [view, setView] = React.useState<ViewType>(() => parseViewParam(searchParams.get("view")));
  const [anchor, setAnchor] = React.useState<Date>(() => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      const d = new Date(dateParam);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [selectedCalIds, setSelectedCalIds] = React.useState<string[]>(() => {
    const raw = searchParams.get("calendars");
    return raw ? raw.split(",").filter(Boolean) : [];
  });

  const isUpdatingUrl = React.useRef(false);

  React.useEffect(() => {
    if (isUpdatingUrl.current) return;
    isUpdatingUrl.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    params.set("date", anchor.toISOString().slice(0, 10));
    if (selectedCalIds.length > 0) {
      params.set("calendars", selectedCalIds.join(","));
    } else {
      params.delete("calendars");
    }
    router.replace(`/calendar?${params.toString()}`, { scroll: false });
    setTimeout(() => {
      isUpdatingUrl.current = false;
    }, 100);
  }, [view, anchor, selectedCalIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const { start, end } = getWindowForView(view, anchor);

  const { data: calendars = [] } = trpc.calendar.calendars.list.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  const {
    data: events = [],
    isLoading,
    refetch,
  } = trpc.calendar.events.list.useQuery(
    { start, end, calendar_ids: selectedCalIds.length > 0 ? selectedCalIds : undefined },
    { staleTime: 2 * 60_000 },
  );

  const { data: calStatus } = trpc.calendar.connected.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  const [selectedEvent, setSelectedEvent] = React.useState<CalEvent | null>(null);
  const [blockFormOpen, setBlockFormOpen] = React.useState(false);
  const [blockFormStart, setBlockFormStart] = React.useState<Date | undefined>();
  const [blockFormEnd, setBlockFormEnd] = React.useState<Date | undefined>();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const utils = trpc.useUtils();
  const linkEventMut = trpc.calendar.events.link.useMutation({
    onSuccess: () => utils.calendar.events.list.invalidate(),
  });
  // @ts-expect-error TS2589: tRPC type inference exceeds depth limit; runtime types are correct
  const createTaskMut = trpc.tasks.create.useMutation({
    onSuccess: (task) => {
      utils.tasks.list.invalidate();
      if (selectedEvent) {
        linkEventMut.mutate({
          id: selectedEvent._originalId ?? selectedEvent.id,
          linked_task_id: task.id,
        });
      }
    },
  });

  function handleCreateTaskFromEvent(eventId: string) {
    const calEv = events.find((e) => {
      const ev = e as CalEvent;
      return ev.id === eventId || ev._originalId === eventId;
    }) as CalEvent | undefined;
    if (!calEv) return;
    createTaskMut.mutate({ title: calEv.title, flagged: false });
    toast.success("Task created and linked to event");
    setSelectedEvent(null);
  }

  function handleSelectSlot(slot: SlotInfo) {
    setBlockFormStart(slot.start);
    setBlockFormEnd(slot.end);
    setBlockFormOpen(true);
  }

  function handleNavigate(newDate: Date) {
    setAnchor(newDate);
  }

  function handleViewChange(newView: View) {
    if (newView === "day" || newView === "week" || newView === "month") {
      setView(newView as ViewType);
    }
  }

  function navigate(direction: number) {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + direction);
    else if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setAnchor(next);
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Sync failed");
      } else {
        toast.success("Calendar synced");
        refetch();
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  const rbcEvents: RBCEvent[] = (events as CalEvent[]).map(toRBCEvent);

  const eventStyleGetter = (event: RBCEvent) => {
    const orig = event.resource;
    const color = calEventColor(orig);
    const isCancelled = orig.status === "cancelled";
    return {
      style: {
        background: `color-mix(in srgb, var(--${color}-fill) ${isCancelled ? "10" : "20"}%, transparent)`,
        borderLeft: `3px solid var(--${color}-fill)`,
        borderRadius: "4px",
        color: `var(--${color}-fill)`,
        fontSize: "11px",
        fontFamily: "var(--font-ui)",
        fontWeight: 500,
        border: "none",
        opacity: isCancelled ? 0.5 : 1,
        textDecoration: isCancelled ? "line-through" : "none",
      },
    };
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-base">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border-default px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigate(-1)}
              className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="rounded-md px-2 py-1 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="rounded-md p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <h1 className="font-ui text-sm font-semibold text-text-primary">
            {formatHeaderTitle(view, anchor)}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {calStatus?.connected && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing…" : "Refresh"}
            </button>
          )}
          <button
            onClick={() => {
              setBlockFormStart(undefined);
              setBlockFormEnd(undefined);
              setBlockFormOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            <Plus size={13} />
            Block time
          </button>

          <div className="flex overflow-hidden rounded-lg border border-border-default">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 font-ui text-xs font-medium capitalize transition-colors",
                  view === v
                    ? "bg-accent-primary text-text-on-accent"
                    : "text-text-secondary hover:bg-surface-hover",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!calStatus?.connected && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-sunken px-4 py-2">
          <Calendar size={13} className="flex-shrink-0 text-text-tertiary" />
          <span className="font-ui text-xs text-text-tertiary">
            Google Calendar not connected — showing Atlas time blocks only.
          </span>
          <a
            href="/settings?section=integrations"
            className="flex-shrink-0 font-ui text-xs text-accent-primary hover:underline"
          >
            Connect →
          </a>
        </div>
      )}

      {calendars.length > 1 && (
        <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border-subtle bg-surface-sunken px-4 py-1.5">
          <span className="flex-shrink-0 font-ui text-2xs text-text-tertiary">Filter:</span>
          {calendars.map((cal) => {
            const active = selectedCalIds.includes(cal.id);
            const calColor = cal.color_override ?? cal.google_color_id ?? null;
            return (
              <button
                key={cal.id}
                type="button"
                onClick={() =>
                  setSelectedCalIds((prev) =>
                    active ? prev.filter((id) => id !== cal.id) : [...prev, cal.id],
                  )
                }
                className={cn(
                  "flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-ui text-2xs transition-colors",
                  active
                    ? "bg-accent-primary/10 border-accent-primary text-accent-primary"
                    : "border-border-subtle text-text-secondary hover:bg-surface-hover",
                )}
              >
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: calColor ?? "var(--text-disabled)" }}
                />
                {cal.name}
              </button>
            );
          })}
          {selectedCalIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedCalIds([])}
              className="ml-1 flex-shrink-0 font-ui text-2xs text-text-tertiary hover:text-text-primary"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="atlas-calendar flex flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="font-ui text-sm text-text-tertiary">Loading calendar…</p>
          </div>
        ) : (
          <BigCalendar
            localizer={localizer}
            events={rbcEvents}
            view={view}
            date={anchor}
            onNavigate={handleNavigate}
            onView={handleViewChange}
            onSelectEvent={(event: RBCEvent) => setSelectedEvent(event.resource)}
            onSelectSlot={handleSelectSlot}
            selectable
            popup
            toolbar={false}
            eventPropGetter={eventStyleGetter}
            components={{ event: CustomEventComponent }}
            style={{ flex: 1, minHeight: 0 }}
          />
        )}
      </div>

      <CalendarEventDetail
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onCreateTask={handleCreateTaskFromEvent}
      />

      <BlockTimeForm
        open={blockFormOpen}
        onClose={() => setBlockFormOpen(false)}
        defaultStart={blockFormStart}
        defaultEnd={blockFormEnd}
      />
    </div>
  );
}
