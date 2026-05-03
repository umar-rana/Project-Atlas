export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  description: string;
  tags: ("new" | "improved" | "fixed")[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: "cl-2026-05-01",
    version: "1.4",
    date: "2026-05-01",
    title: "AI Capture gets smarter",
    description:
      "Quick Capture now understands multi-step inputs like \u201cemail Sarah about the proposal then follow up in a week\u201d \u2014 creating two linked tasks in one shot. Parsing accuracy for dates and contacts has also been significantly improved.",
    tags: ["improved"],
  },
  {
    id: "cl-2026-04-18",
    version: "1.3",
    date: "2026-04-18",
    title: "Changelog panel in Help Center",
    description:
      "You're looking at it! A new What's New section in the Help Center surfaces recent updates so you never miss a new feature. An unread badge on the Help icon lets you know when there's something fresh.",
    tags: ["new"],
  },
  {
    id: "cl-2026-04-10",
    version: "1.3",
    date: "2026-04-10",
    title: "Vault — drag-and-drop upload",
    description:
      "Drag files from your desktop directly onto the Vault page to upload them instantly. Multiple files can be dropped at once, and upload progress is shown inline.",
    tags: ["new"],
  },
  {
    id: "cl-2026-03-28",
    version: "1.2",
    date: "2026-03-28",
    title: "People — bulk contact import",
    description:
      "Import contacts from a CSV file directly into the People module. The importer maps columns automatically and flags duplicates before committing any changes.",
    tags: ["new"],
  },
  {
    id: "cl-2026-03-14",
    version: "1.2",
    date: "2026-03-14",
    title: "Calendar week view improvements",
    description:
      "The week view now shows task due-date indicators inline with calendar events, so your commitments and deadlines live in the same timeline. All-day events are displayed in a compact top strip.",
    tags: ["improved"],
  },
  {
    id: "cl-2026-02-28",
    version: "1.1",
    date: "2026-02-28",
    title: "Keyboard shortcut for Help Center",
    description:
      "Press ? anywhere in Atlas to open the Help Center instantly. The shortcut is documented on the Global Shortcuts reference page.",
    tags: ["new"],
  },
  {
    id: "cl-2026-02-14",
    version: "1.1",
    date: "2026-02-14",
    title: "Review view — stale-task threshold setting",
    description:
      "You can now configure how many days without an update before a task is considered stale. Head to Settings → Tasks to adjust the threshold.",
    tags: ["improved"],
  },
  {
    id: "cl-2026-01-30",
    version: "1.0",
    date: "2026-01-30",
    title: "Bug fixes & performance",
    description:
      "Fixed an issue where the command palette could return stale search results after a rename. Journal entry auto-save is now more reliable on slow connections. General rendering performance improvements across all modules.",
    tags: ["fixed"],
  },
];

export const CHANGELOG_LS_KEY = "atlas_changelog_last_seen";

export function getUnreadCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(CHANGELOG_LS_KEY);
  if (!raw) return CHANGELOG_ENTRIES.length;
  const lastSeen = new Date(raw).getTime();
  return CHANGELOG_ENTRIES.filter((e) => new Date(e.date).getTime() > lastSeen).length;
}

export function markChangelogRead(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHANGELOG_LS_KEY, new Date().toISOString());
}
