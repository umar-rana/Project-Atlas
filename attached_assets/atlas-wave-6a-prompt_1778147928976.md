# Replit Agent Prompt — Atlas Wave 6a

## Read this entire document before taking any action.

---

## 1. Overview

Wave 6a establishes the Atlas Calendar foundation. It's a foundation wave, not a refinement — its purpose is to make Calendar exist so future refinement waves (4d, 5a-ii integrations, 5b, 5c) can integrate with it cleanly from day one rather than shipping with placeholder panes.

The shape:
- **Read-only Google Calendar sync** — Atlas pulls events; never writes back. Mirrors the Drive and Contacts patterns
- **Atlas-native time blocks** — events created in Atlas live in Atlas only, not pushed to Google
- **Cross-module integration scaffolding** — links to Tasks, Projects, People, Notes; pickers and shortcuts that future modules can extend
- **Calm UI** — same principles as People: facts not judgments, no notifications, no nagging

**Pre-requisites — all must be live:**

- Wave 4a (Notes), Wave 4b (Tables), Wave 4 Refinement
- Auth Hardening CR (orphan recovery, Clerk ID primary lookup)
- Existing Google Drive OAuth flow at `/api/drive/oauth/*` (token encryption pattern, callback handling)
- Capture Intelligence (three-tier parsing pipeline) — for the "Create task from event" affordance
- Existing Forecast view in Tasks module
- Existing Stratum design tokens

**Deliberately NOT a pre-requisite:**
- Wave 5a-i / 5a-ii (People). The PersonInteraction "Pick from calendar" affordance ships in Wave 6a as a stub that becomes functional once 5a-ii is live; if 5a-ii ships first, the stub becomes wired automatically.

**The work — 13 items in four groups:**

**Schema and sync (4 items)**
1. `CalendarEvent` model + `GoogleCalendar` model + `CalendarEventAttendee` model
2. Google Calendar OAuth scope and connection flow (Settings → Integrations)
3. Daily sync job + on-demand refresh (windowed: past 30 days + next 90 days, incremental sync tokens)
4. Multi-calendar handling — list user's Google calendars, per-calendar visibility and sync toggles

**Views (3 items)**
5. `/calendar` route with Day, Week, Month views (default Week)
6. Today's events on dashboard
7. Color-coded by source calendar (with per-user override)

**Time blocks (3 items)**
8. Atlas-native event creation (drag-to-create on grid, "Block time" actions)
9. "Block time for this task" affordance from task detail
10. Linked-task rendering on calendar grid (task icon, click → task detail)

**Cross-module integration scaffolding (3 items)**
11. Forecast view: calendar overlay for the date range
12. PersonInteraction "Pick from calendar" affordance (stub now, fully wired by 5a-ii ship)
13. Calendar event detail: shortcuts to "Create task from this," "Log as interaction," "Link to project," "Link to note"

**Estimated scope:** 4 weeks of focused work.

---

## 2. Stack constraints (do not deviate)

- **Framework**: Next.js 15 App Router with React 19 RSC
- **Type safety**: TypeScript strict, tRPC v11, Zod for input validation
- **ORM**: Prisma against Neon Postgres
- **PKs**: UUIDv7 via `newId()` from `src/core/db.ts` for every new row
- **Design system**: Stratum tokens from `src/styles/tokens.css`. **Zero hardcoded hex values anywhere in components.**
- **UI primitives**: shadcn/ui via Radix. Tooltips through `<Hint>` from `src/components/ui/hint.tsx`.
- **Icons**: lucide-react
- **Calendar UI library**: `react-big-calendar` is the recommended choice for Day/Week/Month grid rendering. Theme it with Stratum tokens via the library's CSS custom property surface. If the library cannot be themed cleanly to Stratum, fall back to a custom build using `date-fns` for date math — but document the decision in code comments. Do **not** mix grid libraries.
- **Date math**: `date-fns` (likely already in stack)
- **RRULE handling**: `rrule` package for parsing Google's recurrence strings; expand to instances at query time, do not store expanded instances
- **Google API**: `googleapis` npm package
- **Token encryption**: AES-256-GCM via Node `crypto` — same pattern as the existing Drive OAuth tokens. `ENCRYPTION_KEY` env var is the same key used elsewhere.
- **Soft-delete**: every new model with content carries `deleted_at TIMESTAMPTZ?`
- **Audit log**: every meaningful entity change writes to `AuditLog` via `logActivity()`
- **Locale and timezone**: events stored with their original timezone; rendered in the user's locale timezone via `useLocale()` and `formatInTimeZone()` from `date-fns-tz` if needed
- **Logging**: Pino via `src/core/logging.ts`
- **Orphan recovery**: every new table with `user_id` **must** be added to `reattachOrphanData()` in `src/core/auth/orphan-recovery.ts`. `CalendarEvent`, `GoogleCalendar`, and `GoogleCalendarOAuthToken` all have `user_id`. `CalendarEventAttendee` cascades through `CalendarEvent`.
- **CI**: do not modify `.github/workflows/ci.yml`

---

## 3. Detailed deliverables

### 3.1 Schema

#### 3.1.1 `GoogleCalendarOAuthToken`

Stores the user's Google Calendar OAuth tokens. Separate model from any existing Drive token model — clean separation for v1, refactor to a generalized `GoogleOAuthToken` later if patterns proliferate.

```prisma
model GoogleCalendarOAuthToken {
  id              String   @id @db.Uuid
  user_id         String   @db.Uuid @unique  // one token row per user
  
  access_token_encrypted   String                  // AES-256-GCM
  refresh_token_encrypted  String
  token_iv                 String                  // initialization vector
  token_auth_tag           String                  // GCM auth tag
  
  scopes          String                          // space-separated, e.g., 'https://www.googleapis.com/auth/calendar.readonly'
  expires_at      DateTime @db.Timestamptz
  
  created_at      DateTime @default(now()) @db.Timestamptz
  updated_at      DateTime @updatedAt @db.Timestamptz
  
  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
}
```

Add to `reattachOrphanData()` and the schema comment list.

#### 3.1.2 `GoogleCalendar`

Each Google calendar the user has access to (work, personal, team, holidays, etc.). Synced from `calendarList.list`.

```prisma
model GoogleCalendar {
  id                  String   @id @db.Uuid
  user_id             String   @db.Uuid
  google_calendar_id  String                              // Google's calendar ID
  
  name                String                              // user-visible name from Google
  description         String?
  color               String?                             // Google's assigned color (Stratum-mapped or raw hex stored)
  color_override      String?                             // user override; Stratum token name
  
  timezone            String?                             // calendar's default timezone
  is_primary          Boolean  @default(false)            // is this the user's primary Google calendar
  is_visible          Boolean  @default(true)             // user toggle: show events from this calendar in Atlas
  sync_enabled        Boolean  @default(true)             // user toggle: pull events from this calendar at all
  
  sync_token          String?                             // Google's nextSyncToken for incremental sync
  last_synced_at      DateTime? @db.Timestamptz
  
  created_at          DateTime @default(now()) @db.Timestamptz
  updated_at          DateTime @updatedAt @db.Timestamptz
  deleted_at          DateTime? @db.Timestamptz
  
  user                User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  events              CalendarEvent[]
  
  @@unique([user_id, google_calendar_id])
  @@index([user_id])
}
```

Add to `reattachOrphanData()`.

#### 3.1.3 `CalendarEvent`

Both Google-synced events and Atlas-native time blocks live in this table, distinguished by `source`.

```prisma
model CalendarEvent {
  id                    String    @id @db.Uuid
  user_id               String    @db.Uuid
  
  // Source
  source                String    // 'google' | 'atlas'
  source_event_id       String?                            // Google's event ID; null for Atlas-native
  source_calendar_id    String?   @db.Uuid                 // FK to GoogleCalendar.id; null for Atlas-native
  external_url          String?                            // htmlLink from Google, for "open in Google Calendar"
  
  // Core fields
  title                 String
  description           String?
  location              String?
  start_at              DateTime  @db.Timestamptz
  end_at                DateTime  @db.Timestamptz
  all_day               Boolean   @default(false)
  timezone              String?                            // IANA, e.g., 'Asia/Karachi'
  status                String    @default("confirmed")    // 'confirmed' | 'tentative' | 'cancelled'
  visibility            String    @default("default")      // 'default' | 'public' | 'private' | 'confidential'
  
  // Recurrence (read-only display in v1)
  recurrence            String?                            // RRULE string
  recurrence_master_id  String?   @db.Uuid                 // for instance overrides; FK to another CalendarEvent
  
  // Cross-module linkage
  linked_task_id        String?   @db.Uuid
  linked_project_id     String?   @db.Uuid
  linked_note_id        String?   @db.Uuid
  
  // Provenance
  source_metadata       Json?                              // Google extras (organizer, hangoutLink, etc.) for round-trip
  last_synced_at        DateTime? @db.Timestamptz
  
  // Lifecycle
  created_at            DateTime  @default(now()) @db.Timestamptz
  updated_at            DateTime  @updatedAt @db.Timestamptz
  deleted_at            DateTime? @db.Timestamptz
  
  // Relations
  user                  User             @relation(fields: [user_id], references: [id], onDelete: Cascade)
  source_calendar       GoogleCalendar?  @relation(fields: [source_calendar_id], references: [id], onDelete: Cascade)
  linked_task           Task?            @relation(fields: [linked_task_id], references: [id], onDelete: SetNull)
  linked_project        Project?         @relation(fields: [linked_project_id], references: [id], onDelete: SetNull)
  linked_note           Note?            @relation(fields: [linked_note_id], references: [id], onDelete: SetNull)
  recurrence_master     CalendarEvent?   @relation("RecurrenceMaster", fields: [recurrence_master_id], references: [id], onDelete: Cascade)
  recurrence_instances  CalendarEvent[]  @relation("RecurrenceMaster")
  attendees             CalendarEventAttendee[]
  
  @@unique([source, source_event_id])                      // dedup against Google
  @@index([user_id, start_at])
  @@index([user_id, end_at])
  @@index([user_id, linked_task_id])
  @@index([user_id, linked_project_id])
  @@index([source_calendar_id])
}
```

Add to `reattachOrphanData()`.

#### 3.1.4 `CalendarEventAttendee`

Multi-value attendees for events. Each attendee may or may not be a known Atlas Person.

```prisma
model CalendarEventAttendee {
  id                  String   @id @db.Uuid
  event_id            String   @db.Uuid
  
  person_id           String?  @db.Uuid                  // null when attendee isn't a known Atlas Person
  email               String?                             // raw email from Google
  display_name        String?
  response_status     String?                             // 'accepted' | 'declined' | 'tentative' | 'needsAction'
  is_organizer        Boolean  @default(false)
  is_optional         Boolean  @default(false)
  
  created_at          DateTime @default(now()) @db.Timestamptz
  updated_at          DateTime @updatedAt @db.Timestamptz
  deleted_at          DateTime? @db.Timestamptz
  
  event               CalendarEvent  @relation(fields: [event_id], references: [id], onDelete: Cascade)
  person              Person?        @relation(fields: [person_id], references: [id], onDelete: SetNull)
  
  @@index([event_id])
  @@index([person_id])
  @@index([email])
}
```

Cascades through `CalendarEvent` for orphan recovery (no own `user_id`).

#### 3.1.5 Validation rules

In `src/core/calendar/validation.ts`:

- `title`: required, 1-512 chars, trimmed
- `description`: optional, 0-50000 chars
- `location`: optional, 0-512 chars
- `start_at <= end_at` enforced; identical (point-in-time events) allowed
- `timezone`: if provided, valid IANA tz string (validate against `Intl.supportedValuesOf('timeZone')` or fail safely)
- `source`: must be `'google'` or `'atlas'`
- For `source='google'`: `source_event_id` and `source_calendar_id` required
- For `source='atlas'`: `source_event_id` and `source_calendar_id` must be null
- `linked_*` IDs: validated as belonging to the same user

### 3.2 Google Calendar OAuth flow

#### 3.2.1 Connection

Settings → Integrations → Google Calendar — new section, mirrors the Google Drive section.

```
GOOGLE CALENDAR
───────────────
Status: Not connected
Atlas can read events from your Google Calendars to surface them
in your calendar view, link them to tasks and notes, and pre-fill
interaction logs from meetings.

Atlas does not write to Google Calendar — events created in Atlas
stay in Atlas only.

[Connect Google Calendar]
```

Connect button initiates OAuth flow:

1. `GET /api/calendar/oauth/start` → redirect to Google with scope `https://www.googleapis.com/auth/calendar.readonly` and state token
2. Google redirects to `/api/calendar/oauth/callback?code=...&state=...`
3. Server exchanges code for tokens, encrypts via AES-256-GCM (same key as Drive), persists to `GoogleCalendarOAuthToken`
4. Triggers initial calendar list pull (section 3.4)
5. Redirects user to Settings → Integrations with success state

#### 3.2.2 Connected state

```
GOOGLE CALENDAR
───────────────
Status: Connected
Connected as umar@rana.pk on May 6, 2026
Last synced: 12 minutes ago — 3 calendars, 47 events in window

[Refresh now]   [Manage calendars]   [Disconnect]
```

`Refresh now` triggers on-demand sync (section 3.3.2).
`Manage calendars` opens a list of `GoogleCalendar` rows with per-calendar visibility and sync toggles (section 3.4).
`Disconnect` revokes the token, deletes `GoogleCalendarOAuthToken`, soft-deletes all `GoogleCalendar` rows for the user, soft-deletes all `CalendarEvent` with `source='google'`. Confirmation dialog explains: "Disconnecting will remove synced events from Atlas. Atlas-native time blocks will not be affected."

#### 3.2.3 Token refresh

Refresh handling in `src/core/calendar/google-client.ts`:

- Before each API call, check `expires_at`
- If within 5 minutes of expiry, refresh using the refresh token, persist new access token + new expiry
- If refresh fails (revoked, expired), set token row to a `disconnected` state — surface in Settings as "Connection expired. Reconnect to continue syncing."
- All token operations log via Pino with redaction (never log tokens themselves)

### 3.3 Sync logic

#### 3.3.1 Daily sync job

`pg-boss` job `google-calendar-sync` registered in `src/core/jobs/index.ts`. Runs daily at **02:30 UTC** (avoid clashing with existing 03:00/04:00/05:00/06:00 jobs).

Per user with a connected Google Calendar token:

1. Refresh token if needed
2. List user's Google calendars via `calendarList.list` — upsert into `GoogleCalendar`
3. For each `GoogleCalendar` where `sync_enabled = true`:
   - If `sync_token` is null: full sync within window (past 30 days, next 90 days)
   - Else: incremental sync using `syncToken`
   - Upsert events into `CalendarEvent` keyed on `source='google' AND source_event_id`
   - For events marked `cancelled` by Google: soft-delete the corresponding `CalendarEvent` (set `deleted_at`)
   - Persist new `nextSyncToken` to `GoogleCalendar.sync_token`
   - Update `GoogleCalendar.last_synced_at`
4. For each event, sync attendees: upsert into `CalendarEventAttendee`. Match attendee email against `PersonEmail.email` (or `e164_normalized` for phones if applicable later) — if a match exists, set `person_id`; otherwise leave null with `email` and `display_name`
5. Log sync stats (events created/updated/deleted, attendees matched/unmatched) via Pino

#### 3.3.2 On-demand refresh

`POST /api/calendar/sync` — runs the same sync logic for the calling user, returns updated counts. Used by:
- "Refresh now" button in Settings
- "Refresh" button on the calendar UI

Rate limit: 1 call per 30 seconds per user.

#### 3.3.3 Sync window

Past 30 days + next 90 days. Implemented as `timeMin = NOW() - 30d` and `timeMax = NOW() + 90d` in the events.list call.

Events outside this window are not synced. If a user views the calendar far in the past or future, those views will be sparse — note this in the calendar UI as "Events sync covers a 4-month window. Older or further-out events are not in Atlas."

#### 3.3.4 Recurring events

Google returns recurrence rules on the master event. Atlas:
- Stores the master event with `recurrence` populated (RRULE string)
- For instance overrides (where Google sends a specific instance with a `recurringEventId`), stores them as separate `CalendarEvent` rows with `recurrence_master_id` set
- At query time, expands the RRULE via the `rrule` package into instances within the requested window — but does NOT persist expanded instances
- Display logic merges expanded virtual instances with override instances (override takes precedence)

For v1, recurring events are read-only — users cannot edit recurrence patterns in Atlas.

### 3.4 Multi-calendar handling

#### 3.4.1 Manage Calendars UI

Settings → Integrations → Google Calendar → "Manage calendars" opens a list:

```
YOUR GOOGLE CALENDARS
─────────────────────

⊙ Primary (umar@rana.pk)                          [✓ Visible] [✓ Sync]
   234 events synced

⊙ Work calendar                                   [✓ Visible] [✓ Sync]
   89 events synced

⊙ Family                                          [✓ Visible] [✓ Sync]
   12 events synced

○ Holidays in Pakistan                            [✗ Visible] [✗ Sync]
   Disabled by you

○ Team standups (shared)                          [✓ Visible] [✗ Sync]
   Sync paused
```

Each row: calendar name, event count, two toggles:
- **Visible** — show events from this calendar in Atlas calendar UI (does not affect sync)
- **Sync** — pull events from this calendar at all (untoggling stops new pulls; existing events remain unless explicitly purged)

When a calendar's `sync_enabled` is toggled off, no further events are pulled. Existing events remain in Atlas. The UI surfaces a "Purge events from this calendar" button as a separate destructive action.

When a calendar's `is_visible` is toggled off, events are still synced but hidden in the calendar UI. They remain queryable for cross-module linking (e.g., via the "Pick from calendar" affordance).

#### 3.4.2 Color override

Each calendar has a Google-assigned color. Add a per-user override field `color_override` on `GoogleCalendar` — when present, Atlas uses it instead of Google's color. Pick from a Stratum-token color palette (matching tag colors).

UI: small color swatch next to each calendar in the Manage Calendars list — click opens a Stratum-themed picker.

### 3.5 Calendar views

#### 3.5.1 Route and layout

`/calendar` route. Default view: Week. View selector at top: Day / Week / Month.

URL state: `/calendar?view=week&date=2026-05-06&calendars=uuid-1,uuid-2`

The `calendars` query param is a temporary visibility filter that overrides `is_visible` for the current view (e.g., user wants to see only Work calendar without changing settings).

#### 3.5.2 Day view

Vertical hourly grid, 6am-11pm by default (configurable in Settings → Preferences → "Calendar visible hours" — defer the setting to a later wave; ship hardcoded 6am-11pm for v1).

- All-day events at top in a horizontal strip
- Timed events render as colored blocks in their time slot
- Current time indicator: thin horizontal line across the grid where "now" is
- Click empty grid → opens Atlas event create form pre-filled with that time
- Click event → opens event detail (section 3.10)

#### 3.5.3 Week view (default)

7-day grid. Day-of-week order based on user locale (Sunday-start vs Monday-start).

- Same hourly grid as Day view
- All-day events at top span days as needed
- Multi-day timed events render across cells

#### 3.5.4 Month view

Calendar grid (5-6 rows of 7 cells).

- Each cell shows up to 4 events (truncate with "+N more" link)
- Click date number → switch to Day view
- Click event → opens event detail
- Click "+N more" → opens day's full event list in a popover

#### 3.5.5 Library

Use `react-big-calendar` for grid rendering. Theme via the library's CSS class hooks, mapping to Stratum tokens. The library exposes `defaultView`, `views`, `onSelectSlot`, `onSelectEvent` callbacks — wire these to Atlas mutations and detail opens.

If the library cannot be themed cleanly (e.g., hardcoded colors that bleed through), document the issue in code comments and fall back to a custom build using `date-fns` for date math and CSS Grid for layout.

#### 3.5.6 Performance

For typical personal-CRM scale (hundreds of events in window), no virtualization needed. Render events client-side from the loaded query result.

The week view query loads events where `start_at <= weekEnd AND end_at >= weekStart`. Recurring events expanded server-side before returning.

### 3.6 Today's events on dashboard

Add a "Today" widget to the dashboard (existing dashboard layout — locate the dashboard component and add a widget slot).

Widget shows:
- Header: "Today, May 6"
- Up to 5 events for today, sorted by start_at
- Each event: time, title, calendar color dot
- Click event → opens event detail
- Footer: "View calendar →" link to `/calendar`
- Empty state: "No events today."

No celebration. No "great, your day is open!" copy.

### 3.7 Color coding

Each `CalendarEvent` renders with the color of its `source_calendar` (or `color_override` if set). Atlas-native events render with a distinct Stratum accent color (e.g., `--color-accent-primary`).

Color mapping:
- Google's color codes (1-11 from Google's API) map to Stratum palette tokens
- User override picks a Stratum palette token directly
- Atlas-native events: `--color-accent-primary`
- Cancelled events: muted color with strikethrough text (display-only)

### 3.8 Atlas-native time blocks

#### 3.8.1 Creation flows

**From calendar grid:**
- Drag empty slot in Day or Week view → opens inline create form anchored to the slot
- Form: title (required), start time, end time (pre-filled from drag), all-day toggle, optional description, optional linked task, optional linked project
- Submit creates `CalendarEvent` with `source='atlas'`, no `source_event_id`/`source_calendar_id`

**From task detail (section 3.9):**
- "Block time" button on task detail → opens Atlas event create form with title pre-filled from task and `linked_task_id` pre-filled

**From "+ Block time" button:**
- Top-right of calendar UI, next to Refresh
- Opens form with current time as default

#### 3.8.2 Editing

Click an Atlas-native event → detail (section 3.10). Edit button in detail opens form. Changes update the row directly.

Atlas-native events are NOT pushed to Google. There is no "Sync this to Google" affordance in v1.

#### 3.8.3 Deletion

Atlas-native events soft-deleted via standard `deleted_at`. Audit log: `calendar_event_deleted`.

### 3.9 "Block time for this task"

#### 3.9.1 Task detail affordance

In Task detail view, add a "Block time" button next to existing actions (Edit / Complete / Delete).

Clicking opens the Atlas event create form pre-filled:
- Title: task title
- Description: task notes (truncated if long)
- `linked_task_id`: the task ID
- Start time: defaults to next available 30-minute slot today (after current time, rounded up)
- End time: start + 30 minutes by default
- User can adjust before submitting

#### 3.9.2 Display on task detail

If a Task has any non-deleted CalendarEvent linked to it, show on task detail:

```
SCHEDULED
─────────
• May 7, 2026 · 14:00 - 14:30  [→ View on calendar]
• May 8, 2026 · 09:00 - 11:00  [→ View on calendar]
```

Click → opens calendar at that date/time.

If task has no scheduled blocks, no SCHEDULED section renders.

### 3.10 Calendar event detail

#### 3.10.1 Opening

Click any event on the calendar → opens detail. For v1, render as a modal overlay (Radix Dialog). Future could move to a dedicated page or right-sidebar.

#### 3.10.2 Detail layout

```
┌─────────────────────────────────────────────────────────────┐
│  Event Title                                            [×] │
│                                                             │
│  📅 May 6, 2026 · 14:00 - 15:30 (1h 30m)                    │
│  📍 Cafe Lahore                                              │
│  📋 Calendar: Work                                           │
│  ↻ Recurring: Weekly on Wednesdays                          │
│                                                             │
│  DESCRIPTION                                                │
│  ─────────────                                              │
│  Q3 partnership discussion. Bring legal review draft.       │
│                                                             │
│  ATTENDEES                                                  │
│  ─────────                                                  │
│  ✓ You (Organizer)                                          │
│  ✓ Sarah Khan @sarah                                        │
│  ? Ahmed Raza @ahmed                                        │
│  • partner@external.com (not in Atlas)                      │
│                                                             │
│  LINKED                                                     │
│  ──────                                                     │
│  Task:    Draft partnership terms     [×]                   │
│  Project: Q3 expansion                [×]                   │
│  Note:    [+ Link a note]                                   │
│                                                             │
│  ACTIONS                                                    │
│  ───────                                                    │
│  [Create task from this]                                    │
│  [Log as interaction]   ← visible only if matched attendees │
│  [Open in Google Calendar ↗]                                │
└─────────────────────────────────────────────────────────────┘
```

Sections render only when they have content (no empty Description, no empty Attendees).

#### 3.10.3 Linked rendering

`linked_task_id`, `linked_project_id`, `linked_note_id` render as chips with click-through and remove (×) action. Each chip's text is the linked entity's display name; click navigates to its detail.

"+ Link a [task/project/note]" affordance opens a picker for that entity type. On select, the linkage is saved on the `CalendarEvent`.

For Google-source events, edits to linkage fields persist to Atlas only — Google is not modified.

#### 3.10.4 Action shortcuts

**Create task from this:**
- Opens new-task form pre-filled:
  - Title: event title
  - Notes: event description
  - Due date: event start_at date
  - `linked_event_id`: this event's ID (if Task gets such a field — see 3.10.5)
- After task creation, the calendar event's `linked_task_id` is set to the new task

**Log as interaction:**
- Visible only if the event has at least one attendee with a matched `person_id`
- Opens the PersonInteraction Log modal pre-filled:
  - Person picker: pre-populated with first matched attendee; user can pick another
  - Kind: defaulted to 'meeting' (or 'video' if event has a Hangouts link)
  - Occurred at: event start_at
  - Duration: end_at - start_at in minutes
  - Location: event.location
  - Notes: event description
- This affordance ships in Wave 6a as a stub if Wave 5a-ii hasn't shipped — render the button with a tooltip: "Available once interaction logging ships in Wave 5a-ii." Once 5a-ii is live, the affordance becomes functional automatically (feature-flagged on the existence of the `personInteractions.create` mutation in the tRPC router)

**Open in Google Calendar:**
- Visible only when `external_url` is set (Google-source events)
- Opens `external_url` in a new tab

#### 3.10.5 Reverse linkage on Task

Task detail (section 3.9) shows scheduled time blocks via `linked_task_id` reverse query — no schema change to Task needed.

If a deeper integration calls for a `Task.linked_event_ids` array later, it's a small additive migration. For v1, the reverse query is sufficient.

### 3.11 Forecast view + calendar overlay

The Forecast view in Tasks already exists — it shows tasks for a configurable date range.

#### 3.11.1 Layout change

Add a calendar pane to the right of (or above on mobile) the existing task list. Same date range as the task forecast.

```
FORECAST                                          [Range: 7 days ▼]

Tasks                                  Calendar
─────                                  ────────
TODAY · Wed May 6                      08:00  Standup (Work)
                                       ↓
□ Draft proposal        ⏰ 14:00       14:00  ▣ Draft proposal (blocked)
□ Call Sarah                            ↓
                                       15:30  Q3 meeting (Work)
TOMORROW · Thu May 7                                                  
□ Review legal draft                   09:30  Sarah catch-up (Family)
                                                                   

This Week
─────────
...
```

The right pane shows events for the same date range, grouped by day. Each day's events listed chronologically.

#### 3.11.2 Click behavior

- Click task → existing task detail
- Click event → calendar event detail (section 3.10)
- Click an event linked to a task → highlights the task in the left pane

#### 3.11.3 Empty states

Each day section can render with tasks but no events, events but no tasks, both, or neither. Both-empty days collapse with a single line "No tasks or events on Friday May 9."

#### 3.11.4 Toggle off

Settings → Preferences → "Show calendar in Forecast view" toggle (default on). When off, Forecast renders task-only as today.

### 3.12 PersonInteraction "Pick from calendar"

Stub now, fully wired by 5a-ii ship — see section 3.10.4 above. The stub:

- Adds a "Pick from calendar" button to the PersonInteraction Log modal (which doesn't exist until 5a-ii)
- For Wave 6a alone, this is a placeholder UI element that doesn't render unless the `personInteractions.create` tRPC mutation exists
- Implementation pattern: feature-flag at module-load time. The component imports the mutation lazily and renders the button only if the import succeeds.

The picker (when active):
- Opens a small popover anchored to the button
- Lists recent calendar events (past 7 days, with attendees that match the picked Person — falling back to all events if no person picked yet)
- Click event → pre-fills the form fields per 3.10.4

### 3.13 Calendar event detail: cross-module shortcuts

Already covered in 3.10.4. The three shortcuts ("Create task from this," "Log as interaction," "Link to project / note") are deliverable items 11-13 in the wave. Verify they're implemented per 3.10.

---

## 4. Verification

### Schema
1. `GoogleCalendarOAuthToken` schema correct, in `reattachOrphanData()` and schema comment list
2. `GoogleCalendar` schema correct with sync_token, is_visible, sync_enabled toggles, in `reattachOrphanData()`
3. `CalendarEvent` schema correct with source/source_event_id/source_calendar_id distinction
4. Recurrence fields: `recurrence` (RRULE string), `recurrence_master_id` self-FK
5. Linkage FKs: `linked_task_id`, `linked_project_id`, `linked_note_id` with `onDelete: SetNull`
6. `CalendarEventAttendee` schema correct, cascades through CalendarEvent
7. Validation in `src/core/calendar/validation.ts` enforces all rules from 3.1.5
8. `start_at <= end_at` enforced (point-in-time allowed)
9. `source='google'` requires source_event_id + source_calendar_id; `source='atlas'` requires both null
10. Audit log entries fire on calendar event create/update/delete

### Google Calendar OAuth
11. `/api/calendar/oauth/start` redirects to Google with calendar.readonly scope and state token
12. `/api/calendar/oauth/callback` exchanges code for tokens, encrypts via AES-256-GCM with `ENCRYPTION_KEY`, persists to `GoogleCalendarOAuthToken`
13. Successful callback triggers initial calendar list pull
14. Settings → Integrations → Google Calendar shows Not Connected state with descriptive copy
15. Connected state shows account email, last sync time, calendar count, event count in window
16. Refresh now button calls on-demand sync
17. Manage calendars button opens calendar list UI
18. Disconnect: revokes token, deletes token row, soft-deletes GoogleCalendar rows, soft-deletes Google-source CalendarEvents, shows confirmation explaining Atlas-native events are preserved
19. Token refresh: calls less than 5 minutes before expiry refresh successfully
20. Refresh failure (revoked token) sets disconnected state surfaced in Settings

### Sync logic
21. `google-calendar-sync` pg-boss job registered to run daily at 02:30 UTC
22. Sync respects only users with connected tokens
23. Token refreshed before sync if needed
24. `calendarList.list` upserts into `GoogleCalendar`
25. Per-calendar full sync uses time window: past 30 days, next 90 days
26. Subsequent syncs use `nextSyncToken` for incremental delta
27. `nextSyncToken` persisted to `GoogleCalendar.sync_token`
28. `last_synced_at` updated per calendar after sync
29. Cancelled events in Google → corresponding CalendarEvent soft-deleted
30. Events upserted by `(source='google', source_event_id)` unique key
31. Attendees synced into `CalendarEventAttendee`
32. Attendees with email matching `PersonEmail.email` linked via `person_id`
33. Unmatched attendees stored with email + display_name only, person_id null
34. `POST /api/calendar/sync` triggers on-demand sync, returns counts
35. Rate limit on on-demand sync: 1 per 30 seconds per user
36. Sync stats logged via Pino (events created/updated/deleted, attendees matched)

### Recurring events
37. Master event with `recurrence` (RRULE) string stored from Google
38. Instance overrides stored as separate CalendarEvent rows with `recurrence_master_id`
39. Query expands RRULE via `rrule` package at request time
40. Expanded virtual instances NOT persisted
41. Override instances take precedence over expanded virtual instances
42. Recurring events read-only — no UI to edit recurrence in v1
43. Detail view shows "Recurring: [pattern]" line in human-readable form

### Multi-calendar handling
44. Manage Calendars list renders all `GoogleCalendar` rows for user
45. Each row shows name, event count, Visible toggle, Sync toggle
46. Visible toggle hides events from calendar UI but keeps them queryable
47. Sync toggle stops new event pulls; existing events remain
48. Color override picker uses Stratum-themed swatches
49. Color override persisted to `GoogleCalendar.color_override`
50. "Purge events from this calendar" surfaced as separate destructive action
51. Calendar `is_primary` flag set correctly from Google's calendarList primary entry

### Calendar views
52. `/calendar` route renders with Day/Week/Month view selector
53. Default view: Week
54. Day view: vertical hourly grid 6am-11pm
55. Week view: 7-day grid, locale-aware day-of-week order
56. Month view: 5-6 row grid with up to 4 events per cell, "+N more" overflow
57. Click empty grid in Day/Week opens Atlas event create form pre-filled with time
58. Click event opens detail modal
59. Click date number in Month view switches to Day view
60. Current time indicator visible in Day/Week views
61. All-day events render in horizontal strip at top of Day/Week
62. Multi-day events span cells correctly in Week view
63. URL state: `view`, `date`, `calendars` query params reflected
64. URL state survives refresh
65. `react-big-calendar` themed via Stratum tokens; no hardcoded colors leaking through

### Today's events on dashboard
66. Dashboard widget renders today's events
67. Up to 5 events shown, sorted by `start_at`
68. Each event: time, title, calendar color dot
69. Click event opens detail
70. "View calendar →" link navigates to `/calendar`
71. Empty state: "No events today."

### Color coding
72. Events render with `source_calendar.color_override` if set, else `source_calendar.color`
73. Atlas-native events render with `--color-accent-primary`
74. Cancelled events render muted with strikethrough
75. Color mapping from Google color codes to Stratum palette implemented

### Atlas-native time blocks
76. Drag-to-create on Day/Week grid opens inline form
77. "Block time" button on task detail opens form pre-filled with task title and `linked_task_id`
78. "+ Block time" button at top of calendar UI opens form
79. Form fields: title, start, end, all-day, description, linked task, linked project
80. Submit creates CalendarEvent with `source='atlas'`, source_event_id null, source_calendar_id null
81. Atlas-native events not pushed to Google (no API call to Google on create/update)
82. Click Atlas-native event → detail modal
83. Edit Atlas-native event updates row directly
84. Delete Atlas-native event soft-deletes via `deleted_at`
85. Audit log: `calendar_event_created`, `_updated`, `_deleted`

### Block time for task
86. Task detail "Block time" button opens form
87. Form pre-filled: title from task, description from task notes, linked_task_id
88. Default start: next 30-minute slot rounded up from now
89. Default end: start + 30 minutes
90. Submit creates linked CalendarEvent
91. Task detail SCHEDULED section appears when at least one non-deleted linked event exists
92. SCHEDULED section lists all linked events sorted by start_at, each with "View on calendar" link
93. Click "View on calendar" navigates to `/calendar?view=day&date=YYYY-MM-DD`
94. SCHEDULED section omitted when no linked events

### Calendar event detail
95. Click event opens modal
96. Detail shows date/time, location, calendar source, recurrence (when applicable)
97. Description rendered when present
98. Attendees section: organizer marked, response status icons, person mention chips for matched, raw email for unmatched
99. Linked section: task / project / note chips with click-through and remove
100. "+ Link a [task/project/note]" opens picker for that type
101. Linkage edits persist for both Google-source and Atlas-native events; Google is not modified
102. "Create task from this" opens new-task form pre-filled with title, notes, due date
103. After task creation, event's `linked_task_id` set to new task
104. "Log as interaction" visible only when at least one attendee has matched person_id
105. "Log as interaction" opens PersonInteraction modal pre-filled when 5a-ii is live
106. "Log as interaction" renders disabled with explanatory tooltip when 5a-ii not yet live
107. "Open in Google Calendar" link opens `external_url` in new tab; visible only for Google-source events

### Forecast view + calendar overlay
108. Forecast view renders task list and calendar pane side-by-side (or stacked on mobile)
109. Calendar pane covers same date range as forecast
110. Events grouped by day, sorted chronologically within day
111. Click event in pane opens calendar event detail
112. Click event linked to a task highlights the task in left pane
113. Days with no tasks and no events collapse to single line
114. Settings → Preferences → "Show calendar in Forecast view" toggle (default on)
115. Toggle off: forecast renders task-only

### Cross-cutting
116. `prisma generate` run after every schema change
117. `GoogleCalendarOAuthToken`, `GoogleCalendar`, `CalendarEvent` all in `reattachOrphanData()` and schema comment list
118. `CalendarEventAttendee` cascades through `CalendarEvent` (no own user_id)
119. New components use Stratum tokens — zero hardcoded hex
120. All new tooltips use `<Hint>`
121. Locale + timezone handling: events stored with original tz; rendered in user's locale tz
122. Pino logger used for sync logs with token redaction
123. No regression in Tasks, Notes, Tables, Projects, People modules
124. No regression in existing Drive sync or Drive OAuth flow

When all 124 verification steps pass, Wave 6a is complete.

---

## 5. Rules of engagement

### 5.1 Read-only Google sync, no exceptions

Atlas pulls from Google. Atlas does NOT push to Google. Ever. No "two-way sync" hidden flag. No "advanced settings" toggle. No "sync this Atlas event to Google" button.

The reason: Google Calendar is the user's source of truth for shared/team events. Atlas's role is to surface Google events alongside Atlas-native time blocks for personal planning. Pushing Atlas events to Google would either pollute the user's actual work calendar or require careful conflict handling — both are out of scope for v1.

If a user wants an Atlas time block to appear in Google, they create it in Google directly. Atlas time blocks are explicitly Atlas-only.

### 5.2 Atlas-native time blocks are first-class, not a fallback

Atlas-native events are not "what we do because we can't push to Google." They're a deliberate UX surface — quick personal time blocking that doesn't pollute shared calendars.

Render them with Stratum accent color (visually distinct from Google calendars). Make creation fast (drag, "Block time" button, keyboard shortcut). Treat them as a feature, not a workaround.

### 5.3 Calm UI, mirroring People

The follow-up principles from Wave 5a-ii apply here too:
- No "you have 3 events in 30 minutes!" notifications
- No badge counts on the Calendar nav item
- No urgency colors for upcoming events
- No emoji, no celebration, no "your day is open!" messaging
- Empty states are factual: "No events today." That's the entire copy.

The calendar surfaces information. The user decides what to do with it.

### 5.4 Linkage is bidirectional but stored once

A CalendarEvent linked to a Task is stored as `CalendarEvent.linked_task_id`. There is no `Task.linked_event_id` field. The reverse query (Task detail → SCHEDULED section) reads from the CalendarEvent side.

This avoids data drift and reduces schema complexity. If reverse queries become slow at scale (unlikely in single-user product), revisit then.

### 5.5 Recurring events are read-only in v1

Atlas displays recurring events from Google. Atlas does not let users edit recurrence patterns. If a user wants to change a recurring event, they do it in Google.

If a user wants to delete a single instance of a recurring event from Atlas's view, they can mark the event "hidden" — but this affordance is deferred to a later wave. For Wave 6a, recurring events fully respect Google's state.

### 5.6 Sync windows are deliberate, not arbitrary

Past 30 days + next 90 days. This is a 4-month rolling window. Events outside this window are not synced into Atlas, even if they exist in Google.

The reason: most active planning happens within this window. Events 6 months in the past are reference data, not actionable; events 1 year out tend to be tentative anyway.

If a user views the calendar far outside this window, the UI shows a banner: "Events sync covers a 4-month window. Older or further-out events live in Google Calendar." With a link to open Google Calendar.

### 5.7 Cross-module integration ships as scaffolding

The "Pick from calendar" affordance for PersonInteraction (5a-ii) ships as a feature-flagged stub. The "Create task from this" / "Log as interaction" / "Link to project" shortcuts in event detail are real and functional in 6a — they don't depend on future waves.

Future waves can extend the linkage patterns (e.g., "Link to opportunity" once Wave 5c ships) without retrofitting Calendar foundation work.

### 5.8 Token security

Tokens are encrypted at rest with AES-256-GCM using the same `ENCRYPTION_KEY` env var as Drive. They are NEVER logged in plain text. Pino redaction patterns must include token fields. On disconnect, tokens are deleted (not just marked inactive).

Token refresh failures should be surfaced gracefully — disconnect state, clear UI message, re-connect button. Never crash on refresh failure.

---

## 6. What is NOT in this wave

**Wave 6b** (future, not yet drafted):
- Two-way Google Calendar sync (if ever — likely never)
- Recurring event editing in Atlas
- Calendar visible-hours preference setting
- Hidden recurring event instances
- Calendar visibility preferences per Atlas view (e.g., "exclude personal calendar from Forecast")
- Multi-account support (more than one Google account connected at once)

**Wave 6c+** (future):
- iCal / Outlook / Apple Calendar integration
- Cal.com self-hosted booking surface integration
- Meeting room and resource booking
- Shared calendars between users (would require multi-user, which Atlas isn't)
- Smart scheduling assistant ("when's a good time to meet Sarah?")

**Permanently out of scope:**
- Notifications, alerts, reminders for upcoming events
- Badge counts on calendar nav
- Email digests of today's events
- Push to Google
- Editing Google-source events from Atlas (other than Atlas-only linkage fields)
- Sharing Atlas-native time blocks
- Conferencing integration (Zoom, Meet, Teams) — display the Hangouts link from Google when present, no Atlas-side integration

If you find yourself building any of these, stop.

---

## 7. Recommended Build Sequence

1. **Schema migrations** — `GoogleCalendarOAuthToken`, `GoogleCalendar`, `CalendarEvent`, `CalendarEventAttendee`. All in `reattachOrphanData()`. Run orphan recovery test after.
2. **Google client wrapper** in `src/core/calendar/google-client.ts` — token management, refresh logic, error handling
3. **OAuth start + callback endpoints** — verify token storage and decryption work
4. **Settings → Integrations → Google Calendar UI** — connection state, connect button, disconnect button
5. **Calendar list pull** — `calendarList.list` upserts into `GoogleCalendar`
6. **Manage Calendars UI** — list, toggles, color override picker
7. **Daily sync job** for events — full sync first, then incremental sync via syncToken
8. **Attendee matching** — email-based linkage to PersonEmail
9. **Recurrence handling** — store RRULE, expand at query time via `rrule` package
10. **`/calendar` route with `react-big-calendar`** — Day/Week/Month, themed via Stratum
11. **Today widget** on dashboard
12. **Calendar event detail modal** — render fields, render attendees, render linked entities
13. **Linkage UI** — "+ Link a task / project / note" pickers; chip rendering; remove actions
14. **Atlas-native time block creation** — drag-to-create on grid, form rendering, mutation
15. **"Block time" button** on task detail — pre-filled form, linked_task_id assignment
16. **Task detail SCHEDULED section** — reverse query, link rendering
17. **"Create task from this"** action in event detail — opens new-task form pre-filled
18. **"Log as interaction"** stub — feature-flagged on personInteractions mutation existence
19. **"Open in Google Calendar"** — `external_url` link
20. **Forecast view calendar overlay** — query, side-by-side layout, click handlers
21. **Settings: Show calendar in Forecast** toggle
22. **Sync stats logging** via Pino with redaction
23. **Final integration check** — Tasks, Notes, Tables, Projects, People all functional

Run `prisma migrate dev` after each schema change. Run `prisma generate`. Run `npm run typecheck` after every step.

---

## 8. Final note

Wave 6a is foundation work that pays off downstream. After this wave, every refinement that wants to integrate with Calendar — Wave 4d's Unified Project view, Wave 5a-ii's interaction logging from meetings, Wave 5b's two-way Google sync (which will reuse the OAuth and sync infrastructure), Wave 5c's Opportunities tied to scheduled events — has a clean integration surface to build on.

The shape to internalize:
- **Calendar is a read-only window into Google plus a fast personal time-blocking surface.** Both render together. Neither pollutes the other.
- **Linkage is the integration mechanism.** Events link to Tasks, Projects, Notes, and (via attendees) People. This linkage is the fabric through which other modules read Calendar context.
- **Calm UI, opt-in surfaces.** Calendar surfaces information; the user decides what to do.

Begin with section 3.1.1.
