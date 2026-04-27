# Replit Agent Prompt — Wave 1: Atlas Foundation Layer

## Read this entire prompt before taking any action. Do not start coding until you have read all sections including the Rules of Engagement.

---

## 1. Wave 1 Overview

Wave 0 produced a working Next.js project with the complete Stratum design system (41 components, Storybook, dark/light themes). Wave 1 builds the **foundation layer** — every piece of backend infrastructure that subsequent product modules will depend on.

**No product features will be built in this wave.** No Tasks, no Calendar, no CRM, no Notes, no Journal. Wave 1 is invisible from a product standpoint but architecturally critical. Mistakes here compound through every subsequent wave.

By end of Wave 1, the user must be able to:

1. Sign in to Atlas with Google or magic link (via Replit Auth)
2. See their user record exists in the database with proper fields
3. Link a Google Drive folder or Shared Drive to Atlas via a setup flow
4. Upload a test file to Object Storage and retrieve it
5. Make a test AI completion call and see the response
6. View a health dashboard at `/admin/health` that confirms every foundation component is operational

The user is not a programmer. **Verification of "it works" must be possible without reading code.** Every piece of infrastructure in this wave must surface a user-visible signal of correctness.

---

## 2. Hard Stack Requirements (continuing from Wave 0)

Continue with the stack established in Wave 0. Add the following:

| Layer | Technology | Notes |
|---|---|---|
| Database | **Replit's managed Postgres** | Connection string auto-provided as `DATABASE_URL` env var |
| ORM | **Prisma** | Already installed in Wave 0; now configure schema and migrations |
| Authentication | **Replit Auth** | Use Replit's native auth integration; expose Google sign-in AND magic link options |
| Logging | **Pino** | Already specified; configure transports |
| Date utilities | **date-fns + date-fns-tz** | Already specified; build wrapper utilities |
| Drive integration | **googleapis npm package** | Official Google API client |
| AI | **Replit's native Claude integration** | Build provider abstraction; first provider is Claude via Replit |
| ID generation | **`uuid` v9+** | For UUIDv7 generation |

**Do NOT install:**
- Auth.js / NextAuth (deferred to commercial phase)
- Sentry (deferred to commercial phase)
- Any UI library other than what Wave 0 already established

---

## 3. Wave 1 Deliverables

The wave is complete when ALL of the following exist and work:

### 3.1 Database schema and migrations

Create the following Prisma schema. All entities use UUIDv7 primary keys, all timestamps are `TIMESTAMPTZ` in UTC, all entities have soft delete columns.

**Foundation entities for Wave 1 (only these — module entities come in their respective waves):**

```prisma
model User {
  id                String    @id @default(uuid()) @db.Uuid
  email             String    @unique
  name              String?
  image             String?
  timezone          String    @default("UTC")
  date_format       String    @default("DD/MM/YYYY")
  time_format       String    @default("24h")
  week_start        Int       @default(1)
  theme             String    @default("dark")
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  sessions          Session[]
  audit_logs        AuditLog[]
  integration_tokens IntegrationToken[]
  ai_call_logs      AICallLog[]
  attachments       Attachment[]
  drive_config      DriveConfig?
}

model Session {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  expires_at        DateTime  @db.Timestamptz
  created_at        DateTime  @default(now()) @db.Timestamptz
  
  @@index([user_id])
  @@index([expires_at])
}

model AuditLog {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  entity_type       String
  entity_id         String    @db.Uuid
  action            String    // create | update | delete | restore | complete | archive
  diff              Json?     // Changed fields only, not full snapshots
  actor_type        String    @default("user")  // user | system | sync
  created_at        DateTime  @default(now()) @db.Timestamptz
  
  @@index([user_id, created_at])
  @@index([entity_type, entity_id])
}

model IntegrationToken {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  provider          String    // "google_drive" | "google_calendar" | "google_contacts" | future
  access_token      String    // Encrypted at rest
  refresh_token     String?   // Encrypted at rest
  expires_at        DateTime? @db.Timestamptz
  scope             String[]
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  
  @@unique([user_id, provider])
}

model SyncState {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  provider          String
  resource          String    // "drive_files" | "drive_changes" | future
  sync_token        String?
  last_full_sync    DateTime? @db.Timestamptz
  last_incremental  DateTime? @db.Timestamptz
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  
  @@unique([user_id, provider, resource])
}

model RateLimitTracker {
  id                String    @id @default(uuid()) @db.Uuid
  provider          String
  scope             String    // "global" | user_id
  request_count     Int       @default(0)
  window_start      DateTime  @db.Timestamptz
  created_at        DateTime  @default(now()) @db.Timestamptz
  
  @@unique([provider, scope, window_start])
  @@index([provider, scope])
}

model AICallLog {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  task              String    // "capture_parse" | "test" | future tasks
  model             String    // "claude-haiku" | "claude-sonnet" | "claude-opus"
  prompt_version    String?
  input_tokens      Int
  output_tokens     Int
  estimated_cost_usd Decimal  @db.Decimal(10, 6)
  duration_ms       Int
  success           Boolean
  error             String?
  created_at        DateTime  @default(now()) @db.Timestamptz
  
  @@index([user_id, created_at])
  @@index([task, created_at])
}

model Attachment {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  filename          String
  mime_type         String
  size_bytes        BigInt
  storage_path      String    // Path in Replit Object Storage
  drive_file_id     String?   // Set after Drive backup
  created_at        DateTime  @default(now()) @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  @@index([user_id])
}

model DriveConfig {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @unique @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  drive_type        String    // "personal" | "shared"
  drive_id          String?   // Null for personal drive root
  root_folder_id    String    // The Atlas root folder created in user's Drive
  root_folder_path  String    // Human-readable path for display
  configured_at     DateTime  @default(now()) @db.Timestamptz
  last_verified_at  DateTime? @db.Timestamptz
}
```

Create the initial migration. Verify it runs successfully against Replit's Postgres.

### 3.2 Soft delete middleware

Implement Prisma middleware that:
- Intercepts `delete` calls and converts to `update { deleted_at: now() }`
- Intercepts `findMany`, `findFirst`, `findUnique` and adds `where: { deleted_at: null }` by default
- Provides an explicit escape hatch (e.g., `includeDeleted: true` option) for accessing trash

This must work for all entities with a `deleted_at` column. Apply globally via a single middleware registration.

### 3.3 Audit log infrastructure

Implement an audit logger module at `core/audit/` that:
- Provides a function `logActivity({ user_id, entity_type, entity_id, action, diff, actor_type })` that writes to AuditLog
- Computes diffs automatically when given before/after entity states (changed fields only, not full snapshots)
- Is called automatically from a Prisma middleware on create/update/delete operations on entities that opt in (via a list of entity types)
- For Wave 1: User entity is the only entity opted in (no module entities exist yet)

### 3.4 Timezone and date utilities

Build `core/dates/` module with:

- `now()` — returns current time as ISO string in UTC
- `toUserTimezone(date, user)` — converts UTC date to user's timezone
- `formatDate(date, user)` — formats per user's `date_format` and timezone
- `formatTime(date, user)` — formats per user's `time_format` and timezone
- `formatDateTime(date, user)` — combined
- `today(user)` — returns user's "today" as a date in their timezone
- `yesterday(user)`, `tomorrow(user)` — same logic
- `parseUserDate(dateString, user)` — parses a user-format date string back to UTC
- `isToday(date, user)`, `isThisWeek(date, user)` — relative checks in user's timezone

All functions are unit-tested against fixture users in three timezones (UTC, Asia/Karachi UTC+5, America/Los_Angeles UTC-8). Tests cover DST transitions and year boundaries.

### 3.5 Replit Auth integration

Configure Replit Auth to provide:

- **Google sign-in option** — visible on the sign-in page
- **Magic link sign-in option** — visible on the sign-in page, accepts email and sends a sign-in link
- **Sign-out** — accessible from a user menu in the top bar

On first sign-in:
- Create a User record with email, name, image from Replit Auth
- Default timezone, date_format, time_format to user's locale if available, else fallback (timezone: `UTC`, date_format: `DD/MM/YYYY`, time_format: `24h`)
- Create a Session record

On subsequent sign-ins:
- Update existing User record's last-seen, refresh Session
- Do not overwrite user-customized fields (timezone, theme, etc.)

The sign-in page should be accessible at `/sign-in` and use Stratum's design system. It should NOT look like a default Replit Auth page — it should match Atlas's visual identity.

After sign-in, redirect to `/`. Unauthenticated users hitting any route except `/sign-in` are redirected to sign-in.

### 3.6 Object Storage primitive

Build `core/storage/` module with:

- `uploadFile({ user_id, file, filename, mimeType })` — uploads to Replit Object Storage at path `users/{user_id}/attachments/{year}/{month}/{file_id}-{filename}`, creates Attachment record, returns Attachment
- `getFile(attachment_id, user_id)` — returns a signed URL or stream, with auth check
- `deleteFile(attachment_id, user_id)` — soft-deletes Attachment (storage cleanup runs on hard-delete cron, not implemented in Wave 1)
- All functions check `user_id` matches Attachment's `user_id` — never serve another user's file

Image processing, deduplication, and thumbnail generation are explicitly **not** in Wave 1 (Wave 4 concerns).

### 3.7 Comprehensive Drive integration

This is the largest piece of Wave 1. Build `core/drive/` as a proper module designed to support eventual full document management by Phase 3.

**3.7.1 OAuth flow:**

- User clicks "Link Google Drive" in Settings
- OAuth flow requests these scopes:
  - `https://www.googleapis.com/auth/drive.file` — files Atlas creates
  - `https://www.googleapis.com/auth/drive.readonly` — to browse user's existing folders/Shared Drives during setup
  - `https://www.googleapis.com/auth/drive.metadata.readonly` — folder/file metadata
- Tokens stored encrypted in IntegrationToken table
- Refresh tokens persisted; access tokens auto-refreshed before expiry via a token refresher utility

**3.7.2 Drive linking flow (user-facing):**

After OAuth, user goes through a setup wizard:

1. **Choose Drive type:** "Use my personal Google Drive" or "Use a Shared Drive"
2. **If Shared Drive:** list user's Shared Drives, let them pick one
3. **Choose folder:** browse the chosen Drive's folder structure, navigate, select the parent folder where Atlas should create its folder. Default suggestion: root of Drive (or root of Shared Drive). Allow create-new-folder during browsing.
4. **Confirm:** show "Atlas will create a folder named 'Atlas' inside [chosen path]. All Atlas backups and synced files will live here. Continue?"
5. **Create folder structure:** Atlas creates the following inside the chosen parent:
   ```
   /Atlas/
     /database-backups/
     /notes/
       /project-briefs/
       /meeting-notes/
       /research/
       /strategy-docs/
       /general/
     /journal/
     /attachments/
   ```
6. **Save DriveConfig** with drive_type, drive_id (if Shared Drive), root_folder_id, root_folder_path
7. **Show success:** "Drive linked successfully. Atlas folder is at [path]."

**3.7.3 Drive primitives:**

Build the following primitives as the foundation for current and future Drive use:

- `linkDrive({ user_id, drive_type, drive_id, parent_folder_id })` — runs the folder creation, saves DriveConfig
- `unlinkDrive({ user_id })` — removes DriveConfig and IntegrationToken (does not delete Drive folder)
- `verifyDriveConfig({ user_id })` — checks linked folder still exists and is accessible; updates `last_verified_at`
- `listSharedDrives({ user_id })` — lists user's Shared Drives for setup wizard
- `browseFolder({ user_id, folder_id, drive_id })` — lists folders inside a given folder (for setup wizard navigation)
- `createFolder({ user_id, parent_id, name })` — creates a folder
- `uploadFile({ user_id, parent_id, file, name, mimeType, metadata })` — uploads a file
- `downloadFile({ user_id, file_id })` — downloads a file
- `updateFile({ user_id, file_id, file?, metadata? })` — updates content or metadata
- `deleteFile({ user_id, file_id })` — moves to trash (Drive trash, not Atlas trash)
- `moveFile({ user_id, file_id, new_parent_id })` — moves between folders
- `getFileMetadata({ user_id, file_id })` — returns full metadata including parents, permissions
- `listFiles({ user_id, query? })` — query-based file listing using Drive's `q` parameter
- `getChanges({ user_id, page_token? })` — uses Drive's `changes.list` for incremental sync (returns changes since token)

All primitives go through the rate-limit-aware request queue (see 3.9).

**3.7.4 What Wave 1 does NOT do:**

- Does not actually back up any files (no markdown files exist yet)
- Does not run periodic sync (no source data yet)
- Does not build a Drive browser UI inside Atlas (Phase 3)
- Does not handle conflict resolution for files modified externally (Phase 2+)
- Does not implement permission management (Phase 2+)

The primitives exist; the consumers come in later waves.

### 3.8 Pino logging

Configure Pino with:

- JSON structured output
- Log levels: trace, debug, info, warn, error, fatal
- Default level: `info` in production, `debug` in development
- Logs include: timestamp, level, message, request_id (if from HTTP), user_id (if authenticated)
- HTTP request logging middleware that logs every incoming request and outgoing response
- Logs visible via Replit's native log viewer

Provide a logger module `core/logging/` exporting `logger` (root) and `createLogger(context)` for module-scoped loggers.

### 3.9 Rate-limit-aware request queue

Build `core/queue/` module that provides:

- A generic queue interface for outbound API requests
- Per-provider quota tracking using RateLimitTracker
- Priority levels: `USER` (immediate, highest), `BACKGROUND_HIGH`, `BACKGROUND_LOW`
- Exponential backoff with jitter on 429 / 5xx errors
- Maximum retry count (default 5) before dead-letter
- Dead-letter queue for repeatedly failing requests (logged for review)
- Configuration per provider (requests/minute, requests/day)

For Wave 1, configure the queue for:

- `google_drive`: 1000 requests/100 seconds per user, 10000/day per user (Drive's actual limits)
- `claude_via_replit`: rate limits depend on Replit's integration; configure conservative defaults (60/minute)

All Drive primitives (3.7.3) and AI calls (3.10) route through the queue.

### 3.10 AI abstraction layer

Build `core/ai/` module with:

- Provider-abstracted interface: `ai.complete({ task, prompt, context?, options? })`
- Initial provider: Claude via Replit's native integration
- Task → model routing config table (database-backed, editable):
  - Default `test` task → Claude Haiku
  - Default `capture_parse` task → Claude Haiku (used in Wave 3)
- Every call logged to AICallLog with token counts, cost estimate, duration, success/error
- Cost estimation uses Anthropic's published pricing (Haiku: $0.25/$1.25 per M input/output tokens; Sonnet: $3/$15; Opus: $15/$75)

Build a test endpoint `/api/ai/test` (authenticated, GET) that:
- Accepts a `prompt` query param (default: "Say hello in 3 words")
- Calls `ai.complete({ task: 'test', prompt })`
- Returns the response, model used, tokens, cost, duration

This is your verification surface that AI works end-to-end.

### 3.11 tRPC scaffolding

Set up tRPC with:

- Server at `/server/trpc.ts` — root router, context factory (with auth), error formatter
- Procedure helpers: `publicProcedure`, `protectedProcedure` (requires authenticated user)
- Routers in `/server/routers/`:
  - `health` router — public procedures for health checks
  - `user` router — protected procedures for current user info
  - `drive` router — protected procedures for Drive operations
- Client setup at `/lib/trpc.ts` — typed client, React Query integration
- App-wide tRPC provider in root layout

For Wave 1, only implement procedures needed for verification:

- `health.ping` — returns `{ status: 'ok', timestamp }`
- `health.full` — returns full health status of all foundations (used by /admin/health page)
- `user.me` — returns current user record
- `drive.linkStatus` — returns whether Drive is linked and where
- `drive.startLinkFlow` — initiates OAuth + linking flow
- `drive.completeLinkFlow` — handles OAuth callback and folder creation
- `drive.unlink` — removes Drive config

Real procedures (CRUD on Tasks, Notes, etc.) come in their respective waves.

### 3.12 Health dashboard at /admin/health

This is the user-facing verification surface. Build a page at `/admin/health` (protected, only signed-in user sees it) that displays the status of every foundation component:

```
Atlas Health Check                          Last checked: 2 seconds ago

✓ Database                                  Connected (Neon, 12ms)
✓ Authentication                            Signed in as umar@example.com
✓ Object Storage                            Test upload succeeded
✓ Drive Integration                         Linked to "Atlas" in Shared Drive "Devsinc"
✓ AI Integration                            Test completion: "Hello there friend" (Haiku, 240ms, $0.0001)
✓ Logging                                   Pino streaming to Replit logs
✓ Rate Limit Queue                          Operational
✓ tRPC                                      All routers responding

[Re-run all checks]   [View detailed logs]
```

For each check, run a real verification:
- Database: `SELECT 1` query
- Auth: confirm session exists and user record loads
- Object Storage: upload a tiny test file, retrieve it, delete it
- Drive: if linked, call `verifyDriveConfig`; if not linked, show "Not linked yet — [Link now]" CTA
- AI: call the test endpoint
- Logging: emit a test log line, confirm it would appear (won't read back from Replit logs in code, but verify Pino is initialized)
- Rate Limit Queue: check queue is initialized, no items in dead-letter
- tRPC: ping the health.ping procedure

Show green check on success, red X on failure with the error message visible. The user (Umar) reviews this page to confirm Wave 1 is complete.

### 3.13 Settings page foundations

Build a Settings page at `/settings` with sections for:

- **Profile** — name, email (read-only from auth), timezone (dropdown of IANA timezones), date format (dropdown), time format (12h/24h toggle), week start (Sunday/Monday toggle)
- **Theme** — dark / light / system
- **Integrations** — Drive (linked status, link/unlink, change folder)

Save-on-blur for profile fields. No detailed settings beyond what's needed to make foundations operational.

---

## 4. File Structure (additions to Wave 0)

```
/atlas
  /app
    /(auth)
      /sign-in/page.tsx
    /(app)
      /admin
        /health/page.tsx
      /settings/page.tsx
    /api
      /ai
        /test/route.ts
      /trpc
        /[trpc]/route.ts
      /drive
        /oauth-callback/route.ts
  /core
    /audit/                       # Audit logger
    /dates/                       # Timezone/date utilities  
    /storage/                     # Object Storage primitives
    /drive/                       # Drive integration module
      client.ts
      auth.ts
      primitives.ts
      linking.ts
    /queue/                       # Rate-limit-aware queue
    /ai/                          # AI abstraction layer
    /logging/                     # Pino setup
    /db/                          # Prisma client + middleware
  /server
    /trpc.ts
    /routers/
      health.ts
      user.ts
      drive.ts
  /lib
    /trpc.ts                      # Client setup
  /prisma
    schema.prisma
    /migrations/
```

---

## 5. Verification (Definition of Done)

Wave 1 is complete when the user (Umar) can perform this verification flow:

1. Open the deployed Atlas app
2. Click "Sign in with Google" and complete sign-in
3. Get redirected to `/`
4. Navigate to `/settings`
5. Set timezone to `Asia/Karachi`, save
6. Click "Link Google Drive" and complete the linking flow
7. Choose a Shared Drive (or personal Drive) and folder
8. See success: "Atlas linked to [folder path]"
9. Open Google Drive in another tab and see the `Atlas/` folder structure created
10. Navigate to `/admin/health`
11. See all green checks
12. Sign out from user menu
13. Get redirected to `/sign-in`
14. Sign in with magic link instead — confirm both auth methods work

When all 14 steps pass, Wave 1 is complete.

---

## 6. Rules of Engagement (continued from Wave 0)

All Wave 0 rules continue to apply. Adding for Wave 1:

### 6.1 Verification is non-negotiable

Every foundation must have a user-clickable verification path. The user is not a programmer — they cannot verify by reading code or running tests. If a feature works but cannot be verified by the user without code access, it is not complete.

### 6.2 Don't trust the agent's "this works"

When you (Replit Agent) finish a section, do not say "this is complete" without explaining how the user can verify it. Every completion message must include: "To verify, navigate to X and click Y. You should see Z."

### 6.3 Schema discipline

The schema in 3.1 is the complete Wave 1 schema. Do not add fields, tables, or relationships not specified. Do not anticipate future modules' schema. If you find yourself wanting to add a field "for later," stop — that field gets added in the wave that needs it.

### 6.4 Drive integration architectural discipline

The Drive primitives in 3.7.3 are the *only* Drive operations that should exist in the codebase. All future Drive use (markdown sync, file uploads, document management) goes through these primitives. Do not write ad-hoc Drive API calls outside `core/drive/`.

### 6.5 Encrypted token storage

OAuth refresh tokens and access tokens MUST be encrypted at rest. Use a symmetric encryption library (e.g., `@noble/ciphers` or Node's built-in `crypto`) with a key from environment variable `TOKEN_ENCRYPTION_KEY`. Generate the key once during setup; document its existence in `.env.example` (without the value). Plaintext tokens in the database are a Wave 1 failure condition.

### 6.6 Audit log defaults to off

The audit log infrastructure is built in Wave 1 but only the User entity is opted in. Module entities will opt in during their respective waves. Don't audit every entity by default — that's an explicit decision per entity type.

### 6.7 Soft delete defaults to on

The opposite of audit log. Every entity with a `deleted_at` column has soft delete enforced by default. Hard delete requires explicit override.

### 6.8 No premature optimization

Wave 1 is foundation, not optimization. Don't add caching, don't add CDN, don't add database read replicas, don't add rate limiting on inbound requests (only outbound). These are commercial-phase concerns.

---

## 7. Recommended Build Sequence

Build in this order:

1. **Database schema and Prisma setup** — schema, migration, generated client, connection working
2. **Logging** — Pino initialized, request logging middleware, verify logs appear in Replit log viewer
3. **Date utilities** — implement and test against timezone fixtures
4. **Soft delete + audit middleware** — Prisma middleware registered, tested with User entity
5. **Replit Auth integration** — sign-in page, sign-in flow, user record creation, session management, sign-out
6. **tRPC scaffolding** — server setup, client setup, health.ping working end-to-end
7. **Object Storage primitive** — upload/get/delete with auth, integrated with Attachment entity
8. **Rate-limit queue** — generic queue with Drive and Claude provider configs
9. **AI abstraction** — provider interface, Claude integration, AICallLog, test endpoint
10. **Drive integration** — OAuth flow, primitives, linking wizard, DriveConfig storage
11. **Settings page** — profile section, theme, Drive linking
12. **Health dashboard** — wire up all foundation checks, verify UX

Each step concludes with the user (Umar) being able to verify it works before moving on.

---

## 8. Definition of Done

Wave 1 is complete when:

- [ ] Schema is migrated against Replit's Postgres
- [ ] Soft delete middleware works for User entity
- [ ] Audit log records User entity changes
- [ ] Date utilities pass tests in 3 timezones
- [ ] Sign-in with Google works
- [ ] Sign-in with magic link works
- [ ] Sign-out works
- [ ] User record is created on first sign-in with proper defaults
- [ ] Settings page allows timezone, date/time format, theme changes
- [ ] Object Storage upload/get/delete works
- [ ] Drive OAuth flow completes successfully
- [ ] Drive linking wizard creates folder structure correctly
- [ ] Drive primitives all implemented
- [ ] Personal Drive AND Shared Drive both supported
- [ ] AI test endpoint returns a Claude completion
- [ ] AICallLog records the call
- [ ] Pino logs visible in Replit log viewer
- [ ] Rate limit queue operational
- [ ] All tRPC procedures return expected results
- [ ] /admin/health shows all green
- [ ] User can complete the full verification flow in section 5
- [ ] No TypeScript errors, ESLint passes
- [ ] No tokens stored in plaintext
- [ ] No Drive API calls exist outside core/drive/

When all boxes are checked, summarize:
- What was built
- What deviated from spec (if anything) and why
- What questions or issues arose
- Recommended starting point for Wave 2

---

## 9. What is NOT in Wave 1

Do not build any of the following:

- Tasks, Projects, Notes, JournalEntries, Contacts entities or features (Waves 3-7)
- Calendar integration (Wave 5)
- Contacts integration (Wave 6)
- Email-to-inbox endpoint (Wave 3)
- Markdown editor (Wave 4)
- Search infrastructure (Waves 3-4)
- Knowledge graph (Wave 4)
- Backup runner / scheduled jobs (Wave 4 onwards)
- Vector embeddings activation (Phase 2)
- Real-time updates (Phase 2)
- Email/password auth (commercial phase)
- Auth.js (commercial phase)
- Sentry (commercial phase)
- Mobile-specific features (Phase 2)

---

## 10. Final note

Wave 1 is invisible from a product standpoint but architecturally critical. Every product feature in subsequent waves depends on these foundations. A weak foundation here means weak features everywhere downstream.

Take the time. Verify each step. Don't move on until the user has confirmed.

When in doubt: **ask before assuming. Verify before declaring done.**

Begin with section 7, step 1.
