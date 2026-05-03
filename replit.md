# Atlas — Personal Productivity Command Center

## Overview
Atlas is a desktop-first personal productivity command center built as a local-first capture intelligence system. It processes user input by prioritizing cost-effective local parsing (chrono-node, regex, compromise.js) and using Claude Haiku only as a fallback for ambiguous cases, significantly reducing AI costs. The app is live in production at a `.replit.app` domain, backed by Neon Postgres, with Clerk authentication and Cloudflare R2 for file storage.

## User Preferences
- Iterative development with clear, concise communication
- Ask before major architectural changes or new dependencies
- Desktop-first experiences throughout
- Strict TypeScript compliance — zero errors
- Clean codebase with consistent Tailwind CSS styling driven by Stratum tokens
- Do not modify `.github/workflows/ci.yml`

## Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS 3.4 + custom Stratum design tokens
- **UI Primitives**: Radix UI, cmdk, vaul, sonner, next-themes
- **API**: tRPC (type-safe end-to-end)
- **ORM**: Prisma
- **Database**: Neon Postgres (production + dev mirror) via `DATABASE_URL_NEON`
- **Auth**: Clerk (`@clerk/nextjs` v7) — clerk_id maps to Prisma `User`
- **Storage**: Cloudflare R2 via `@aws-sdk/client-s3` + presigner
- **AI**: Anthropic Claude (Haiku for parsing, Sonnet for heavier tasks)
- **Editor**: TipTap (ProseMirror-based rich text)
- **Jobs**: pg-boss v10 (durable PostgreSQL-backed cron scheduler)
- **Logging**: Pino + pino-pretty (structured JSON logs)
- **Email**: Resend (inbound webhooks + outbound verification)
- **Dates**: date-fns-tz (timezone-aware)
- **Encryption**: Node.js crypto AES-256-GCM

## Database Architecture

### Connection Strategy
- **App always uses `DATABASE_URL_NEON`** — hardcoded in `src/core/db/index.ts` via `resolveDbUrl()`. `DATABASE_URL` is never used by the app.
- `prisma/schema.prisma` datasource uses `env("DATABASE_URL")` (Prisma default) but `post-merge.sh` overrides `DATABASE_URL=$DATABASE_URL_NEON` before running migrations, so Prisma always migrates Neon.
- Local dev: `DATABASE_URL` → local heliumdb (Replit-managed), `DATABASE_URL_NEON` → Neon
- Production: `DATABASE_URL_NEON` → Neon (the Replit-managed production postgres was disconnected from the deployment to stop the provisioner from auto-running conflicting DDL)

### Migration History (30 migrations on Neon + local postgres)
| Migration | Description |
|-----------|-------------|
| `20260427043022_wave1_foundation` | Foundation schema (User, Project, Task, Context, Tag, AuditLog) |
| `20260427050511_wave1_uuidv7_pks` | Switch all PKs to UUIDv7 |
| `20260427064946_add_drive_subfolder_ids` | Google Drive subfolder tracking |
| `20260427065640_add_capture_model` | CaptureLog model |
| `20260427070137_add_drive_verified_at` | Drive OAuth verification timestamp |
| `20260427135703_wave3a_tasks_module` | Full tasks module schema |
| `20260427154908_wave3b_folders_review` | Notes folder structure |
| `20260427160703_wave3b_user_tasks_prefs` | User task preferences |
| `20260427180118_wave3c_capture_pipeline` | Capture pipeline models |
| `20260427185728_add_attachment_task_id` | Attachment → Task FK |
| `20260428065736_add_clerk_id_remove_sessions` | Clerk ID field, remove sessions table |
| `20260429161728_add_waitlist_entry` | WaitlistEntry model |
| `20260429190448_add_task_work_log` | WorkLog model |
| `20260429190636_add_checklist_items` | ChecklistItem model |
| `20260429193843_add_waitlist_status` | Waitlist status enum |
| `20260429193846_add_recurrence_fields` | Task recurrence fields |
| `20260429_add_attachment_media_fields` | Attachment media metadata |
| `20260430181041_add_performance_indexes` | Performance indexes |
| `20260430181042_add_raw_perf_indexes` | Additional raw indexes |
| `20260501000000_add_search_vector_trigger` | FTS search_vector + trigger |
| `20260501000001_add_ai_budget_usd` | AI budget tracking field |
| `20260501100000_wave4a_notes_link_locale_project` | Notes, Link graph, Locale, Project enhancements |
| `20260501110000_wave4a_schema_corrections` | Schema corrections |
| `20260501120000_wave4a_fix_body_json_default` | Fix body JSONB default |
| `20260501130000_normalize_locale_defaults` | Normalize locale defaults |
| `20260501140000_add_user_language` | User language preference |
| `20260502000000_wave4a_free_form_type` | Free-form project type (string, not enum) |
| `20260502100000_wave4b_tables` | Full Tables module (Table, TablesFolder, TableColumn, TableRow, TableCell) |
| `20260502200000_auth_hardening_and_recovery` | clerk_id NOT NULL + unique, orphan recovery columns |
| `20260502300000_fix_search_vector_gin_index` | Recreate GIN index without COALESCE to fix Replit provisioner SQL generation bug |

### Post-merge Script (`scripts/post-merge.sh`)
Runs automatically after every task agent merge:
1. `npm install`
2. `npx prisma generate`
3. Sets `DATABASE_URL=$DATABASE_URL_NEON` (strips surrounding quotes if present)
4. Runs `npx prisma migrate deploy` with 3 retries (handles Neon advisory lock timeouts on pooler connections)

## System Architecture

### Application Shell
- `TwoPaneLayout` with `ModuleSwitcher`, `TopBar`, `CommandPalette` (`⌘K`), `KeyboardShortcutsOverlay` (`⌘/`)
- `CaptureModal` (`⌘⇧I`) — re-engineered quick capture
- Marketing pages at `/`, `/privacy`, `/terms` (authenticated users redirect to `/tasks`)
- Authenticated app under `src/app/(app)/`

### Authentication (`src/core/auth/`)
- Clerk (`@clerk/nextjs` v7) handles all authentication
- `clerk_id` on User is `NOT NULL UNIQUE` (enforced in Neon via migration `20260502200000`)
- `profile-sync.ts` — syncs Clerk profile data to Prisma User on sign-in
- `auth-events.ts` — writes AuditLog entries for auth lifecycle events
- `orphan-recovery.ts` — automatic recovery when a returning user's Clerk ID doesn't match stored record
- `clerk-id-hardening.ts` — enforces clerk_id integrity constraints
- `backfill.ts` — backfills missing clerk_ids from Clerk API
- `scripts/migrate-clerk-id-nulls.ts` — assigns `orphaned_<id>` placeholders to null-clerk_id rows before NOT NULL enforcement

### tRPC Routers (`src/server/routers/`)
| Router | Key Procedures |
|--------|---------------|
| `_app.ts` | Root router combining all sub-routers |
| `admin.ts` | `users.list/get`, `audit.search`, `recoveries.list`, `orphans.listPossible/reattach/softDelete`, `health` |
| `ai.ts` | AI call routing, budget tracking |
| `attachments.ts` | Upload, get, delete (Cloudflare R2) |
| `capture.ts` | Parse, preview, log, stats |
| `checklist.ts` | Checklist CRUD for task checklists |
| `contexts.ts` | Context management |
| `drive.ts` | Google Drive OAuth, sync |
| `emails.ts` | Inbound email webhook handling |
| `folders.ts` | Notes folder CRUD |
| `forecast.ts` | Forecast view data |
| `health.ts` | App health check |
| `jobs.ts` | `list`, `runNow`, `pause`, `resume` (pg-boss integration) |
| `links.ts` | Generic Link graph |
| `media.ts` | Media management |
| `notes.ts` | `list`, `get`, `create`, `update`, `delete`, `search` |
| `notesFolder.ts` | Notes folder tree |
| `projects.ts` | Full project CRUD + `distinctTypes`, type filter |
| `review.ts` | Weekly review |
| `search.ts` | `search.all`, `search.tasks`, `search.notes`, `search.tables` (FTS via GIN index) |
| `session.ts` | Session management |
| `tablesFolders.ts` | Tables folder CRUD with cascade |
| `tables.ts` | Full table CRUD + columns + rows + cells + search |
| `tags.ts` | Tag management |
| `tasks.ts` | Full task CRUD + subtasks + depth enforcement |
| `trash.ts` | Trash / soft-delete recovery |
| `user.ts` | User profile, preferences |
| `waitlist.ts` | Waitlist management |
| `worklogs.ts` | Task work log entries |

### Full-Text Search
- `search_vector` column on Task (populated by DB trigger on insert/update)
- GIN index: `CREATE INDEX "Task_search_vector_gin_idx" ON "Task" USING gin(to_tsvector('english'::regconfig, search_vector))`
- **Note**: The original index used `COALESCE(search_vector, '')` which caused Replit's provisioner SQL generator to corrupt it into `''::t tsvector_ops`. Migration `20260502300000` dropped and recreated it without COALESCE. Search query updated to match.

### Background Jobs (`src/core/jobs/`)
Powered by pg-boss v10. All jobs registered in `jobs/runner.ts`:
| Job | Schedule | Description |
|-----|----------|-------------|
| `drive-sync-notes` | Hourly | Exports notes to Google Drive |
| `drive-sync-tables` | Hourly | Exports tables to Google Drive (JSON schema + CSV) |
| `session-cleanup` | Daily 3am | Cleans expired sessions |
| `trash-retention` | Daily 4am | Permanently deletes items past retention period |
| `attachment-cleanup` | Daily 5am | Removes orphaned R2 attachments |

### Locale & Formatting (`src/core/locale/`)
Pure functions: `formatDate`, `formatNumber`, `formatCurrency`, `formatTime`, `formatDateTime`, `formatRelativeDate`, `formatWeekdayFull/Abbrev`, `formatMonthAbbrev`.
`useLocale()` React hook. Supports Pakistan (PKR), US (USD), UK (GBP), and Custom presets. `language` field maps to date-fns locale for localized weekday/month names. 20 language options in Settings → Preferences.

## Features by Module

### Tasks (`src/app/(app)/tasks/`)
- Full task CRUD with projects, contexts, tags, people assignments
- Subtasks with enforced depth limit
- ChecklistItem model — checklist sections with progress badges
- Forecast view — date-column layout
- Recurrence fields
- Work logs (time tracking per task)
- Soft-delete + trash recovery
- FTS via search_vector GIN index

### Notes (`src/app/(app)/notes/`)
- TipTap (ProseMirror) editor in `src/core/editor/` and `src/components/notes/`
- Extensions: StarterKit, Link, CodeBlockLowlight, TaskList, Underline, Strike, Placeholder, Highlight (multicolor), TextStyle, Color, DragHandle (`@tiptap/extension-drag-handle-react`)
- Block drag handle (`@tiptap/extension-drag-handle-react`) with `nested` enabled — supports dragging list items, blockquotes, task items
- Drop indicator: ProseMirror dropcursor styled in indigo (`#6366f1`, 2px) via StarterKit dropcursor config
- Block context menu: Turn into / Color / Duplicate / Delete (click the grip handle)
- `reference-extension.ts` — `[[note]]`, `#tag`, `@context` trigger plugins
- `slash-command-extension.ts` — `/` block-type command menu (10 block types)
- `markdown-export.ts` / `markdown-import.ts` — round-trip Markdown
- `text-extraction.ts` — JSON→plain text for FTS
- `note-editor.tsx` — 1s debounced auto-save, Cmd+S, image-paste upload, URL-paste-as-link; drop handler invalidates attachment cache immediately
- `editor-bubble-menu.tsx` — BubbleMenu with mark toolbar, link editor, block-type dropdown, color/highlight popover (9 text colors + highlight swatches using Color + Highlight extensions)
- `editor-block-handle.tsx` — official DragHandle extension for block DnD + block context menu (Turn into / Duplicate / Delete / Color submenu via `applyHighlightToBlock()`)
- `reference-picker.tsx` — searchable tRPC-backed dropdown with create-note option
- `AttachmentThumbnail` — real 32×32 image thumbnails via `/api/attachments/{file_id}`, PDF icon, color-coded file type icons
- Backlinks panel, note inspector dialog, purpose template picker
- Notes folder tree (collapsible, drag-to-reorder)
- Google Drive sync (exports notes hourly): body_markdown fallback from body_json via `tiptapToMarkdown()`, proactive OAuth token refresh before sync, hardened quota/rate-limit detection + bounded retry (3 attempts, exponential backoff), richer job result summary (synced/deleted/errors)

### Tables (`src/app/(app)/notes/tables/`) — Wave 4b
Structured-data module peer to Notes.
- **Prisma models**: `Table`, `TablesFolder`, `TableColumn`, `TableRow`, `TableCell` (soft-delete, fractional positions)
- **Column types**: Text, Number, Currency, Date, Checkbox, Single Select
- **Core utilities**: `src/core/tables/types.ts`, `sort.ts`, `filter.ts`, `aggregations.ts` (sum/avg/count/min/max/checked_ratio), `validators.ts`, `export.ts` (JSON schema + CSV)
- **Grid** (`table-grid.tsx`): keyboard nav (Enter=down, Tab=right, Escape=exit), inline editing (click selected cell or type printable char), drag-to-reorder rows (disabled tooltip when sorted), column header sort/rename/move/delete, sticky footer aggregations, empty state ("No rows yet" + Add row), filter-empty state ("No rows match" + Clear filter)
- **6 cell components** in `src/components/tables/cells/`
- **Pages**: `/notes/tables` (all tables), `/notes/tables/[tableId]` (editor), `/notes/tables/folder/[folderId]` (folder view)
- Notes sidebar extended with full Tables section (collapsible folder tree)
- `[[...]]` reference picker includes tables as target type
- `ProjectTablesSection` component (ready to mount in project detail)
- Google Drive sync: full export implementation (JSON schema + CSV, hourly)

### Projects (`src/app/(app)/tasks/projects/`)
- **Free-form project type**: string (1–32 chars, alphanumeric + spaces + hyphens, stored lowercase) — no DB enum
- Built-in types: `project`, `goal` (protected from rename/merge)
- `src/core/projects/type-validation.ts`, `type-suggestions.ts` (adaptive curated), `time-distance.ts` (natural-language deltas), `type-icons.ts`, `type-config-context.tsx`
- Sidebar groups projects dynamically by type (most-used first, then alpha) with per-type collapse state in localStorage
- `[+]` button: custom picker with Core types, Your types, Custom type option (validates + deduplicates case-insensitively)
- All Projects page (`/tasks/projects`): filter pills with `?type=` URL state, "More ▼" overflow for 4+ types
- Project detail header: type/status/target-date selectors, metrics row (N tasks · M active · K completed), last activity
- `projects.distinctTypes()` tRPC procedure: returns `{type, count}[]`
- Project brief display (pinned note with `is_project_brief`), notes section below task list
- Audit log: `project_type_changed`, `project_status_changed`

### Admin Panel (`/admin/*`) — isolated route group
Gated to `umar@rana.pk` only. Non-admin/unauthenticated → 404 (not redirect, to avoid leaking API existence).
- `src/lib/admin-gate.ts`: `ADMIN_EMAILS`, `isAdmin()` helper
- `adminProcedure` in `src/server/trpc.ts` returns NOT_FOUND for both unauthenticated and non-admin
- `AdminShell` layout at `src/components/admin/admin-shell.tsx`

| Route | Description |
|-------|-------------|
| `/admin` | Dashboard — live metric cards (users, content, recoveries, auth events, jobs) |
| `/admin/users` | Users list — search, filter (active/deleted/all), sort, compound cursor pagination |
| `/admin/users/[id]` | User detail — identity, content counts, recent auth events, recovery history |
| `/admin/audit` | Audit log explorer — action/date/warning filters (AND-composed), user picker dropdown, expandable rows |
| `/admin/recoveries` | Recovery activity — orphan recovery events, "Flag as wrong", unrecovered possible orphans |
| `/admin/recoveries/[id]` | Recovery detail |
| `/admin/orphans/[id]` | Orphan investigation — reattach (user-picker dialog, verifyIsOrphan check), soft-delete (verifyIsOrphan check), leave-alone |
| `/admin/jobs` | Jobs view — reuses `JobsManagement` component |

All admin mutations write AuditLog entries with `actor_type: 'admin'`. Cursor pagination uses `[{ primary_sort }, { id: 'asc' }]` compound orderBy for stability under non-unique sorts.

### Settings (`src/app/(app)/settings/`)
- Profile, Appearance, Preferences (locale/formatting/language), Capture, Integrations, AI, Backups, Data, Account, System
- **System page**: lists all registered background jobs — name, description, human-readable schedule, status (Active/Paused), last-run outcome + result, next-run estimate, Run Now / Pause / Resume actions

### Capture Pipeline
- `CaptureModal` (`⌘⇧I`) with hybrid parsing: chrono-node + regex + compromise.js locally, Claude Haiku fallback
- `captures` tRPC router: parse, preview, log, stats
- Email-to-inbox via mailparser + Resend inbound webhooks (with attachment handling and configurable filtering)
- Priority-aware in-memory dispatch queue with DB-backed rate limiting

### Google Drive Integration (`src/core/drive/`)
- 4-step OAuth wizard in Settings → Integrations
- AES-256-GCM encrypted token storage
- Drive token linked + verified via `drive_verified_at`
- Subfolder IDs tracked per user for notes and tables exports
- `src/core/get-base-url.ts` — derives correct public base URL in priority order: `APP_URL` env var → `x-forwarded-proto` + `x-forwarded-host` headers → `REPLIT_DEV_DOMAIN` → req.url fallback. Used in OAuth callback/connect routes to prevent redirects to `0.0.0.0` in Replit's proxied environment.
- `GOOGLE_REDIRECT_URI` must be set to the full public callback URL (`https://atlas.rana.pk/api/drive/oauth-callback`) and registered in Google Cloud Console
- `refreshDriveTokenIfNeeded()` in `client.ts` — proactive token refresh (within 5 min of expiry) before any sync run; refresh failure aborts the run with a clear error

## Key Infrastructure Files
| File | Purpose |
|------|---------|
| `src/core/db/index.ts` | Prisma client — always uses `DATABASE_URL_NEON`, soft-delete middleware, audit middleware |
| `src/core/get-base-url.ts` | Derives correct public base URL for API routes (APP_URL → forwarded headers → REPLIT_DEV_DOMAIN) |
| `src/core/errors/error-handler.ts` | `handleTrpcError()` maps errors to plain-language strings; `withRetry()` exponential backoff for transient failures |
| `src/components/providers/trpc-provider.tsx` | MutationCache global error handler; `safeFetch()` converts HTML 500 pages to structured tRPC errors |
| `src/lib/admin-gate.ts` | Admin email allowlist + `isAdmin()` |
| `src/server/trpc.ts` | tRPC context, `protectedProcedure`, `adminProcedure` |
| `src/middleware.ts` | Clerk auth middleware, route protection |
| `scripts/post-merge.sh` | Post-merge automation (install → generate → migrate Neon, 3 retries) |
| `scripts/migrate-clerk-id-nulls.ts` | Assigns placeholder clerk_ids before NOT NULL enforcement |
| `scripts/validate-migrations.mjs` | Validates migration file integrity |
| `prisma/schema.prisma` | Single source of truth for DB schema |
| `.github/workflows/ci.yml` | CI: lint + type-check + unit tests + integration tests + e2e (Playwright) — **do not modify** |

## Deployment
- **Platform**: Replit
- **Production domain**: `atlas.rana.pk`
- **Database in production**: Neon only (via `DATABASE_URL_NEON`)
- **Replit production postgres**: Disconnected from deployment settings — the app never uses it. Disconnecting it prevents the Replit provisioner from auto-generating conflicting DDL migrations.
- **Migrations in production**: Handled by `scripts/post-merge.sh` on every task agent merge (applies to Neon via `DATABASE_URL_NEON`)
- **GitHub**: `https://github.com/umar-rana/Project-Atlas` (origin remote; push requires `workflow` scope PAT for first push or when updating CI yml)

## External Dependencies
- **Next.js 15** — App Router framework
- **React 19** — UI library
- **TypeScript** — strict mode
- **Tailwind CSS 3.4** — utility-first CSS
- **Radix UI, cmdk, vaul, sonner** — UI primitives
- **next-themes** — dark mode
- **@clerk/nextjs v7** — authentication
- **Prisma** — ORM
- **Neon Postgres** — primary database (production + dev)
- **pg-boss v10** — durable PostgreSQL-backed job scheduler
- **TipTap** — rich-text editor (ProseMirror-based)
- **@tiptap/extension-drag-handle + @tiptap/extension-drag-handle-react** — block drag handle (nested mode enabled)
- **lowlight** — syntax highlighting for code blocks
- **Anthropic Claude** — AI parsing (Haiku) and assistance (Sonnet)
- **Cloudflare R2** — file attachment storage (`@aws-sdk/client-s3` + presigner)
- **Google Drive API (googleapis)** — Drive integration
- **date-fns-tz** — timezone-aware date utilities
- **chrono-node, compromise.js** — local-first NLP parsing
- **mailparser** — email content parsing
- **Resend** — inbound email webhooks + outbound emails
- **Pino + pino-pretty** — structured logging
- **Node.js crypto** — AES-256-GCM encryption
- **uuidv7** — UUIDv7 primary key generation
