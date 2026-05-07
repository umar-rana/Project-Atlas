"use client";

import * as React from "react";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { CalendarEventDetail } from "./calendar-event-detail";

function calColorFill(event: {
  calendar?: { google_color_id: string | null; color_override: string | null } | null;
  source: string;
}): string {
  if (event.source === "atlas") return "cal-1";
  if (event.calendar?.color_override) return event.calendar.color_override;
  if (event.calendar?.google_color_id) return `cal-${event.calendar.google_color_id}`;
  return "cal-1";
}

function formatEventTime(start: Date | string, allDay: boolean): string {
  if (allDay) return "All day";
  const d = new Date(start);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function TodayEventsWidget() {
  const { data: events = [], isLoading } = trpc.calendar.events.today.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });

  const [selectedEvent, setSelectedEvent] = React.useState<(typeof events)[0] | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-ui text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          <Calendar size={12} />
          Today
        </h3>
        <Link href="/calendar" className="font-ui text-2xs text-accent-primary hover:underline">
          View calendar →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <span className="font-ui text-xs text-text-disabled">Loading…</span>
        </div>
      ) : events.length === 0 ? (
        <p className="py-3 text-center font-ui text-sm text-text-disabled">No events today.</p>
      ) : (
        <div className="space-y-1">
          {events.map((event: (typeof events)[0]) => {
            const color = calColorFill(event as typeof event & { source: string });
            return (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <span
                  className={cn("h-2 w-2 flex-shrink-0 rounded-full")}
                  style={{ background: `var(--${color}-fill)` }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate font-ui text-sm font-medium text-text-primary",
                      event.status === "cancelled" && "text-text-disabled line-through",
                    )}
                  >
                    {event.title || "(No title)"}
                  </p>
                  <p className="font-ui text-2xs text-text-tertiary">
                    {formatEventTime(event.start_at, event.all_day)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <CalendarEventDetail
        event={selectedEvent as Parameters<typeof CalendarEventDetail>[0]["event"]}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
