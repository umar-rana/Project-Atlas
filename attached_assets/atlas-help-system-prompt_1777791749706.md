# Replit Agent Prompt — Atlas Help & Documentation System

## Context

Atlas is a personal productivity command center built on Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, tRPC v11, Prisma (Neon Postgres), and Clerk auth. The UI follows the Stratum design system — dark mode default, `--color-bg-*` / `--color-text-*` / `--color-accent-*` CSS tokens, JetBrains Mono for UI text.

This prompt adds two tightly integrated systems:

1. **Help Center** — a full-screen `/help` route with a browsable doc library and an AI-powered assistant
2. **Tooltip system** — a lightweight, consistent `<Hint>` component used contextually across Atlas wherever a user might need orientation

These are **not third-party plugins**. Build everything natively inside Atlas.

---

## Part 1 — Tooltip System (`<Hint>`)

### 1.1 Component: `components/ui/hint.tsx`

Build a `<Hint>` component that wraps Radix UI `@radix-ui/react-tooltip` (already available via shadcn/ui). This is the **only** tooltip primitive used across Atlas — never use raw `title=""` attributes or other tooltip libraries.

```tsx
// Usage examples
<Hint label="Quick capture" shortcut="C">
  <button>...</button>
</Hint>

<Hint label="Mark complete" shortcut="D" side="right">
  <IconButton>...</IconButton>
</Hint>

<Hint label="This field sets a real deadline. Leave blank if there's no hard due date." size="md">
  <InfoIcon />
</Hint>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | required | Main tooltip text |
| `shortcut` | `string` | — | Keyboard shortcut shown in a kbd chip |
| `side` | `"top" \| "right" \| "bottom" \| "left"` | `"top"` | Tooltip placement |
| `size` | `"sm" \| "md"` | `"sm"` | `sm` = single line, `md` = up to 3 lines, max-w-[220px] |
| `delayDuration` | `number` | `600` | Hover delay in ms |
| `disabled` | `boolean` | `false` | Disables tooltip entirely |
| `children` | `ReactNode` | required | The trigger element |

**Visual spec:**

- Background: `var(--color-bg-elevated)` with `border: 1px solid var(--color-border-subtle)`
- Text: `var(--color-text-secondary)`, font-size `11px`, font-family `var(--font-mono)`
- `shortcut` chip: `background: var(--color-bg-inset)`, `border: 1px solid var(--color-border-default)`, `border-radius: 4px`, `padding: 1px 5px`, `font-size: 10px`
- Arrow: small CSS arrow, same border colour
- `border-radius: 6px`, `padding: 6px 10px`
- Animate in: `fade-in` + `slide-up` (4px), 120ms ease-out
- No tooltip on touch devices (`@media (hover: none) { display: none }`)

### 1.2 Global provider

Wrap the Radix `TooltipProvider` once in `app/layout.tsx` (or the closest shared layout). Set `delayDuration={600}` and `skipDelayDuration={200}` at the provider level.

### 1.3 Where to place `<Hint>` across Atlas

Add `<Hint>` wrappers to the following existing elements. Do **not** change the underlying components — only wrap trigger elements:

**Module switcher (left sidebar icons)**
- Tasks icon → `label="Tasks" shortcut="⌘1"`
- Calendar icon → `label="Calendar" shortcut="⌘2"`
- CRM icon → `label="People" shortcut="⌘3"`
- Notes icon → `label="Notes" shortcut="⌘4"`
- Journal icon → `label="Journal" shortcut="⌘5"`
- Vault icon → `label="Vault" shortcut="⌘6"`
- Settings icon → `label="Settings"`
- Help icon (new — see Part 2) → `label="Help Center" shortcut="?"`

**Tasks module**
- Quick capture button → `label="Quick capture" shortcut="C"`
- New project button → `label="New project"`
- Mark complete checkbox → `label="Mark complete" shortcut="D"`
- Due date field → `label="Only set a due date if there's a real deadline" size="md"`
- Context picker → `label="Filter by context (@laptop, @phone, etc.)"`
- Inbox tab → `label="Everything unprocessed lands here"`
- Forecast tab → `label="7-day view of due tasks + calendar events"`
- Review tab → `label="Weekly GTD review — process, get current, get creative"`
- Waiting For context (if rendered) → `label="Tasks blocked on someone else"`

**Projects**
- Type field → `label="Free-form label: Goal, Initiative, Area, Learning…" size="md"`
- Status: Someday → `label="Removes from active list — review during Weekly Review" size="md"`

**Calendar**
- Time block drag handle → `label="Drag to reschedule"`
- Add time block button → `label="Schedule a task on your calendar"`

**CRM**
- Follow-up date field → `label="Creates a task in your Inbox automatically" size="md"`
- Last contacted field → `label="Update this after any meaningful interaction"`

**Notes**
- Purpose field → `label="Note type: Project Brief, Meeting Note, Reading Note, or Note" size="md"`
- Backlinks section header → `label="Other notes and entities that reference this one"`

**Journal**
- Prompt toggle → `label="Optional daily prompts — configure in Settings"`

**Global**
- Command palette trigger → `label="Command palette" shortcut="⌘K"`
- Search trigger → `label="Search" shortcut="⌘/"`
- Help icon in header/sidebar → `label="Help Center" shortcut="?"`

---

## Part 2 — Help Center

### 2.1 Route and file structure

```
app/
  help/
    page.tsx                    ← Full-screen layout, no module switcher
    layout.tsx                  ← Help-specific layout wrapper

components/
  help/
    help-shell.tsx              ← Root layout: sidebar + content area
    help-sidebar.tsx            ← Section nav, search, AI button
    help-article.tsx            ← Article renderer
    help-ai-chat.tsx            ← AI assistant panel
    help-search.tsx             ← Search input + results dropdown

lib/
  help/
    docs.ts                     ← All documentation content (typed)
    types.ts                    ← HelpSection, HelpArticle types
```

### 2.2 Navigation: keyboard shortcut

Pressing `?` anywhere in Atlas (when not in a text input) opens `/help` in a full-screen overlay (modal-style, not a new tab). Pressing `Esc` or `?` again dismisses it.

Register this in the global keyboard shortcut handler (wherever `C` for capture and `⌘K` for command palette are registered).

### 2.3 Help layout (`help-shell.tsx`)

```
┌─────────────────────────────────────────────────────┐
│  ╔══════════╗  ╔══════════════════════════════════╗  │
│  ║          ║  ║                                  ║  │
│  ║ SIDEBAR  ║  ║   CONTENT AREA                   ║  │
│  ║ 220px    ║  ║   (article or AI chat)           ║  │
│  ║          ║  ║                                  ║  │
│  ║          ║  ║                                  ║  │
│  ╚══════════╝  ╚══════════════════════════════════╝  │
└─────────────────────────────────────────────────────┘
```

- Full viewport height, no scrollbar on outer container
- Close button (×) top-right, returns to previous Atlas location
- Sidebar: `220px` fixed, `var(--color-bg-subtle)` background, `border-right: 1px solid var(--color-border-subtle)`
- Content area: scrollable independently

### 2.4 Sidebar (`help-sidebar.tsx`)

**Top section:**
- Atlas "A" logomark (28px, accent blue) + "Help Center" label
- Search input (`<HelpSearch />`) — searches titles and content

**Navigation:**
Sections listed as collapsible groups. Active section expands to show article list. Active article highlighted with left accent border.

Sections and articles (match exactly):

```
◈  Getting Started
   ├─ What is Atlas?
   ├─ Core Concepts
   └─ First 10 Minutes

✦  Tasks
   ├─ Inbox & Capture
   ├─ Projects
   ├─ Contexts
   ├─ Forecast View
   └─ Weekly Review

⬡  Calendar
   ├─ Overview
   └─ Time Blocking

◎  People (CRM)
   ├─ Overview
   └─ Contacts & Follow-ups

▣  Notes
   ├─ Overview
   └─ Note Types & Linking

◇  Journal
   └─ Daily Entry

□  Vault
   └─ Drive Backup

✦  AI Features
   └─ Capture Parsing

⌥  Reference
   ├─ Keyboard Shortcuts
   └─ Syntax Reference
```

**Bottom section:**
- "Ask AI" button — switches content area to AI chat mode
- Version label: "Atlas Help · v1.0"

### 2.5 Article renderer (`help-article.tsx`)

Renders Markdown-like content from `docs.ts`. Support these elements:

- `h1` — article title (rendered from `article.title`, not in content body)
- `h3` — section heading within article (prefixed with `**` in content → styled heading)
- Paragraphs
- Unordered lists (`-` prefixed lines)
- Ordered lists (`1.` prefixed lines)
- Inline code (backtick) → styled with mono font, `var(--color-bg-inset)` background
- Tables (pipe-delimited) → clean borderless table, header row distinguished
- Bold (`**text**`) and italic (`_text_`)
- **"Next article" card** at bottom — navigates to the next article in section, or first article of next section

Styling:
- Body text: `var(--color-text-secondary)`, `14px`, line-height `1.8`
- Headings: `var(--color-text-primary)`, `12px`, uppercase, letter-spacing `0.06em`
- Code: `var(--font-mono)`, `11px`
- Tables: `width: 100%`, alternating row backgrounds using `var(--color-bg-subtle)` / transparent
- Max content width: `660px`, left-aligned within the content area

### 2.6 Search (`help-search.tsx`)

- Input in sidebar, `⌘F` focuses it when Help Center is open
- Searches across all article titles and body content
- Results appear as a dropdown below the input (max 6 results)
- Each result shows: article title + section name
- Clicking a result navigates to that article and closes the dropdown
- No results state: "Nothing found for [query]"

### 2.7 AI Chat (`help-ai-chat.tsx`)

Activated by clicking "Ask AI" in the sidebar. Replaces the article content area (sidebar stays visible).

**Layout:**
- Message list (scrollable, flex-col)
- Input bar pinned to bottom

**Behaviour:**
- Calls `/api/help/chat` (tRPC procedure or plain Next.js route handler — choose whatever is simpler given Atlas's existing API pattern)
- Sends: `{ messages: ChatMessage[], query: string }`
- The API route calls Anthropic claude-haiku-3 (same model used for AI capture parsing — keep consistency)
- System prompt includes the full documentation corpus (imported from `lib/help/docs.ts` as a string)
- Streams the response using Anthropic streaming SDK; display tokens as they arrive
- Conversation is session-local only — no persistence to DB
- "Clear" button resets the conversation

**Suggested prompts (shown when conversation is empty):**
- "How do I process my Inbox?"
- "What's the difference between Today and Forecast?"
- "How do I link to a contact in a task?"
- "How does Drive backup work?"
- "What keyboard shortcuts should I know?"

**Visual:**
- User messages: right-aligned, `var(--color-bg-elevated)` bubble
- Assistant messages: left-aligned, `var(--color-bg-subtle)` bubble, small ✦ avatar
- Loading state: three-dot pulse animation
- Inline code in responses: same style as article renderer

### 2.8 API route: `app/api/help/chat/route.ts`

```ts
// POST /api/help/chat
// Body: { messages: { role: "user" | "assistant", content: string }[], query: string }
// Streams Anthropic response

import Anthropic from "@anthropic-ai/sdk";
import { HELP_DOCS_CORPUS } from "@/lib/help/docs";

const SYSTEM_PROMPT = `You are the Atlas Help Assistant...` // see section 2.9

export async function POST(req: Request) {
  const { messages } = await req.json();
  const client = new Anthropic(); // uses ANTHROPIC_API_KEY from env
  
  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT + "\n\n---\n\n" + HELP_DOCS_CORPUS,
    messages,
  });

  // Return as ReadableStream for streaming response
  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

### 2.9 System prompt for AI assistant

```
You are the Atlas Help Assistant — an expert on Atlas, a personal productivity command center.

Atlas follows GTD (Getting Things Done) principles. Its modules are: Tasks (Inbox, Projects, Contexts, Forecast, Weekly Review), Calendar (Google Calendar sync + time blocking), People/CRM (personal relationship intelligence), Notes (personal wiki with bidirectional links), Journal (daily reflection), and Vault (file storage with Drive backup).

Cross-module syntax: @name → People contact, #tag → free-form tag, [[entity]] → link to Project or Note, / → command palette.

Core philosophy:
- The Inbox is a capture point, not a to-do list. Process it; don't live in it.
- Projects = any outcome requiring more than one action
- Contexts = environmental filters (@laptop, @phone, @errands), not priority levels
- Due dates = real deadlines only. If it doesn't have a hard deadline, leave it blank.
- The Weekly Review is the most important habit in the system.

Answer questions about Atlas concisely and precisely. Use short paragraphs. Never invent features that don't exist. If something isn't in Atlas, say so directly and suggest the closest alternative.
```

---

## Part 3 — Documentation content (`lib/help/docs.ts`)

Create this file with the full documentation corpus typed as a structured object. Use the content below exactly — do not paraphrase or summarise.

### Type definitions (`lib/help/types.ts`)

```ts
export interface HelpArticle {
  id: string;
  title: string;
  content: string; // markdown-like string
}

export interface HelpSection {
  id: string;
  label: string;
  icon: string;
  articles: HelpArticle[];
}
```

### Content for `lib/help/docs.ts`

```ts
export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: "◈",
    articles: [
      {
        id: "what-is-atlas",
        title: "What is Atlas?",
        content: `Atlas is your personal command center — a single application that unifies task management, calendar, relationships, knowledge, and reflection.

Most productivity apps ask you to live in one module. Atlas connects them. A task can link to a note. A note can reference a person. A person can have a follow-up scheduled on your calendar.

**Atlas is opinionated**
It follows GTD principles for tasks, treats your relationships as data worth caring for, and believes daily writing compounds in ways nothing else does.

**Atlas is yours**
There are no seats, no sharing permissions, no collaborative editing. Designed for one person who wants to think clearly and work deliberately.`
      },
      {
        id: "core-concepts",
        title: "Core Concepts",
        content: `**The Inbox is Sacred
Everything you capture goes to Inbox first. It is a collection point, not a to-do list. Never act on items immediately — capture first, process later during Review.

**Projects are Containers, Not Tasks
A Project is any outcome requiring more than one action. "Write proposal" is a project. "Send email to Sara" is a task. This distinction is foundational to GTD.

**Contexts Filter by Environment
A Context answers: "What do I need available to do this?" Examples: @laptop, @phone, @errands, @deep-work. Contexts are not priority levels — they are environmental filters.

**Cross-Module Syntax
- @name → links to a People/CRM contact
- #tag → applies a free-form tag
- [[Title]] → links to a Project or Note
- / → opens the command palette (works in any text field)`
      },
      {
        id: "first-10-minutes",
        title: "First 10 Minutes",
        content: `**Step 1 — Brain dump (5 min)
Open Inbox. Type every open loop in your head — work, personal, errands, half-formed ideas. Don't organise. Aim for 20–40 items.

**Step 2 — Create your first Project (2 min)
Pick one multi-step item from your capture. Click "New Project," give it a name and Type. Move relevant tasks into it.

**Step 3 — Set up one Context (1 min)
Tasks → Contexts → +. Create one context that matches your most common working mode: @deep-work, @laptop, or @phone. Tag 3–5 tasks.

**Step 4 — Write your first Journal entry (2 min)
Open Journal → Today. Write 2–3 sentences about what you want to accomplish. This 2-minute habit compounds.

You're ready. Process your full Inbox during your first Weekly Review.`
      }
    ]
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "✦",
    articles: [
      {
        id: "inbox-capture",
        title: "Inbox & Capture",
        content: `**Quick capture
Press C anywhere in Atlas (when not in a text field) to open the capture bar. Type your task and press Enter — it lands in Inbox.

**Processing the Inbox
For each item, ask: Is this actionable?
- No → Archive it, convert to a Note, or delete
- Yes, takes less than 2 min → Do it now, mark complete
- Yes, takes longer → Assign to a Project, set a Context, optionally set a due date

**The due date rule
A due date is a commitment, not a preference. Only set one if there is a real external deadline. Tasks without due dates appear in Project and Context views — they do not get lost.`
      },
      {
        id: "projects",
        title: "Projects",
        content: `**Creating a project
Click + in the Projects section of the sidebar, or use /new project in the command palette.

**Project fields
- Name — what outcome you are trying to achieve
- Type — free-form label: Goal, Initiative, Area, Learning, or anything you define
- Status — Active, Someday/Maybe, On Hold, or Completed
- Notes — rich text, supports full @, #, [[]] syntax

**Sidebar grouping
Projects group automatically by Type. Three "Goal" projects appear under a "Goal" heading. The grouping is dynamic — no manual sorting required.

**Header metrics
The project header shows factual counts only: total tasks, completed tasks, last updated date. No progress percentages unless you attach a Tracker Table that explicitly provides the metric.

**Someday / Maybe
Set Status: Someday to remove a project from your active list without deleting it. Review Someday projects during Weekly Review to decide if any should be activated.`
      },
      {
        id: "contexts",
        title: "Contexts",
        content: `**What contexts are
Contexts filter your task list by the environment or resources you need. They answer: what do I need available to complete this?

**Creating a context
Tasks → Contexts → +. Name it with @ prefix: @laptop, @phone, @errands, @waiting, @deep-work.

**The @waiting context
Use @waiting for tasks delegated to someone else or blocked on external input. Reviewing @waiting during Weekly Review ensures nothing falls through the cracks.

**Applying contexts
Type @contextname in any task's notes field, or use the Context picker in the task detail panel.`
      },
      {
        id: "forecast",
        title: "Forecast View",
        content: `Forecast shows a 7-day rolling view combining tasks with due dates, Google Calendar events, and scheduled time blocks.

**Today vs Tomorrow
- Today — tasks due today, overdue tasks, and tasks you have manually flagged "do today"
- Tomorrow — same logic shifted one day forward; useful for end-of-day planning

**What appears in Forecast
Only tasks with an explicit due date appear in Forecast. Tasks without a due date live in Project and Context views — they do not disappear.`
      },
      {
        id: "weekly-review",
        title: "Weekly Review",
        content: `The Weekly Review is the most important habit in GTD. Without it, the system loses trust and stops working. Atlas's Review view walks you through a structured checklist.

**Step 1 — Get Clear
Process Inbox to zero. Collect any stray notes, business cards, or open loops from the week.

**Step 2 — Get Current
Review Next Actions by each Context. Review Calendar — the past week and the next two weeks. Review your @waiting list.

**Step 3 — Get Creative
Review Someday/Maybe projects — activate any that are now relevant. Review all active Projects. Capture any new ideas or commitments.

**Recommended cadence
Sunday evening, 30–45 minutes. Block it as a recurring event in Calendar using Atlas time-blocking.`
      }
    ]
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "⬡",
    articles: [
      {
        id: "calendar-overview",
        title: "Calendar Overview",
        content: `The Calendar module gives you a unified view of your time — external calendar events alongside Atlas time blocks.

**Connecting calendars
Settings → Integrations → Google Calendar → Authorise. All calendars on your Google account appear; toggle which ones show in Atlas.

**Sync direction
Atlas syncs Google Calendar read-only. Atlas does not write to Google Calendar. Time blocks you create in Atlas are stored in Atlas only.

**Views
Day view, Week view (default), and a 4-week overview.`
      },
      {
        id: "time-blocking",
        title: "Time Blocking",
        content: `Time blocking lets you drag tasks from your task list onto your calendar to schedule exactly when you will do them.

**Creating a time block
1. Open Forecast or Today view
2. Drag a task onto a time slot in the Calendar panel on the right
3. The task is now scheduled — it appears in Forecast at that time

**Editing a block
Click the block to edit its duration, move it to a different slot, or remove the schedule entirely.

**Philosophy
Calendar time is your most constrained resource. Time blocking is not about filling every hour — it is about making intentional commitments about when specific work happens.`
      }
    ]
  },
  {
    id: "people",
    label: "People",
    icon: "◎",
    articles: [
      {
        id: "crm-overview",
        title: "People Overview",
        content: `The People module is personal relationship intelligence — not a sales pipeline. It tracks the people who matter to you: colleagues, mentors, clients, friends, family.

The core question Atlas's People module answers: who have I not spoken to in a while who I should reach out to?

**Data source
Atlas syncs with Google Contacts as the base layer. You enrich contacts with Atlas-specific fields that Google Contacts does not support.`
      },
      {
        id: "contacts",
        title: "Contacts & Follow-ups",
        content: `**Atlas contact fields
- Name, email, phone — synced from Google Contacts
- Company and role — editable in Atlas
- Relationship type — Colleague, Mentor, Client, Friend, Family
- Last contacted — manually updated, or auto-detected when you reference the contact in a Journal entry
- Follow-up date — automatically creates a task in your Inbox with the contact linked
- Notes — rich text, supports @, #, [[]] syntax

**Linking from other modules
Type @PersonName in any task note, project description, or journal entry to create a live link to that contact's record. The link appears in the contact's activity history.

**Relationship health
Atlas surfaces contacts you have not interacted with recently, based on their relationship type and a configurable cadence. A mentor might have a 30-day cadence; a close colleague, 7 days.`
      }
    ]
  },
  {
    id: "notes",
    label: "Notes",
    icon: "▣",
    articles: [
      {
        id: "notes-overview",
        title: "Notes Overview",
        content: `Notes is Atlas's knowledge layer — typed documents that form a personal wiki. Notes are flat (no nested hierarchy) but organised with folders and connected through bidirectional links.

**Structure
- Notes live in Folders (by area: Devsinc, Personal, TGC, etc.)
- Every note has a Purpose field that classifies its role
- Notes link to each other and to Projects and Contacts using [[]] syntax`
      },
      {
        id: "note-types",
        title: "Note Types & Linking",
        content: `**Purpose field
Every note has a Purpose that categorises its role:
- Note (default) — general thinking, research, ideas
- Project Brief — background and context for a specific Project
- Meeting Note — record from a meeting, linked to @attendees
- Reading Note — highlights and thoughts from a book or article

Purpose is not the same as folder. Purpose is a semantic label. Folders organise notes by area.

**Linking to entities
Use [[EntityName]] to link from a Note to any Project, other Note, or Contact. This creates a bidirectional link — you can navigate from either end.

**Backlinks
At the bottom of any Note, Atlas shows all other notes and entities that link to it. This is how a flat note system becomes a knowledge graph.`
      }
    ]
  },
  {
    id: "journal",
    label: "Journal",
    icon: "◇",
    articles: [
      {
        id: "daily-entry",
        title: "Daily Journal",
        content: `Journal is your daily reflection space — private, chronological, and minimal. One entry per day, rich text, optional prompts.

**Opening today's entry
Journal opens to today automatically. If no entry exists for today, a blank editor appears with optional prompts.

**Configurable prompts
Settings → Journal → Prompts. Options include:
- What are my top 3 priorities today?
- What am I grateful for?
- End of day: What did I accomplish? What is tomorrow's most important task?

**Privacy
Journal entries are stored in your Postgres database and are not synced to any third-party service. If Drive backup is enabled, entries are included in the export.

**Linking
Use @, #, and [[]] syntax in journal entries. Referencing a Contact or Project in your journal creates a link that appears in that entity's activity history.`
      }
    ]
  },
  {
    id: "vault",
    label: "Vault",
    icon: "□",
    articles: [
      {
        id: "drive-backup",
        title: "Drive Backup",
        content: `Vault is Atlas's file and backup module. The Drive backup feature exports your Atlas data to Google Drive on a schedule.

**What is backed up
- All tasks and project data (JSON)
- All notes (as individual Markdown files)
- Journal entries (as individual Markdown files)
- CRM contact notes

**Backup behaviour
- One-way: Atlas exports to Drive; Drive does not sync back to Atlas
- Runs hourly, overwrites the single current backup file
- Google Drive is a safety net. Your Postgres database is the system of record.

**Enabling backup
Settings → Integrations → Google Drive → Authorise → Enable hourly backup.`
      }
    ]
  },
  {
    id: "ai",
    label: "AI Features",
    icon: "✦",
    articles: [
      {
        id: "capture-parsing",
        title: "AI Capture Parsing",
        content: `Atlas uses Claude Haiku to parse natural language captures into structured task fields.

**How it works
Type a natural language task in the capture bar, e.g.: "Call Ahsan tomorrow at 3pm about the Pinnacle billing decision"

Atlas parses this into:
- Title: Call Ahsan
- Due date: tomorrow, 3:00 PM
- People link: @Ahsan (if Ahsan exists in your CRM)
- Note: about the Pinnacle billing decision

**Accepting suggestions
After parsing, Atlas shows the suggested fields. Click Accept to apply them all, or edit any field before accepting. You are always in control — the AI suggests, you decide.`
      }
    ]
  },
  {
    id: "reference",
    label: "Reference",
    icon: "⌥",
    articles: [
      {
        id: "keyboard-shortcuts",
        title: "Keyboard Shortcuts",
        content: `**Global
- C — Quick capture (when not in a text field)
- ⌘K — Command palette
- ⌘/ — Search
- ? — Open Help Center
- Esc — Cancel or close panel

**Navigation
- ⌘1 — Tasks
- ⌘2 — Calendar
- ⌘3 — People
- ⌘4 — Notes
- ⌘5 — Journal
- ⌘6 — Vault

**Task actions
- E — Edit selected item
- D — Mark task complete
- ⌘↵ — Save and close`
      },
      {
        id: "syntax-reference",
        title: "Syntax Reference",
        content: `**Linking syntax (works in all text fields)
- @Name — links to a People/CRM contact
- #tag — applies a free-form tag
- [[Title]] — links to a Project or Note
- / — opens the command palette

**Markdown (Notes and Journal)
- **bold** — bold text
- _italic_ — italic text
- \`code\` — inline code
- - [ ] — checkbox
- ## Heading — section heading
- | col | col | — table`
      }
    ]
  }
];

// Flat corpus string for AI assistant context
export const HELP_DOCS_CORPUS = HELP_SECTIONS
  .flatMap(section =>
    section.articles.map(article =>
      `## ${article.title}\n\n${article.content}`
    )
  )
  .join("\n\n---\n\n");
```

---

## Part 4 — Help trigger in the UI

### 4.1 Add Help icon to module switcher

In the left module switcher (wherever Tasks, Calendar, CRM, Notes, Journal, Vault icons live), add a Help icon at the **bottom** of the icon list, separated from the module icons by a divider.

- Icon: a `?` glyph or a `CircleHelp` icon from lucide-react
- Wrapped in `<Hint label="Help Center" shortcut="?">`
- Clicking it opens the Help Center overlay (same as pressing `?`)
- Visual state: active (highlighted) when Help Center is open

### 4.2 Help overlay behaviour

The Help Center renders as a fixed overlay above the main Atlas layout, not a separate page navigate. This allows pressing Esc to return to where the user was without losing state.

```tsx
// In the root layout or AppShell
{helpOpen && (
  <div className="fixed inset-0 z-50 bg-[var(--color-bg-base)]">
    <HelpShell onClose={() => setHelpOpen(false)} />
  </div>
)}
```

Store `helpOpen` in a Zustand slice (e.g., `useUIStore`) so any component can trigger it.

---

## Part 5 — Constraints and quality bars

1. **No new dependencies** beyond what Atlas already uses. Radix Tooltip is already available via shadcn/ui. The Anthropic SDK is already installed for AI capture parsing.

2. **Tooltip placement must not clip viewport.** Radix handles this automatically via `avoidCollisions` — ensure it is enabled.

3. **Help Center must open in under 150ms.** All documentation content is static (no API fetch required). The AI chat is the only async operation.

4. **The AI chat route must not block the UI.** Use streaming response. Display tokens as they arrive.

5. **Mobile:** The `<Hint>` component must not render on touch devices. Use `@media (hover: none) { display: none }` on the tooltip content. The Help Center should be accessible but sidebar can collapse to icon-only on viewports under 768px.

6. **Accessibility:**
   - All `<Hint>` triggers must have `aria-describedby` pointing to the tooltip content
   - Help Center must be keyboard navigable (tab through sidebar items, arrow keys within article list)
   - Close button must be focusable and labeled `aria-label="Close Help Center"`

7. **Do not modify** any existing module components beyond adding `<Hint>` wrappers at trigger points. This is additive only.

---

## Summary of files to create or modify

| File | Action |
|------|--------|
| `components/ui/hint.tsx` | **Create** — tooltip primitive |
| `app/layout.tsx` | **Modify** — add `TooltipProvider` and `helpOpen` state |
| `lib/help/types.ts` | **Create** — HelpSection, HelpArticle types |
| `lib/help/docs.ts` | **Create** — full documentation corpus |
| `app/help/page.tsx` | **Create** — help route entry point |
| `app/help/layout.tsx` | **Create** — help layout wrapper |
| `components/help/help-shell.tsx` | **Create** — root shell layout |
| `components/help/help-sidebar.tsx` | **Create** — section nav + search + AI button |
| `components/help/help-article.tsx` | **Create** — article renderer |
| `components/help/help-ai-chat.tsx` | **Create** — AI assistant panel |
| `components/help/help-search.tsx` | **Create** — search input + dropdown |
| `app/api/help/chat/route.ts` | **Create** — streaming Anthropic API route |
| `store/ui-store.ts` | **Modify** — add `helpOpen` boolean + `setHelpOpen` action |
| Global keyboard handler | **Modify** — register `?` shortcut → toggle help |
| Module switcher component | **Modify** — add Help icon + Hint wrappers to all icons |
| Tasks module components | **Modify** — add Hint wrappers at specified trigger points |
| Calendar, CRM, Notes, Journal components | **Modify** — add Hint wrappers at specified trigger points |

---

## Final note

The tooltip system and help center are infrastructure, not features. The `<Hint>` component should be usable everywhere in Atlas going forward — when building new modules or new UI elements, always ask: does a first-time user need orientation here? If yes, add a Hint.

The AI assistant in the help center uses the same Anthropic integration that powers capture parsing. Keep the model consistent: `claude-haiku-4-5-20251001`. The help assistant does not need Sonnet-level reasoning — it needs speed and directness.

Begin with Part 1 (the `<Hint>` component and `TooltipProvider` wiring), then Part 3 (documentation content), then Parts 2 and 4 (Help Center shell and routing). This order means the tooltip system is testable independently before the full Help Center is built.
