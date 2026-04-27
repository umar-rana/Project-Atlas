import { Users } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";
import { InspectorAffordance } from "@/components/shell/inspector-affordance";

export const metadata = { title: "CRM — Atlas" };

export default function CRMPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Users size={28} aria-hidden />}
        title="CRM — Coming in Wave 5"
        body="Your contacts, relationships, and interaction history will live here. Coming in Wave 5."
        action={<InspectorAffordance />}
      />
    </div>
  );
}
