import { BookOpen } from "lucide-react";

export const metadata = { title: "Journals — Atlas" };

export default function MobileJournalsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-4 pb-3 pt-4">
        <h1 className="font-ui text-xl font-semibold text-text-primary">Journals</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 text-center">
        <BookOpen size={36} className="text-text-tertiary" aria-hidden />
        <p className="font-ui text-base font-medium text-text-secondary">Coming in Wave 5</p>
        <p className="font-ui text-sm text-text-tertiary">
          Your daily journal, reflections, and habits will live here.
        </p>
      </div>
    </div>
  );
}
