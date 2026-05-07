# Atlas — Personal Productivity Command Center

Atlas is a desktop-first personal productivity command center built as a local-first capture intelligence system. It prioritizes cost-effective local parsing for user input (chrono-node + compromise.js), using AI (Claude Haiku) only as a fallback for ambiguous input to minimize costs. The application is deployed on a `.replit.app` / `atlas.insightive.io` domain, using Neon Postgres for data persistence, Clerk for authentication, and Cloudflare R2 for file storage.

---

## User Preferences

- Iterative development with clear, concise communication
- Ask before major architectural changes or new dependencies
- Desktop-first experiences throughout
- Strict TypeScript compliance — zero errors
- Clean codebase with consistent Tailwind CSS styling driven by Stratum tokens
- Do not modify `.github/workflows/ci.yml`

---

## Run & Operate

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server on port 5000 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript type-check (zero-error policy) |
| `npx prisma migrate dev` | Apply schema migrations (dev) |
| `npx prisma generate` | Regenerate Prisma client |
| `scripts/post-merge.sh` | Apply migrations to Neon (runs automatically after task merge) |

**Required env vars:** `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` (or Replit AI integration), `R2_*` / object storage vars, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `RESEND_API_KEY`, `ENCRYPTION_KEY` (AES-256-GCM).

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS 3.4, Stratum design tokens |
| Type safety | TypeScript (strict), tRPC |
| ORM | Prisma |
| Database | Neon Postgres (PostgreSQL 16) |
| Auth | Clerk (`@clerk/nextjs` v7) |
| AI | Anthropic Claude (Haiku / Sonnet / Opus) |
| Storage | Cloudflare R2 (`@aws-sdk/client-s3`) |
| Jobs | pg-boss v10 |
| Editor | TipTap (ProseMirror) |
| Logging | Pino + pino-pretty |
| PKs | UUIDv7 everywhere |

---

## Where Things Live

```
src/
  app/
    (app)/          # Authenticated shell — all product pages
      tasks/        # Tasks module views
      capture/      # Single-capture processing view
      captures/     # Capture inbox list
      notes/        # Notes module
      tables/       # Tables module
      calendar/     # Calendar view
      journals/     # Journaling
      m/            # Mobile-optimised sub-routes
      admin/        # Gated admin panel
      settings/     # User settings
      usage/        # AI usage & spending chart
      trash/        # Soft-deleted records
      vault/        # Attachment vault
      media/        # Media browser
      people/       # People management
    api/            # REST route handlers (see REST API section)
    (marketing)/    # Public marketing pages
  components/       # Shared UI components
    shell/          # TwoPaneLayout, ModuleSwitcher, TopBar, CommandPalette
    help/           # Help Center overlay
    ui/             # Primitives (hint.tsx, etc.)
  server/
    routers/        # tRPC sub-routers (see tRPC section)
    trpc.ts         # tRPC base setup
  core/
    ai/             # AI client, cost tracking (index.ts)
    capture/        # Three-tier parsing pipeline
    jobs/           # pg-boss registry & handlers
    conversion/     # Import/export (MD, DOCX, PDF)
    auth/           # Orphan recovery, audit helpers
    db.ts           # Prisma client singleton + newId()
    logging.ts      # Pino logger factory
  lib/              # Auth helpers, admin gate, locale utilities
  styles/           # tokens.css — Stratum design tokens
prisma/
  schema.prisma     # Source of truth for all data models
  migrations/       # Applied SQL migrations
scripts/
  post-merge.sh     # Runs `prisma migrate deploy` against Neon after merge
```

---

## Mobile View (/m)

The `/m` sub-app is a lightweight mobile-optimised shell layered inside the same authenticated route group. It is served to users whose browser sends a mobile User-Agent (Android, iPhone, iPad, etc.) and who do not have the `prefer-desktop` cookie set. The redirect logic lives in `src/middleware.ts`.

**Layout shell** (`src/app/(app)/m/layout.tsx`):
- `MobileTopBar` — sticky top bar with a search button (opens `CommandPalette`) and a `+` capture button (opens `CaptureModal`)
- `BottomTabBar` — fixed bottom navigation with five tabs; respects `safe-area-inset-bottom` for notched devices
- Interactive tap targets in the tab bar and task list are at least 44 px tall; top-bar action buttons are 40 px

**Live routes:**

| Route | Component | Description |
|---|---|---|
| `/m` | redirect | Redirects to `/m/tasks` |
| `/m/tasks` | `MobileTasksPage` | Task list with Inbox / Today / Flagged chip filter |
| `/m/tasks/[taskId]` | `MobileTaskDetailPage` | Task detail: title, notes, metadata rows, complete/reopen button, contexts and tags |
| `/m/settings` | `MobileSettingsPage` | Theme picker (Light/Dark/System), switch-to-desktop action, profile card, sign-out |

**Placeholder routes (bottom-tab slots that show a "coming soon" screen):**

| Route | Planned wave |
|---|---|
| `/m/notes` | Wave 4 |
| `/m/calendar` | Wave 4 |
| `/m/journals` | Wave 5 |

**Mobile UX conventions:**
- 44 px minimum touch targets on tab bar items and list rows (`min-h-[44px]`); top-bar action buttons are 40 px (`h-10 w-10`)
- `safe-area-inset-bottom` applied to `BottomTabBar` for notch/home-indicator clearance
- `prefer-desktop` cookie (1-year expiry, `SameSite=Lax`) set by "Switch to desktop site" to opt a device out of the mobile shell permanently
- The mobile shell reuses the same tRPC routers and Clerk session as the desktop app; no separate API surface

---

## Architecture Decisions

- **Local-first parsing over AI-first** — Tier 1 (chrono-node + compromise.js) runs synchronously; AI enrichment is enqueued asynchronously and only triggered when confidence < user threshold. This keeps the capture UI instant.
- **UUIDv7 PKs** — Monotonically sortable, collision-free, compatible with Postgres UUID type. All PKs are generated via `newId()` in `src/core/db.ts`.
- **pg-boss for background jobs** — Uses the same Postgres connection as Prisma; no extra infrastructure needed for durable cron scheduling.
- **AES-256-GCM token encryption** — All OAuth tokens (Google Drive) are stored encrypted in `IntegrationToken` / `DriveConfig` using Node.js `crypto` with a server-side `ENCRYPTION_KEY`.
- **Soft-delete everywhere** — Tasks, notes, attachments, projects, and folders all carry `deleted_at`. A nightly `trash-retention` job hard-deletes records past the retention window.
- **Full-text search via Postgres triggers** — `search_vector` columns are maintained by DB-level triggers and indexed with GIN, so FTS requires no external search service.
- **Stratum design tokens** — All colors, spacing, and typography resolve through CSS custom properties defined in `src/styles/tokens.css`. Zero hardcoded hex values in components.

---

## Authentication & User Model

Authentication is handled by Clerk (`@clerk/nextjs` v7). On first sign-in `getOrCreateUserFromClerk()` upserts a Prisma `User` record keyed by `clerk_id`. Profile fields (`name`, `email`, `image`) are synced from Clerk on every request.

**Orphan recovery** — If a user signs in with a new Clerk ID but their old data still exists (e.g. after account re-creation), `reattachOrphanData()` in `src/core/auth/orphan-recovery.ts` runs a transaction that re-keys all tables with `user_id` to the new Clerk user. A `recovery_notification_pending` flag on `User` triggers an in-app recovery summary banner. Every table that gains a `user_id` column **must** be added to `reattachOrphanData()`.

Audit logging for auth events (sign-in, sign-out, profile change, orphan recovery) is written to `AuditLog` via `logActivity()` in `src/core/audit.ts`.

---

## Database Models

All PKs are `UUID` (UUIDv7). All timestamps are `TIMESTAMPTZ`. Source of truth: `prisma/schema.prisma`.

| Model | Purpose |
|---|---|
| `User` | Core user record: preferences, locale, AI budget, theme, recovery state |
| `AuditLog` | Entity-level change history with `diff` JSON and `meta` JSON |
| `IntegrationToken` | AES-256-GCM encrypted OAuth tokens, keyed by `(user_id, provider)` |
| `SyncState` | Cursor-based sync state per `(user_id, provider, resource_type)` |
| `RateLimitTracker` | Per-user, per-provider sliding-window rate limit counters |
| `AICallLog` | Per-call token counts, cost in USD, duration, success flag, error text |
| `WaitlistEntry` | Public waitlist signups with status |
| `Attachment` | R2-backed file records: `file_id`, `storage_path`, `thumbnail_path`, `parent_type/id`, soft-delete |
| `TagOnAttachment` | Join table: `(attachment_id, tag_id)` |
| `DriveConfig` | Per-user Google Drive config: folder IDs, encrypted tokens, verification status |
| `Capture` | Raw inbox entry: `raw_text`, `state` (raw → proposed → processed), `parser_proposal` JSON |
| `CaptureParseLog` | Parse metadata per capture: tier, confidence, AI model/tokens/cost, duration, source |
| `EmailCapture` | Inbound email records: `from_address`, `subject`, `body_text/html`, `status`, linked `task_id` |
| `Task` | GTD task: title, notes, status, defer/due dates, recurrence (RRule), FTS `search_vector`, GTD flags |
| `ContextOnTask` | Join table: `(task_id, context_id)` |
| `TagOnTask` | Join table: `(task_id, tag_id)` |
| `ChecklistItem` | Sub-items of a Task with `completed_at` and `position` |
| `TaskWorkLog` | Time-tracking entries on a Task: `body`, `duration_minutes` |
| `Project` | Free-form project/area: type, status, `target_date`, `review_interval_days`, sequential flag |
| `ProjectFolder` | Nested folder hierarchy for Projects (self-referential via `parent_id`) |
| `Context` | GTD context with icon, color, and position |
| `Tag` | User tag with color and `usage_count` |
| `Person` | People referenced in tasks: `handle`, `display_name`, `email` |
| `Note` | Rich-text note: TipTap JSON (`body_json`), plain text (`body_text`), Markdown (`body_markdown`), Drive sync fields, import provenance |
| `NotesFolder` | Nested folder hierarchy for Notes (self-referential) |
| `Link` | Backlink graph: `(source_type, source_id) → (target_type, target_id)` with relation type and excerpt |
| `Table` | Structured data grid with Drive CSV/JSON sync fields |
| `TablesFolder` | Nested folder hierarchy for Tables (self-referential) |
| `TableColumn` | Column definition: `type` (text/number/currency/date/checkbox/single_select), `config` JSON, `aggregation`, `width` |
| `TableRow` | Row in a Table with fractional `position` |
| `TableCell` | Cell value: typed JSON, keyed by `(row_id, column_id)` |

---

## Full-Text Search

The `Task` model carries a `search_vector` column (plain text: `title || ' ' || notes`) maintained by a Postgres trigger (`task_search_vector_trigger`). A GIN index is applied to the column for efficient `@@` queries. The `search` tRPC router exposes search across tasks and notes without any external search service.

---

## Capture Pipeline

Entry points: `CaptureModal` (⌘⇧I), quick-add shortcuts, and inbound email.

**Three-tier parsing strategy** (`src/core/capture/`):

| Tier | Implementation | Trigger |
|---|---|---|
| Tier 1 — Local NLP | chrono-node (dates) + compromise.js (NLP) | Always runs synchronously |
| Tier 2 — AI enrichment | Claude Haiku via `complete()` | `scoreConfidence()` < user's `ai_confidence_threshold` (default 0.70) |
| Tier 3 — Raw fallback | `runFallback()` — title = first 80 chars | AI call fails |

Flow:
1. `captureAndCreate()` receives raw text, runs Tier 1, scores confidence.
2. A `Capture` record is written immediately (state = `raw`) so the UI can respond.
3. Enrichment is enqueued via `enqueueEnrichment()` (async, non-blocking).
4. Enrichment runs Tier 2 if needed, classifies tags (explicit vs AI-suggested vs new), updates the `Capture` to state = `proposed` with `parser_proposal` JSON.
5. A `CaptureParseLog` record is written with full parse metadata (tier, confidence, AI cost, duration, source).

**Email-to-inbox:** Resend inbound webhook → `POST /api/email/inbound` → parsed via `mailparser` → written to `EmailCapture` → enqueued for processing into a `Capture`.

**User controls:** `ai_confidence_threshold` slider (Settings → AI), master `ai_capture_enabled` toggle, per-capture `ai_fallback_enabled` toggle.

---

## Tasks Module

**Views:** Inbox, Today, Tomorrow, Forecast (configurable date range, synced to account), Someday, Waiting For, Completed, Trash.

**Features:**
- Full CRUD with optimistic updates via tRPC `tasks` router
- Subtasks (self-referential `parent_id`)
- Checklists (`ChecklistItem`) with completion tracking
- Recurrence via RRule strings (`recurrence_rule`, `recurrence_anchor`: due_date or completion_date)
- Time tracking via `TaskWorkLog` (body + duration in minutes)
- Soft-delete with trash retention policy
- Full-text search (`search_vector`, GIN index)
- Context, tag, project, and person assignments
- GTD fields: `is_someday`, `delegated_to_text/person_id`, `follow_up_date`
- Flagging, defer dates, estimated minutes, sequential project mode
- Parse-source badge showing AI vs local parse and confidence score

---

## Notes Module

**Editor:** TipTap (ProseMirror) with extensions:
- Block drag-handle (`@tiptap/extension-drag-handle-react`)
- Slash commands (`/`) for inserting blocks
- Markdown import/export
- Image and URL embedding/unfurling
- Syntax highlighting via lowlight
- Internal `@mention` references (notes, tags, contexts)
- Backlinks tracked in the `Link` model

**Note types:** `note`, `meeting_note`, `project_brief`, `reading_note`. One project brief per project enforced by a partial unique index.

**Drive sync:** Each note exports its `body_markdown` field to Google Drive hourly via `drive-sync-notes` job.

**Folder hierarchy:** Nested `NotesFolder` tree with drag-and-drop reordering.

---

## File Conversion (Import / Export)

Implemented in `src/core/conversion/`. API routes at `src/app/api/convert/`.

**Import** (split-button dropdown on the note list):
- `.md` — parsed with gray-matter (front-matter) + marked (HTML conversion)
- `.docx` — converted with mammoth
- Endpoint: `POST /api/convert/import` (multipart/form-data)
- Rate limit: 10 imports / min per user
- On title conflict: Claude-assisted conflict resolver dialog prompts to overwrite, rename, or cancel
- Progress dialog shown during import

**Export** (note metadata panel → Actions):
- PDF — pdfkit-based pure Node.js generation → `POST /api/convert/export-pdf`; result stored in R2, signed URL returned. Rate limit: 5 PDF exports / min.
- Markdown — direct download from `body_markdown` → `POST /api/convert/export-md`

**Cleanup job:** `import-cleanup` runs daily at 06:00 UTC to purge expired R2 objects from PDF exports.

**Note model additions:** `imported_from` ("md" | "docx" | null), `imported_at`, `source_metadata` (front-matter fields, docx warnings).

---

## Tables Module

Structured data grid with folder hierarchy. Backed by `Table`, `TablesFolder`, `TableColumn`, `TableRow`, `TableCell`.

**Column types:** Text, Number, Currency, Date, Checkbox, Single Select. Each column has a `config` JSON for type-specific options (decimal places, select options, etc.) and an optional `aggregation` (sum, average, count, min, max, checked_ratio).

**Grid features:** Keyboard navigation, inline cell editing, manual row reordering (fractional position), column resize (`width` field).

**Drive sync:** Each table exports a JSON schema file + CSV to Google Drive hourly via `drive-sync-tables`. File IDs stored in `drive_csv_file_id` and `drive_json_file_id`.

---

## Projects Module

- Free-form project types: `project` | `area`
- Statuses: `active` | `on_hold` | `completed` | `dropped`
- Folder hierarchy via `ProjectFolder` (self-referential, nested)
- Dynamic grouping by status or folder in the list view
- Project detail view: metrics (task counts, progress), linked notes section, audit log entries
- Sequential mode: tasks must be completed in order
- Review scheduling: `review_interval_days` (null = never, 3/7/14/30)
- Tables and notes can be linked to a project via `project_id`

---

## Captures & Email Inbox

**Capture list view:** Shows all `Capture` records in `proposed` state. Displays parse-source badge (AI vs local), confidence score, proposed title, tags, due date.

**Bulk-accept banner:** Select multiple captures and accept them all as tasks in one action.

**EmailCapture detail view:** Full email metadata, `body_text` / `body_html` preview, attachment list, one-click accept-as-task.

**Sender blocklist/allowlist:** Users can block or allow sender addresses from the email list view or individual email detail. Blocked senders are matched with wildcard support. The blocklist is stored in user preferences (`tasks_prefs` JSON).

**Parse-source badge:** Every capture shows whether it was parsed locally or with AI, and the raw confidence score.

---

## Admin Panel

Gated at `/admin` (guarded by `isAdmin()` in `src/lib/admin-gate.ts`).

**Sections:**
- **User management** — list all users, view profiles, impersonate, soft-delete
- **Audit log explorer** — searchable, filterable audit log across all entities
- **Job management** — trigger, pause, and view status of all registered pg-boss jobs via the `jobs` tRPC router
- **Health monitoring** — system health checks, DB connectivity, API status
- **Orphan recovery tooling** — manually trigger `reattachOrphanData()` for a specific user
- **Waitlist management** — review and approve waitlist signups

---

## Settings Module

Located at `/settings`. Sections:

| Section | Content |
|---|---|
| Profile | Name, email, avatar (synced from Clerk) |
| Appearance | Theme (dark / light), token preview |
| Preferences | Locale preset, timezone, date format, number format, time format, week start, currency |
| Integrations | Google Drive 4-step OAuth wizard |
| AI | Enable/disable AI capture, `ai_confidence_threshold` slider (debounced), `ai_budget_usd` cap |
| Backups | Manual export triggers |
| System Status | Background job controls: view schedule, trigger manually, pause/resume |

---

## AI Usage & Budgeting

**Models tracked** (`src/core/ai/index.ts`):

| Model ID | Input cost/token | Output cost/token |
|---|---|---|
| `claude-haiku-4-5` | $0.00000025 | $0.00000125 |
| `claude-sonnet-4-6` | $0.000003 | $0.000015 |
| `claude-opus-4-7` | $0.000015 | $0.000075 |

Every AI call writes to `AICallLog` (user_id, task, model, tokens, cost_usd, duration_ms, success, error).

**Budget cap:** `ai_budget_usd` on `User`. Requests that would exceed the cap are rejected.

**Spending chart:** `/usage` page shows a spending-over-time chart via the `ai` tRPC router, grouped by day and model.

**Task → model routing:** `TASK_MODEL_MAP` in `src/core/ai/index.ts` maps task strings (e.g. `capture_parse`, `test`) to model IDs. Default is Haiku.

---

## Help Center

Full-screen overlay accessible via:
- `?` keyboard shortcut
- CircleHelp icon in the `ModuleSwitcher`
- "Help Center" entry in the `TopbarHelpMenu`

**Content:** 9 documentation sections, 20 articles covering all modules and features. Implemented in `src/components/help/`.

**AI chat panel:** Backed by `POST /api/help/chat` — streams an Anthropic response using the Anthropic SDK's streaming API. The panel is embedded in the Help Center overlay.

---

## Google Drive Integration

**Setup:** 4-step OAuth wizard in Settings → Integrations:
1. Initiate OAuth (`GET /api/drive/connect`)
2. Callback (`GET /api/drive/oauth-callback`)
3. Select root folder
4. Verify connection

**Token storage:** Encrypted with AES-256-GCM and stored in `IntegrationToken` (provider = `google_drive`) and `DriveConfig` (folder mapping, sync settings, verification status).

**Proactive token refresh:** Before each sync job, tokens are refreshed if expiry is within the refresh window.

**Hourly sync jobs:**
- `drive-sync-notes` — exports each note's `body_markdown` to Drive
- `drive-sync-tables` — exports each table as JSON schema + CSV to Drive
- `drive-sync-attachments` — uploads new attachments to Drive

Sync state (last synced, cursor) is tracked in `SyncState`. Errors are written back to the note/table `drive_sync_error` field.

---

## Attachments

- **Storage:** Cloudflare R2 via `@aws-sdk/client-s3` (configurable via `STORAGE_PROVIDER` env var)
- **Upload:** `POST /api/attachments/upload` — multipart/form-data; writes `Attachment` record with `file_id`, `storage_path`, `content_type`, `size_bytes`
- **Retrieval:** `GET /api/attachments/[fileId]` — returns a signed URL (or streams the file)
- **Thumbnails:** Generated server-side; path stored in `thumbnail_path`
- **Soft-delete:** `deleted_at` field; nightly `attachment-cleanup` job purges orphaned R2 objects
- **Parent linking:** `parent_type` / `parent_id` polymorphic reference (task, note, email, etc.) plus explicit `task_id` FK
- **Tag support:** `TagOnAttachment` join table
- **Vault:** `/vault` route provides a browsable gallery of all attachments

---

## Background Jobs (pg-boss v10)

All jobs are registered in `src/core/jobs/registry.ts` and scheduled on startup.

| Job name | Schedule | Description |
|---|---|---|
| `drive-sync-notes` | `0 * * * *` (hourly) | Export all notes to Google Drive as Markdown |
| `drive-sync-tables` | `0 * * * *` (hourly) | Export all tables to Google Drive as JSON schema + CSV |
| `drive-sync-attachments` | `0 * * * *` (hourly) | Upload new attachments to Google Drive |
| `import-cleanup` | `0 6 * * *` (daily 06:00 UTC) | Purge expired PDF export objects from R2 |
| `session-cleanup` | `0 3 * * *` (daily 03:00 UTC) | Session cleanup — registered and scheduled; full handler implementation queued (task #18) |
| `trash-retention` | `0 4 * * *` (daily 04:00 UTC) | Hard-delete soft-deleted records past retention window |
| `attachment-cleanup` | `0 5 * * *` (daily 05:00 UTC) | Purge orphaned attachment objects from R2 |

Jobs can be triggered manually or paused from Settings → System Status and the Admin → Job Management panel.

---

## tRPC Router Inventory

All routers are mounted in `src/server/routers/_app.ts`.

| Router key | File | Purpose |
|---|---|---|
| `health` | `health.ts` | Service health checks |
| `user` | `user.ts` | User profile, preferences, locale settings |
| `drive` | `drive.ts` | Google Drive OAuth, sync triggers, config |
| `ai` | `ai.ts` | AI call logs, spending data, usage chart data |
| `capture` | `capture.ts` | Create captures, list inbox, process captures |
| `session` | `session.ts` | Session management |
| `tasks` | `tasks.ts` | Full CRUD for Tasks + subtasks |
| `projects` | `projects.ts` | Full CRUD for Projects |
| `contexts` | `contexts.ts` | GTD Contexts CRUD |
| `tags` | `tags.ts` | Tags CRUD + usage counts |
| `search` | `search.ts` | Full-text search across tasks and notes |
| `folders` | `folders.ts` | ProjectFolder CRUD |
| `review` | `review.ts` | Weekly review flow |
| `forecast` | `forecast.ts` | Forecast view data (configurable date range) |
| `emails` | `emails.ts` | EmailCapture list, detail, blocklist management |
| `attachments` | `attachments.ts` | Attachment list, metadata, soft-delete |
| `waitlist` | `waitlist.ts` | Waitlist signup and admin management |
| `checklist` | `checklist.ts` | ChecklistItem CRUD per task |
| `worklogs` | `worklogs.ts` | TaskWorkLog CRUD per task |
| `media` | `media.ts` | Media browser queries |
| `notes` | `notes.ts` | Full CRUD for Notes, Drive sync trigger |
| `notesFolder` | `notesFolder.ts` | NotesFolder CRUD and hierarchy |
| `links` | `links.ts` | Backlink graph: create/list/delete Link records |
| `jobs` | `jobs.ts` | Admin job control: trigger, pause, status |
| `admin` | `admin.ts` | Admin user management, orphan recovery |
| `tables` | `tables.ts` | Full CRUD for Tables, rows, cells, columns |
| `tablesFolders` | `tablesFolders.ts` | TablesFolder CRUD and hierarchy |
| `trash` | `trash.ts` | Trash list, restore, permanent delete |
| `convert` | `convert.ts` | Import/export orchestration (MD, DOCX, PDF) |
| `people` | *(procedures inside `capture.ts`)* | Person lookup for capture/task assignment — not a top-level mounted router key |

---

## REST API Route Inventory

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/attachments/upload` | Upload a file to R2; creates `Attachment` record |
| `GET` | `/api/attachments/[fileId]` | Return signed URL or stream for an attachment |
| `GET` | `/api/drive/connect` | Initiate Google Drive OAuth flow |
| `GET` | `/api/drive/oauth-callback` | OAuth callback; exchange code for tokens |
| `POST` | `/api/email/inbound` | Resend inbound webhook; creates `EmailCapture` |
| `POST` | `/api/convert/import` | Import `.md` or `.docx` file as a Note |
| `POST` | `/api/convert/export-pdf` | Export a Note as PDF; returns R2 signed URL |
| `POST` | `/api/convert/export-md` | Export a Note as Markdown download |
| `GET` | `/api/cron/cleanup-sessions` | HTTP-triggered session cleanup (cron target) |
| `POST` | `/api/help/chat` | Streaming Anthropic response for Help Center AI chat |
| `GET` | `/api/health` | Service health check (DB connectivity, API status) |
| `GET` | `/api/ai/test` | Test AI connectivity and log a sample call |
| `GET` | `/api/auth/test-login` | CI/E2E-only auth shortcut — disabled in production (requires `E2E_AUTH_SECRET`) |

---

## Locale & Formatting

The `User` model stores per-user locale preferences: `locale_preset`, `language`, `currency_code`, `currency_symbol`, `date_format`, `number_format`, `time_format`, `week_start`, `timezone`.

`useLocale()` hook (`src/lib/locale.ts`) reads these values from the user context and returns formatting functions for dates, times, numbers, and currency. Pure server-side formatting functions are also exported for use in API routes and jobs.

**Supported formats:** ISO 8601, DD/MM/YYYY, MM/DD/YYYY, and more. 12h/24h time. Decimal comma vs period. Regional currency symbols.

---

## Mobile Web Views

The `/m` sub-route group (`src/app/(app)/m/`) provides mobile-optimised views for:
- Tasks
- Calendar
- Notes
- Journals
- Settings

Middleware performs desktop/mobile detection and redirects to the appropriate route group based on the `User-Agent` header.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Open CommandPalette |
| `⌘⇧I` | Open CaptureModal |
| `?` | Open Help Center overlay |

Module-level shortcuts are surfaced via the `<Hint>` tooltip component (`src/components/ui/hint.tsx`), which wraps interactive controls and renders keyboard shortcut hints using Radix UI Tooltip.

---

## Recently Merged (Wave 3c and later)

### Wave 3c — Capture intelligence
- **#43** Hybrid parsing pipeline — three-tier local → AI → raw fallback strategy with `CaptureParseLog` tracking
- **#44** Email-to-inbox — Resend inbound webhook → `EmailCapture` → `Capture` pipeline
- **#45** Capture intelligence UI — parse-source badge, confidence score display, AI suggestion accept/dismiss flow
- **#48** Parse corruption guard — safe fallback for unusual or malformed input text

### Email inbox & attachments
- **#53** Inbox email address verification — per-user inbound address provisioning and verification flow
- **#54** Attachments in task detail — view, upload, and download attachments from the task inspector
- **#55** Attachment soft-delete — delete attachments with `deleted_at`; nightly cleanup purges R2 objects
- **#56** Image thumbnails — server-generated thumbnails stored in `thumbnail_path`; displayed inline
- **#57** Sender block from list — block a sender directly from the email list view
- **#58** Wildcard domain blocking — blocklist patterns support `*@domain.com` style wildcards
- **#59** Verification email — transactional email sent on inbound address verification
- **#60** Additional email inbox polish

### Auth migration
- **#94** Clerk migration — replaced Replit Auth with Clerk (`@clerk/nextjs` v7); full session and user model migration
- **#96** Google sign-in — added Google OAuth provider via Clerk
- **#98** Replit auth cleanup — removed legacy Replit auth code and dependencies

### App shell & UI polish
- **#25** Wave 2 shell — `TwoPaneLayout`, `ModuleSwitcher`, `TopBar`, `CommandPalette`
- **#26** AI usage inside shell — `/usage` page with spending chart integrated into authenticated shell
- **#27** Inspector/sidebar persistence — sidebar open/collapsed state preserved across navigation
- **#40 / #42** Forecast range — configurable date range for the Forecast view, synced to user account
- **#87** Keyboard shortcut hints — shortcut hints displayed in tooltips and the Help Center

### Test coverage
- **#75, #77, #79, #80, #82, #83, #84** Task list, drag-and-drop, keyboard, tag, and context inspector e2e tests
- **#88, #92** Additional e2e coverage and CI integration (Playwright in GitHub Actions)

### Code quality
- **#69** Code review, lint, and TypeScript cleanup — addressed deferred TS errors and lint warnings
- **#73** ESLint migration — upgraded ESLint config to flat-config format

---

## In Progress (Drafts)

### AI usage
- **#14** Spending chart — time-series chart of AI spending on the `/usage` page, grouped by day and model
- **#30** AI Usage nav icon — dedicated icon for the AI Usage entry in the navigation rail

### Session & auth
- **#17** Sign-out everywhere — button on the sign-in page to revoke all active sessions when a suspicious session is detected
- **#18** Nightly session cleanup job — full handler implementation for the `session-cleanup` pg-boss job

### Capture & parsing
- **#21** Fallback for unusual text — ensure corrupted or edge-case input is always captured safely
- **#46** Email-to-inbox followups — additional polish and edge-case handling for the inbound email pipeline
- **#47** Parse-source badge for users — expose parse source (AI vs local) and confidence score to end users in the capture list
- **#51** Confidence threshold slider debounce — debounce the AI confidence threshold slider so it does not fire on every drag event
- **#52** Inline suggestion persistence — remember per-capture AI suggestion dismissals between page loads

### Email & attachments
- **#61** Unblock confirmation — show a confirmation dialog before unblocking a sender from the blocklist
- **#62** Block from email detail — allow users to block a sender directly from the email capture detail view
- **#63** Image lightbox — full-size image viewer when clicking an image attachment
- **#64** PDF preview — inline preview panel for PDF attachments (not just images)
- **#65** Attachment undo delete — undo an accidental attachment deletion within a grace window
- **#66** Attachment removal loading state — show a loading indicator while an attachment is being removed
- **#67** Wildcard match display — show which blocklist entries match a wildcard so users can see what is being blocked
- **#68** Blocklist pattern tester — UI to test a sender address against current blocklist patterns
- **#70 / #71 / #72** Inbox verification tracking — additional verification flow states and tracking

### UI state persistence
- **#28** Sidebar collapse memory — remember the sidebar collapsed/expanded state between sessions
- **#29** Safe first-load guard — ensure persisted UI state never breaks the app on first load or cold start
- **#49** Forecast range sync — sync the Forecast date range setting to the user account so it follows across devices
- **#50** Bulk-accept new-project creation — allow the bulk-accept capture banner to create a new project when no match exists yet

### Test coverage
- **#81** Bulk-action smoke tests — e2e coverage for the bulk-accept and bulk-delete capture actions
- **#85** CI video on failure — record Playwright video artifacts on test failure in CI
- **#86 / #89** Drag-and-drop for non-manual sort — e2e tests covering drag-and-drop outside manual sort mode
- **#90** Shortcut bar toggle test — e2e coverage for the keyboard shortcut bar show/hide
- **#91** Shortcut reference overlay test — e2e coverage for the keyboard shortcut reference overlay
- **#93** E2e with AI parsing — end-to-end test that exercises the AI parsing path
- **#95** Context inspector tests — e2e coverage for the context inspector panel
- **#97** CI auth secret — wire `E2E_AUTH_SECRET` into CI so the auth bypass route works in the test environment

### Performance & cleanup
- **#74** Task-list field projection — limit fields returned by `tasks.list` to reduce payload size
- **#76** Dead lint suppressions — remove obsolete `eslint-disable` comments left over from the ESLint migration
- **#78** Auth bypass for e2e — ensure the `GET /api/auth/test-login` shortcut is safely gated and available in CI

---

## External Dependencies

**UI & Framework**
- `next` 15 — App Router, React Server Components, streaming
- `react` / `react-dom` 19 — UI runtime
- `tailwindcss` 3.4 — Utility CSS with Stratum token integration
- `@radix-ui/*` — Accessible headless UI primitives
- `cmdk` — Command palette
- `vaul` — Drawer primitive
- `sonner` — Toast notifications
- `@tiptap/*` — ProseMirror-based rich-text editor + extensions
- `lowlight` — Syntax highlighting for code blocks

**Auth**
- `@clerk/nextjs` v7 — Authentication, session management, webhooks

**Database & ORM**
- `prisma` + `@prisma/client` — ORM and migrations
- `@neondatabase/serverless` — Neon Postgres serverless driver

**AI**
- `@anthropic-ai/sdk` — Claude API client (Haiku, Sonnet, Opus)

**Storage**
- `@aws-sdk/client-s3` — S3-compatible client for Cloudflare R2

**Background Jobs**
- `pg-boss` v10 — PostgreSQL-backed durable job queue and cron scheduler

**Google Integration**
- `googleapis` — Google Drive API client

**Parsing & NLP**
- `chrono-node` — Natural language date parsing (Tier 1)
- `compromise` / `compromise.js` — NLP entity extraction (Tier 1)
- `gray-matter` — Markdown front-matter parsing
- `marked` — Markdown → HTML conversion
- `mammoth` — `.docx` → HTML conversion

**PDF Generation**
- `pdfkit` — Pure Node.js PDF generation (note export)

**Email**
- `resend` — Email sending + inbound webhook integration
- `mailparser` — Parse raw inbound email content

**Date & Time**
- `date-fns` / `date-fns-tz` — Date manipulation and timezone-aware formatting

**Logging**
- `pino` + `pino-pretty` — Structured JSON logging with pretty-print in development

**Utilities**
- `uuidv7` — UUIDv7 generation for sortable PKs
- Node.js `crypto` (built-in) — AES-256-GCM encryption for OAuth tokens
- `rrule` — RFC 5545 recurrence rule parsing and generation

---

## Gotchas

- **Always run `prisma generate` after schema changes** — the Prisma client is not auto-regenerated in dev.
- **`reattachOrphanData()` must be updated** whenever a new table with `user_id` is added — see comment in `schema.prisma`.
- **Do not modify `.github/workflows/ci.yml`** — CI is managed separately.
- **R2 signed URLs expire** — the `import-cleanup` job must run to avoid stale URL references in the DB.
- **pg-boss requires the same `DATABASE_URL`** as Prisma — it creates its own schema (`pgboss`) in the same Postgres instance.
- **Clerk webhooks require `CLERK_WEBHOOK_SECRET`** — missing this causes silent auth event drops.
- **`ENCRYPTION_KEY` must be exactly 32 bytes** for AES-256-GCM — validate on startup.

---

## Pointers

- Schema: `prisma/schema.prisma`
- tRPC app router: `src/server/routers/_app.ts`
- Job registry: `src/core/jobs/registry.ts`
- AI client + cost constants: `src/core/ai/index.ts`
- Capture pipeline: `src/core/capture/service.ts`
- Stratum tokens: `src/styles/tokens.css`
- Orphan recovery: `src/core/auth/orphan-recovery.ts`
- Post-merge script: `scripts/post-merge.sh`
