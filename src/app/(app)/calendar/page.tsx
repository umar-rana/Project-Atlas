"use client";

import dynamic from "next/dynamic";

const CalendarView = dynamic(() => import("./calendar-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-base">
      <p className="font-ui text-sm text-text-tertiary">Loading calendar…</p>
    </div>
  ),
});

export default function CalendarPage() {
  return <CalendarView />;
}
