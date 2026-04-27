import { CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";
import { InspectorAffordance } from "@/components/shell/inspector-affordance";

export const metadata = { title: "Tasks — Atlas" };

export default function TasksPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={CheckSquare}
        title="Tasks — Coming in Wave 3"
        body="Your task list, projects, and inbox will live here. Full task management is coming in Wave 3."
        action={<InspectorAffordance />}
      />
    </div>
  );
}
