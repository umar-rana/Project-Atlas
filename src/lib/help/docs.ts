import { BookOpen, CheckSquare, CalendarDays, Users, FileText, BookMarked, FolderOpen, Keyboard, Sparkles } from "lucide-react";
import type { HelpSection } from "./types";

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: BookOpen,
    articles: [
      {
        id: "interface-tour",
        title: "The Interface",
        content: `**The Interface**

Atlas is organized around a left-hand module switcher, a top bar, and a main content area.

**Module Switcher**

The vertical icon bar on the far left lets you switch between modules. Each module has a keyboard shortcut:

| Module | Shortcut |
|--------|----------|
| Tasks | \`⌘1\` |
| Calendar | \`⌘2\` |
| People | \`⌘3\` |
| Notes | \`⌘4\` |
| Journals | \`⌘5\` |
| Vault | \`⌘6\` |

At the bottom of the module switcher you'll find the Media inbox, Trash, and the Help Center (?) button.

**Top Bar**

The top bar contains:
- **Command Palette** button — search everything with \`⌘K\`
- **Quick Capture** button — capture anything with \`⌘⇧I\`
- **Theme toggle** — switch between light and dark mode
- **Help menu** — access Help Center and keyboard shortcuts
- **User menu** — account settings and sign out

**Main Content Area**

The main content area changes based on the active module. Most modules follow a two-column layout:
- **Left sidebar** — navigation, filters, and list views
- **Right pane** — detail view for the selected item`,
      },
      {
        id: "what-is-atlas",
        title: "What is Atlas?",
        content: `**What is Atlas?**

Atlas is a unified productivity workspace that brings together tasks, calendar, contacts, notes, journals, and vault storage into a single coherent system. It's designed around the principles of Getting Things Done (GTD) and personal knowledge management.

Unlike tools that require you to constantly switch context between apps, Atlas keeps everything connected — your tasks reference your notes, your calendar integrates with your projects, and your contacts link to your follow-up tasks.

**Core Modules**

- **Tasks** — Capture, organize, and review all your commitments using Inbox, Forecast, and Review workflows
- **Calendar** — Block time and visualize your week alongside your task commitments
- **People** — Manage your contacts and follow-up touchpoints in a lightweight CRM
- **Notes** — Write long-form content with rich text, backlinks, and project associations
- **Journals** — Maintain a daily reflection practice with prompted entries
- **Vault** — Store and organize files, images, and attachments

**The Atlas Philosophy**

Atlas is built on the belief that your productivity system should be invisible — it should get out of your way and let you focus on doing the actual work. Everything in Atlas is designed to be fast, keyboard-driven, and distraction-free.`,
      },
      {
        id: "quick-capture",
        title: "Quick Capture",
        content: `**Quick Capture**

Quick Capture is the fastest way to get something out of your head and into Atlas. Press \`⌘⇧I\` from anywhere in the app to open the capture panel.

**How it works**

Type anything naturally — Atlas uses AI to parse your input and route it to the right place:

- "Call Sarah tomorrow at 3pm" → Creates a task with a due date and contact link
- "Buy groceries this weekend" → Creates a task scheduled for the weekend
- "Project kickoff meeting on Friday" → Creates a calendar event

**Tips for effective capture**

- Don't overthink it — just dump the thought and let Atlas figure out the structure
- You can always edit the parsed result before saving
- Use the Inbox to review and process captured items during your daily review

**Keyboard shortcut**

| Action | Shortcut |
|--------|----------|
| Open Quick Capture | \`⌘⇧I\` |
| Confirm capture | \`Enter\` |
| Cancel | \`Esc\` |`,
      },
    ],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    articles: [
      {
        id: "inbox-forecast-review",
        title: "Inbox, Forecast & Review",
        content: `**Inbox, Forecast & Review**

The Tasks module is organized around three core views that map to the GTD workflow:

**Inbox**

Your inbox is the catch-all for everything you've captured but haven't processed yet. Items land here from Quick Capture, email forwarding, and direct entry.

During your daily review, process each item by:
- Assigning it to a project
- Setting a due date or deferring it
- Delegating it to someone else (mark as Waiting For)
- Deleting it if it's no longer relevant

**Forecast**

The Forecast view shows your tasks organized by due date, giving you a clear picture of what's coming up. It displays:
- Overdue items (highlighted in red)
- Today's tasks
- Upcoming tasks for the next 7 days
- A calendar integration showing scheduled events alongside tasks

**Review**

The Review view surfaces everything that needs your attention:
- Stale tasks that haven't been updated recently
- Projects without a next action
- Waiting For items that may need a follow-up

**Switching views**

| View | Shortcut |
|------|----------|
| Inbox | \`I\` |
| Forecast | \`F\` |
| Review | \`R\` |`,
      },
      {
        id: "projects-contexts",
        title: "Projects & Contexts",
        content: `**Projects & Contexts**

**Projects**

A project in Atlas is any outcome that requires more than one action step. Projects help you group related tasks and track progress toward a goal.

To create a project:
1. Open the Tasks module
2. Click "New project" or press \`⌘N\`
3. Give it a name and optional description
4. Assign tasks to it from the task detail panel

**Project types**

- **Active** — Projects you're currently working on
- **Someday** — Projects you want to do eventually but aren't actively working on
- **Waiting** — Projects blocked on something external

**Contexts**

Contexts help you organize tasks by where or how you'll do them. Common contexts include:
- \`@home\` — Tasks you can only do at home
- \`@office\` — Tasks requiring you to be at work
- \`@errands\` — Things to do while out and about
- \`@waiting\` — Tasks waiting on someone else

Use the context picker in the task detail panel to assign contexts. You can filter your task list by context to focus on what's actionable right now.`,
      },
      {
        id: "waiting-for",
        title: "Waiting For",
        content: `**Waiting For**

The Waiting For context is a special designation for tasks you've delegated or that are blocked on someone else's action.

**When to use Waiting For**

Use it whenever you're waiting on:
- A response from a colleague
- A deliverable from a vendor
- An approval from a manager
- External information you need before proceeding

**How to mark something as Waiting For**

1. Open the task detail panel
2. Click the Context field
3. Select "Waiting For" from the dropdown
4. Optionally add a note about who you're waiting on

**Following up**

The Review view surfaces all your Waiting For items. During your weekly review, go through these and decide:
- Is this still relevant?
- Has enough time passed to send a follow-up?
- Should you escalate or find another path forward?

**Best practice**

When you delegate something, immediately create a Waiting For task so you never lose track of open loops with others.`,
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    articles: [
      {
        id: "time-blocking",
        title: "Time Blocking",
        content: `**Time Blocking**

Time blocking is the practice of scheduling dedicated time for specific types of work. Atlas makes this easy with drag-and-drop time blocks on your calendar.

**Creating a time block**

1. Click the "Add time block" button in the Calendar toolbar
2. Or drag on the calendar grid to create a block of a specific duration
3. Give the block a name and optionally link it to a project

**Managing time blocks**

- **Resize**: Drag the bottom edge of a block to change its duration
- **Move**: Drag the block to a new time slot
- **Edit**: Click a block to open the detail panel

**Best practices**

- Block your most important work in your peak energy hours
- Leave buffer time between blocks for transitions and unexpected issues
- Block "processing time" each day for email and quick tasks
- Reserve time on Fridays for your weekly review

**Integrating tasks with your calendar**

Tasks with due dates appear as indicators on your calendar. You can drag them onto time blocks to schedule when you'll actually work on them — this is different from the due date, which is the deadline.`,
      },
      {
        id: "calendar-views",
        title: "Calendar Views",
        content: `**Calendar Views**

The Calendar module supports multiple views so you can see your schedule at different levels of granularity.

**Day view**

The day view shows a single day in full hourly detail. Use it for:
- Planning a complex day with many meetings
- Precise time blocking
- Reviewing exactly how you spent a particular day

**Week view**

The week view (default) shows seven days at once. This is the most useful for:
- Balancing your workload across the week
- Spotting open time for deep work
- Seeing the full rhythm of your schedule

**Switching views**

Use the toggle in the Calendar toolbar to switch between Day, Week, and Month views. Your preference is remembered across sessions.

**Navigating dates**

| Action | Method |
|--------|--------|
| Next period | Click → or press \`→\` |
| Previous period | Click ← or press \`←\` |
| Jump to today | Click "Today" button |
| Jump to a date | Click the date header |`,
      },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: Users,
    articles: [
      {
        id: "contacts-crm",
        title: "Contacts & CRM",
        content: `**Contacts & CRM**

The People module is a lightweight CRM for managing your professional and personal contacts. It's designed to help you maintain relationships without the complexity of a full sales CRM.

**Adding contacts**

1. Navigate to the People module (\`⌘3\`)
2. Click "New contact" or press \`N\`
3. Fill in the contact's details

**Key fields**

- **Name** — The contact's full name
- **Company** — Their organization
- **Email** — Primary email address
- **Last contacted** — Automatically updated when you log interactions
- **Follow-up date** — When you next want to reach out

**Follow-up system**

The follow-up date field is the core of Atlas's relationship management. Set a date when you want to check in with someone, and they'll appear in your Forecast view as a reminder.

After you've connected with someone:
1. Log the interaction with a note
2. Set the next follow-up date
3. The contact moves off your radar until that date

**Linking contacts to tasks**

You can associate contacts with tasks — useful for "waiting for" items or meeting prep. This creates a bidirectional link between your people and your work.`,
      },
      {
        id: "interaction-log",
        title: "Logging Interactions",
        content: `**Logging Interactions**

Keeping a record of your conversations and meetings helps you maintain context and pick up where you left off with anyone.

**Adding an interaction log entry**

1. Open a contact's detail panel in the People module
2. Click "Log interaction" in the timeline section
3. Write a brief note about what was discussed
4. The "Last contacted" date is automatically updated

**What to log**

Good interaction notes capture:
- Key decisions made or information shared
- Follow-up actions you or they committed to
- Context that will be useful next time you connect
- Your impression of where the relationship stands

**Setting the next follow-up**

After logging, set a follow-up date so this person appears on your radar at the right time. A good rule of thumb:
- Important relationships: every 2–4 weeks
- Close colleagues: monthly
- Broader network: quarterly

**Viewing interaction history**

The contact timeline shows all your logged interactions in reverse chronological order, giving you a quick way to remember the full history of a relationship before a call or meeting.`,
      },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    icon: FileText,
    articles: [
      {
        id: "writing-notes",
        title: "Writing Notes",
        content: `**Writing Notes**

The Notes module is a rich text editor for longer-form writing. It supports markdown-style formatting, backlinks, and project associations.

**Creating a note**

1. Navigate to Notes (\`⌘4\`)
2. Click "New note" or press \`N\`
3. Give it a title and start writing

**Formatting**

Atlas Notes supports standard rich text formatting:
- **Bold**: \`⌘B\`
- **Italic**: \`⌘I\`
- **Headings**: Use \`#\`, \`##\`, \`###\` followed by a space
- **Lists**: Start a line with \`-\` or \`1.\`
- **Code**: Wrap in backticks for inline code, or use triple backticks for code blocks

**Note purposes**

Each note has a "Purpose" field that categorizes it:
- **Reference** — Information you want to look up later
- **Project support** — Material related to an active project
- **Someday/Maybe** — Ideas you're not ready to act on
- **Archive** — Notes you want to keep but no longer actively reference

**Backlinks**

Type \`[[\` to create a backlink to another note, task, or contact. Backlinks create a web of connected information and appear in the linked item's detail panel.`,
      },
      {
        id: "backlinks",
        title: "Backlinks & References",
        content: `**Backlinks & References**

Backlinks are bidirectional connections between notes, tasks, and contacts. They're the connective tissue of your Atlas knowledge base.

**Creating a backlink**

Type \`[[\` in any note to open the link picker. Search for any item in Atlas and press Enter to insert the link.

**How backlinks work**

When you link from Note A to Note B, Atlas automatically shows Note A in Note B's "Backlinks" section. This means you can always see what references any given piece of content.

**Reference types**

Atlas tracks different kinds of references:
- **Note → Note** — Connect related ideas
- **Note → Task** — Link writing to action
- **Note → Project** — Associate reference material with projects
- **Note → Contact** — Connect information to people

**Building a knowledge graph**

As you create more backlinks, Atlas builds a map of how your ideas and work connect. Use this to:
- Find related material when starting a new project
- Trace the history of an idea
- Discover unexpected connections between topics`,
      },
    ],
  },
  {
    id: "journals",
    label: "Journals",
    icon: BookMarked,
    articles: [
      {
        id: "daily-journaling",
        title: "Daily Journaling",
        content: `**Daily Journaling**

The Journal module is designed to support a consistent daily reflection practice. Each day gets its own entry, and Atlas can prompt you with questions to guide your writing.

**Creating a journal entry**

Navigate to Journals (\`⌘5\`) and the current day's entry is automatically displayed. Start writing to begin your entry for today.

**Journal prompts**

Toggle the prompt panel to see suggested reflection questions:
- What did I accomplish today?
- What challenged me?
- What am I grateful for?
- What do I want to focus on tomorrow?

You can customize these prompts in Settings → Journal.

**Entry structure**

A good journal entry typically includes:
1. **Morning intention** — What do you want to accomplish today?
2. **Evening reflection** — How did the day go?
3. **Learnings** — What did you discover or learn?

**Reviewing past entries**

Use the date picker to navigate to past entries. The journal timeline shows a bird's-eye view of your journaling history, with indicators for days you wrote.

**Privacy**

Journal entries are stored only in your Atlas account and are never used to train AI models or shared with third parties.`,
      },
      {
        id: "weekly-review",
        title: "Weekly Review",
        content: `**Weekly Review**

The weekly review is the cornerstone of a healthy productivity system. It's a dedicated time each week — usually Friday afternoon or Sunday evening — to close out the past week and set up the next.

**The Atlas Weekly Review checklist**

1. **Clear your inboxes** — Process every item in Quick Capture and email to zero
2. **Review your task lists** — Look at every active project and context list
3. **Check your calendar** — Review the past week and look ahead 2 weeks
4. **Update your projects** — Mark completed projects done, add new next actions
5. **Review your Waiting For list** — Follow up on anything overdue
6. **Set your intentions** — What are the 3 most important things for next week?

**Where to do your review**

Open a Journal entry for your review session. Use the prompts to guide your reflection. Keeping it in Atlas means your review notes are searchable and connected to your tasks.

**Making it stick**

- Block 60–90 minutes on your calendar every week
- Do it at the same time each week to build the habit
- The first review is the hardest — it gets faster each time
- A mediocre review done consistently beats a perfect review done rarely`,
      },
    ],
  },
  {
    id: "vault",
    label: "Vault",
    icon: FolderOpen,
    articles: [
      {
        id: "file-storage",
        title: "File Storage",
        content: `**File Storage**

The Vault is Atlas's file storage system. It's designed for files that are part of your productivity system — reference documents, project files, and attachments.

**Uploading files**

1. Navigate to Vault (\`⌘6\`)
2. Click "Upload" or drag files directly into the browser
3. Files are stored securely and indexed for search

**Supported file types**

- **Documents**: PDF, Word, Excel, PowerPoint
- **Images**: JPEG, PNG, GIF, WebP, SVG
- **Text**: Markdown, plain text, CSV
- **Other**: Any file type up to 100MB

**Organizing files**

Create folders to organize your vault:
1. Click "New folder"
2. Give it a name
3. Drag files into the folder

**Attaching files to notes and tasks**

Files in your vault can be attached to notes and tasks. This keeps your reference material close to your action items without duplicating files.

**Storage limits**

Your storage limit depends on your Atlas plan. You can see your current usage in Settings → Account.`,
      },
      {
        id: "vault-search",
        title: "Searching the Vault",
        content: `**Searching the Vault**

Finding files quickly is essential when your vault grows. Atlas provides several ways to locate what you need.

**Global search**

Press \`⌘K\` to open the Command Palette and type any part of a filename. Search results include vault files alongside tasks, notes, and contacts.

**Vault search bar**

The Vault module has its own search bar at the top of the file list. Type to filter files by name in real time.

**Filtering by type**

Use the type filter dropdown to show only specific file types:
- Documents (PDF, Word, etc.)
- Images
- Spreadsheets
- Other

**Browsing folders**

Use the folder tree in the Vault sidebar to navigate your folder hierarchy. Breadcrumbs at the top of the file list show your current location.

**Sorting**

Click any column header to sort by name, date modified, or file size. Click again to reverse the sort order.

**Tips for findability**

- Use descriptive filenames — "Q1 Budget Final v2.xlsx" beats "doc1.xlsx"
- Put project name first so related files sort together
- Use consistent naming conventions across your whole vault`,
      },
    ],
  },
  {
    id: "keyboard-shortcuts",
    label: "Keyboard Shortcuts",
    icon: Keyboard,
    articles: [
      {
        id: "global-shortcuts",
        title: "Global Shortcuts",
        content: `**Global Shortcuts**

These shortcuts work from anywhere in Atlas:

| Action | Shortcut |
|--------|----------|
| Quick Capture | \`⌘⇧I\` |
| Command Palette | \`⌘K\` |
| Keyboard shortcuts reference | \`⌘/\` |
| Help Center | \`?\` |
| Settings | \`⌘,\` |
| Tasks module | \`⌘1\` |
| Calendar module | \`⌘2\` |
| People module | \`⌘3\` |
| Notes module | \`⌘4\` |
| Journals module | \`⌘5\` |
| Vault module | \`⌘6\` |

**Task shortcuts**

| Action | Shortcut |
|--------|----------|
| New task | \`N\` |
| New project | \`⌘N\` |
| Inbox view | \`I\` |
| Forecast view | \`F\` |
| Review view | \`R\` |
| Mark complete | \`Space\` or \`⌘Enter\` |

**Navigation shortcuts**

| Action | Shortcut |
|--------|----------|
| Move up | \`↑\` or \`K\` |
| Move down | \`↓\` or \`J\` |
| Open item | \`Enter\` |
| Close / Go back | \`Esc\` |`,
      },
      {
        id: "editor-shortcuts",
        title: "Editor Shortcuts",
        content: `**Editor Shortcuts**

These shortcuts work in the Notes and Journal editors:

**Text formatting**

| Action | Shortcut |
|--------|----------|
| Bold | \`⌘B\` |
| Italic | \`⌘I\` |
| Underline | \`⌘U\` |
| Strikethrough | \`⌘⇧X\` |
| Code | \`⌘E\` |
| Link | \`⌘K\` |

**Structure**

| Action | Shortcut |
|--------|----------|
| Heading 1 | \`⌘⌥1\` |
| Heading 2 | \`⌘⌥2\` |
| Heading 3 | \`⌘⌥3\` |
| Bulleted list | \`⌘⇧8\` |
| Numbered list | \`⌘⇧7\` |
| Blockquote | \`⌘⇧B\` |
| Horizontal rule | Type \`---\` then Enter |

**Navigation**

| Action | Shortcut |
|--------|----------|
| Backlink picker | \`[[\` |
| Find & Replace | \`⌘H\` |
| Focus mode | \`⌘⇧F\` |

**History**

| Action | Shortcut |
|--------|----------|
| Undo | \`⌘Z\` |
| Redo | \`⌘⇧Z\` |`,
      },
    ],
  },
  {
    id: "ai-features",
    label: "AI Features",
    icon: Sparkles,
    articles: [
      {
        id: "ai-capture-parsing",
        title: "AI Capture Parsing",
        content: `**AI Capture Parsing**

Atlas uses AI to parse natural language input from Quick Capture into structured tasks, events, and contacts.

**How parsing works**

When you submit a capture, Atlas sends your text to Claude (Anthropic's AI) which extracts:
- **Task title** — The core action
- **Due date** — Extracted from natural language dates
- **Project** — Matched against your existing projects
- **Context** — Inferred from keywords
- **Priority** — Based on urgency language

**Examples**

- "Finish the Q4 report by Friday" → Task: "Finish the Q4 report", Due: this Friday
- "Call mom tomorrow morning" → Task: "Call mom", Due: tomorrow, Context: @phone
- "Buy birthday gift for Sarah by end of next week" → Task with due date + person link

**Confidence scores**

Atlas shows a confidence indicator for each parsed field. Fields with low confidence are highlighted so you can review them before saving.

**Privacy**

Your capture text is sent to Anthropic for processing. We don't store the raw text after processing. See our Privacy Policy for details.

**Improving parsing**

If Atlas consistently misparses certain phrases, you can:
1. Use more explicit language (e.g., "due Wednesday" instead of "by Wednesday")
2. Provide feedback using the thumbs down button on the parsed result
3. Manually edit the result and save — Atlas learns from corrections`,
      },
      {
        id: "help-ai-assistant",
        title: "AI Help Assistant",
        content: `**AI Help Assistant**

The AI Help Assistant is available in the Help Center. It can answer questions about Atlas, help you troubleshoot issues, and suggest workflows.

**How to use it**

1. Open the Help Center (press \`?\` or click the help icon in the sidebar)
2. Click "Ask AI" in the left sidebar
3. Type your question

**What the assistant knows**

The assistant has access to the full Atlas documentation and can answer questions about:
- How specific features work
- Keyboard shortcuts
- Best practices and workflows
- Troubleshooting common issues

**Limitations**

- The assistant cannot access your personal data (tasks, notes, contacts)
- It cannot make changes to your account or data
- Chat history is session-only — it resets when you close the Help Center
- For billing, account, or support issues, use the contact form instead

**Suggested prompts**

- "How do I set up a weekly review workflow?"
- "What's the difference between a project and a task?"
- "How do keyboard shortcuts work?"
- "How do I use backlinks in notes?"
- "What is the Waiting For context used for?"`,
      },
    ],
  },
];

export const HELP_DOCS_CORPUS: string = HELP_SECTIONS.map((section) =>
  section.articles
    .map((article) => `# ${section.label}: ${article.title}\n\n${article.content}`)
    .join("\n\n---\n\n"),
).join("\n\n===\n\n");
