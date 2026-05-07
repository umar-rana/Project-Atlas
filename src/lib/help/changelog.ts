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
  {
    id: "cl-2026-01-10",
    version: "1.0",
    date: "2026-01-10",
    title: "Forecast range syncs to your account",
    description:
      "The date range you choose for the Forecast view is now saved to your account and follows you across browsers and devices. No more resetting it every session.",
    tags: ["improved"],
  },
  {
    id: "cl-2025-12-20",
    version: "0.9",
    date: "2025-12-20",
    title: "Google sign-in & Clerk auth",
    description:
      "You can now sign in to Atlas with your Google account. Authentication is now powered by Clerk, bringing improved session security, multi-device support, and a smoother login experience.",
    tags: ["new", "improved"],
  },
  {
    id: "cl-2025-12-05",
    version: "0.9",
    date: "2025-12-05",
    title: "App shell — two-pane layout & command palette",
    description:
      "The main app shell has been rebuilt with a persistent two-pane layout, a module switcher rail, a top bar, and a searchable command palette (⌘K). Navigation between Tasks, Notes, Calendar, Journals, Vault, and People is now instant.",
    tags: ["new"],
  },
  {
    id: "cl-2025-11-14",
    version: "0.8",
    date: "2025-11-14",
    title: "Email-to-inbox capture",
    description:
      "Forward any email to your personal Atlas inbox address and it will appear as a capture ready to accept as a task. The full email body, subject, and sender are preserved, and attachments are linked automatically.",
    tags: ["new"],
  },
  {
    id: "cl-2025-11-01",
    version: "0.8",
    date: "2025-11-01",
    title: "Sender blocklist with wildcard support",
    description:
      "Block unwanted senders from cluttering your email inbox. Blocklist patterns support wildcards (e.g. *@newsletter.example.com) to silence entire domains at once. Manage the list from the email inbox settings.",
    tags: ["new"],
  },
  {
    id: "cl-2025-10-18",
    version: "0.8",
    date: "2025-10-18",
    title: "Three-tier capture parsing pipeline",
    description:
      "Quick Capture now runs a local NLP parser first (instant, no AI cost), only calling Claude Haiku when confidence is low. A parse-source badge in the capture inbox shows whether AI or local parsing was used, along with a confidence score.",
    tags: ["new", "improved"],
  },
  {
    id: "cl-2025-09-26",
    version: "0.7",
    date: "2025-09-26",
    title: "Attachments — image thumbnails & task uploads",
    description:
      "Attach files directly from the task detail panel. Images generate thumbnails automatically and display inline. All attachments are stored securely in Cloudflare R2 and are accessible from the Vault.",
    tags: ["new"],
  },
  {
    id: "cl-2025-09-05",
    version: "0.7",
    date: "2025-09-05",
    title: "AI usage & spending dashboard",
    description:
      "A new /usage page shows a time-series chart of your AI spending broken down by model (Haiku, Sonnet, Opus) and day. Set a monthly budget cap in Settings → AI to get notified before you overspend.",
    tags: ["new"],
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
