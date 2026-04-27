import { FolderArchive } from "lucide-react";
import { EmptyState } from "@/components/composed/empty-state";

export const metadata = { title: "Documents — Atlas" };

export default function DocumentsPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<FolderArchive size={28} aria-hidden />}
        title="Documents — Coming in Phase 2"
        body="Personal document archive — receipts, contracts, IDs, and important files. Documents created in Notes and other modules will flow here for long-term storage. Coming in Phase 2."
      />
    </div>
  );
}
