import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";
import { InspectorAffordance } from "@/components/shell/inspector-affordance";

export const metadata = { title: "Journal — Atlas" };

export default function JournalPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={BookOpen}
        title="Journal — Coming in Wave 5"
        body="Your daily journal, reflections, and habits will live here. Coming in Wave 5."
        action={<InspectorAffordance />}
      />
    </div>
  );
}
