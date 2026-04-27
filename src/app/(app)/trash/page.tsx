import { Trash2 } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";
import { InspectorAffordance } from "@/components/shell/inspector-affordance";

export const metadata = { title: "Trash — Atlas" };

export default function TrashPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Trash2 size={28} aria-hidden />}
        title="Trash is empty"
        body="Deleted items will appear here and be permanently removed after 30 days."
        action={<InspectorAffordance />}
      />
    </div>
  );
}
