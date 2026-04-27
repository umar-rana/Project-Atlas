import { FileText } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";
import { InspectorAffordance } from "@/components/shell/inspector-affordance";

export const metadata = { title: "Notes — Atlas" };

export default function NotesPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<FileText size={28} aria-hidden />}
        title="Notes — Coming in Wave 4"
        body="Your notes, documents, and knowledge base will live here. Coming in Wave 4."
        action={<InspectorAffordance />}
      />
    </div>
  );
}
