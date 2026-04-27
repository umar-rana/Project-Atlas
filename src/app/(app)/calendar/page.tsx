import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";
import { InspectorAffordance } from "@/components/shell/inspector-affordance";

export const metadata = { title: "Calendar — Atlas" };

export default function CalendarPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Calendar size={28} aria-hidden />}
        title="Calendar — Coming in Wave 4"
        body="Your calendar, events, and time-blocking features will live here. Coming in Wave 4."
        action={<InspectorAffordance />}
      />
    </div>
  );
}
