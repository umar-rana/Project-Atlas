import { FileText } from "lucide-react";

export const metadata = { title: "Notes — Atlas" };

export default function MobileNotesPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Notes</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 text-center">
        <FileText size={36} className="text-text-tertiary" aria-hidden />
        <p className="font-ui text-base font-medium text-text-secondary">Coming in Wave 4</p>
        <p className="font-ui text-sm text-text-tertiary">
          Your notes, documents, and knowledge base will live here.
        </p>
      </div>
    </div>
  );
}
