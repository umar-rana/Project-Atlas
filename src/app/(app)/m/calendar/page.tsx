import { Calendar } from "lucide-react";

export const metadata = { title: "Calendar — Atlas" };

export default function MobileCalendarPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Calendar</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 text-center">
        <Calendar size={36} className="text-text-tertiary" aria-hidden />
        <p className="font-ui text-base font-medium text-text-secondary">Coming in Wave 4</p>
        <p className="font-ui text-sm text-text-tertiary">
          Your calendar, events, and time-blocking features will live here.
        </p>
      </div>
    </div>
  );
}
