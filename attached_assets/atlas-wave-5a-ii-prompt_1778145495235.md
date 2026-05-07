# Replit Agent Prompt — Atlas Wave 5a-ii

## Read this entire document before taking any action.

---

## 1. Overview

Wave 5a-ii is the second half of the Atlas People module foundation. It adds the **relationship intelligence layer** on top of the data shape established in Wave 5a-i:

- `PersonInteraction` — explicit log of meetings, calls, messages with date and notes
- **Cadence** — user-set follow-up frequency, with optional auto-detected suggestion
- **Follow-up perspective** at `/people/follow-up` — surfaces overdue contacts

This wave is about turning the contact graph from passive data into active relationship intelligence. It answers the question Atlas is built to answer:

> *"Who haven't I spoken to in a while who I should reach out to?"*

Subsequent waves (5b, 5c, 5d) add two-way Google Contacts sync, relationship strength scoring, opportunities, and external enrichment.

**Pre-requisites — all must be live:**

- **Wave 5a-i** — relational Person schema, all multi-value tables, list/detail/edit/picker, tags on people
- The `Person` model already has the cadence fields added in 5a-i (`cadence_days`, `last_contact_at`, `next_followup_at`, `followup_snooze_until`, `cadence_suggestion_dismissed_at`) — schema columns are present but unused until this wave activates them

**The work — 4 items:**

1. `PersonInteraction` model with mutations and log UI
2. `last_contact_at` maintenance and cadence behavior
3. Cadence suggestion banner (auto-detection)
4. Follow-up perspective at `/people/follow-up`

**Estimated scope:** 2 weeks of focused work.

---

## 2. Stack constraints (do not deviate)

- Same as Wave 5a-i — see that prompt's section 2 for the full list
- `PersonInteraction` is a new `user_id` table — **must** be added to `reattachOrphanData()` and the schema comment list

---

## 3. Detailed deliverables

### 3.1 `PersonInteraction` model

#### 3.1.1 Schema

```prisma
model PersonInteraction {
  id                String   @id @db.Uuid
  user_id           String   @db.Uuid
  person_id         String   @db.Uuid
  
  kind              String   // 'meeting' | 'call' | 'message' | 'email' | 'in_person' | 'video' | 'other' | custom
  occurred_at       DateTime @db.Timestamptz
  duration_minutes  Int?
  location          String?
  notes             String?
  
  // Optional sourcing — links back to the capture or task that prompted the log entry
  source_capture_id String?  @db.Uuid
  source_task_id    String?  @db.Uuid
  
  // Lifecycle
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  person            Person   @relation(fields: [person_id], references: [id], onDelete: Cascade)
  source_capture    Capture? @relation(fields: [source_capture_id], references: [id], onDelete: SetNull)
  source_task       Task?    @relation(fields: [source_task_id], references: [id], onDelete: SetNull)
  
  @@index([person_id, occurred_at])
  @@index([user_id])
  @@index([user_id, occurred_at])
}
```

`PersonInteraction` has a direct `user_id` (unlike multi-value Person relations) because:
- It's a top-level entity that can be queried independently of any specific person
- It supports the follow-up perspective which queries across all of a user's interactions
- Adding it to `reattachOrphanData()` is required

#### 3.1.2 Kind values

Curated: `meeting`, `call`, `message`, `email`, `in_person`, `video`, `other`. Custom strings allowed; lowercased.

Each kind has a lucide-react icon mapping for display:
- `meeting` → `Users`
- `call` → `Phone`
- `message` → `MessageSquare`
- `email` → `Mail`
- `in_person` → `Coffee`
- `video` → `Video`
- `other` → `Activity`
- Custom kinds: `Activity` (fallback)

#### 3.1.3 Validation

- `kind`: required, 1-32 chars, alphanumeric + spaces + hyphens, lowercased
- `occurred_at`: required, valid timestamp, **not in the future** (>5 minutes future = reject)
- `duration_minutes`: optional, 0-1440 (24 hours)
- `location`: optional, 1-256 chars
- `notes`: optional, 0-10000 chars
- `source_capture_id`, `source_task_id`: optional UUID, must reference existing rows belonging to the same user

#### 3.1.4 Mutations

`people.interactions` sub-router under the `people` router:

- `list({ personId, limit, cursor })` — paginated, newest first by `occurred_at`
- `byId(id)`
- `create(input)` — creates row; updates `Person.last_contact_at` per 3.2; recomputes `next_followup_at` per 3.2.2; audit log `person_interaction_logged`
- `update(id, input)` — updates row; if `occurred_at` changes OR `deleted_at` changes, recomputes `Person.last_contact_at` per 3.2; audit log `person_interaction_updated`
- `remove(id)` — soft delete; recomputes `Person.last_contact_at` per 3.2 (since the most recent interaction may have changed); audit log `person_interaction_deleted`
- `restore(id)` — clears `deleted_at`; recomputes; audit log `person_interaction_restored`

### 3.2 `last_contact_at` maintenance

#### 3.2.1 Source of truth

`Person.last_contact_at` is the maximum `occurred_at` across all non-deleted `PersonInteraction` rows for that person. It is **never** auto-bumped from:
- Captures that mention the person
- Tasks assigned to the person
- Notes that reference the person
- Inbound emails from the person via the email-to-inbox feature

The relationship clock only advances when the user has explicitly logged an interaction. This keeps the signal trustworthy.

#### 3.2.2 Recomputation

Logic in `src/core/people/last-contact.ts`:

```typescript
async function recomputeLastContactAt(personId: string): Promise<Date | null> {
  const latest = await db.personInteraction.findFirst({
    where: {
      person_id: personId,
      deleted_at: null,
    },
    orderBy: { occurred_at: 'desc' },
    select: { occurred_at: true },
  })
  
  return latest?.occurred_at ?? null
}

async function recomputeAndPersist(personId: string): Promise<void> {
  const lastContactAt = await recomputeLastContactAt(personId)
  const person = await db.person.findUnique({ where: { id: personId }, select: { cadence_days: true } })
  
  const nextFollowupAt =
    lastContactAt && person?.cadence_days
      ? addDays(lastContactAt, person.cadence_days)
      : null
  
  await db.person.update({
    where: { id: personId },
    data: { last_contact_at: lastContactAt, next_followup_at: nextFollowupAt },
  })
}
```

Called after every `personInteractions.create / update / remove / restore`. Also called when `Person.cadence_days` changes (in the existing `people.update` mutation from 5a-i — extend it to call `recomputeAndPersist` when `cadence_days` changes).

#### 3.2.3 Manual override

The Person edit form (5a-i) has a `last_contact_at` field hidden by default. Add an "Override last contact" affordance to the Person detail page:

```
Last contacted 47 days ago.    [Override ▾]
```

Clicking opens an inline date picker. Setting a date stores it directly in `Person.last_contact_at` and is treated as an interaction-of-record for cadence purposes — even though no `PersonInteraction` row is created.

The override remains until the user logs a new interaction with `occurred_at > override_date`, at which point the new max-occurred_at wins per 3.2.2.

Audit log: `person_last_contact_override_set` with the date and reason field (optional 1-256 char string).

### 3.3 Cadence

#### 3.3.1 User-set cadence

`Person.cadence_days Int?`, set via the Person edit form (5a-i added the column; this wave activates the form field).

Form UI (add to the Identity section or new "Follow-up" section):

```
FOLLOW-UP CADENCE
─────────────────
[None ▼]    Custom: [____ days]
```

Dropdown options:
- None (null)
- Weekly (7)
- Monthly (30)
- Quarterly (90)
- Yearly (365)
- Custom (shows number input)

Validation: `cadence_days` 1-3650 if not null.

#### 3.3.2 Computed `next_followup_at`

Per 3.2.2 — computed when:
- `cadence_days` changes (mutate)
- `last_contact_at` changes (interaction CRUD)
- `cadence_days` set to null → `next_followup_at` set to null
- `last_contact_at` is null (no interactions yet) → `next_followup_at` set to null

#### 3.3.3 Display on person detail header

Beneath the identity card, render a single calm line. **No exclamations, no emoji, no color shifts based on overdue status.**

| State | Display |
|---|---|
| No cadence, no contact | (no line shown) |
| No cadence, has contact | `Last contacted 47 days ago` |
| Cadence set, no contact | `Cadence: every 30 days. No contact logged yet.` |
| Cadence set, has contact, not due | `Cadence: every 30 days. Last contacted 12 days ago.` |
| Cadence set, has contact, due | `Cadence: every 30 days. Last contacted 47 days ago — 17 days overdue.` |
| Cadence set, snoozed | `Cadence: every 30 days. Snoozed until May 15.` |

Time formatting respects user locale via `formatRelativeDays()` and `formatDate()` in `src/lib/locale.ts`.

#### 3.3.4 Cadence suggestion banner

Auto-detected cadence is offered as a suggestion when conditions are clean. Logic in `src/core/people/cadence-suggestion.ts`:

```typescript
function suggestCadence(interactions: PersonInteraction[]): number | null {
  // Sort by occurred_at ascending
  const sorted = interactions
    .filter(i => i.deleted_at === null)
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())
  
  // Need at least 3 interactions to suggest
  if (sorted.length < 3) return null
  
  // Compute gaps in days between consecutive interactions
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const days = differenceInDays(sorted[i].occurred_at, sorted[i - 1].occurred_at)
    if (days > 0) gaps.push(days)
  }
  
  if (gaps.length < 2) return null
  
  // Median is more robust to outliers than mean
  return median(gaps)
}
```

Surface the banner above the cadence display line ONLY when all of these are true:

- `Person.cadence_days IS NULL`
- At least 3 non-deleted interactions exist
- The suggested cadence differs meaningfully (>= 1 day) from any prior dismissed suggestion (compare against `cadence_suggestion_dismissed_at` — if that timestamp is recent and a similar suggestion was offered then, suppress)
- The suggested value is reasonable (>= 1, <= 3650)

Banner UI:

```
┌────────────────────────────────────────────────────┐
│ You usually catch up every 32 days.                │
│ Set this as your cadence?                          │
│                                                    │
│              [Set 32-day cadence]   [Dismiss]      │
└────────────────────────────────────────────────────┘
```

`[Set]` updates `Person.cadence_days` to the suggested value.
`[Dismiss]` sets `Person.cadence_suggestion_dismissed_at = NOW()`.

Re-suggestion logic: after dismissal, the banner reappears only if 3 more interactions have been logged AND the recomputed median differs from the previously-dismissed suggestion by more than 7 days.

Audit log: `person_cadence_suggestion_accepted`, `person_cadence_suggestion_dismissed`.

### 3.4 Interaction log UI

#### 3.4.1 Replace the placeholder on Person detail

In Wave 5a-i, the Person detail view rendered an "Interactions" section as a placeholder. Replace it with the interaction log.

#### 3.4.2 Log interaction modal

"+ Log interaction" button in the Interactions section header opens a modal:

```
LOG INTERACTION                                              [×]
─────────────────────────────────────────────────────────────────

Type:           [Meeting          ▼]
Occurred:       [2026-05-06]  [14:30]    (defaults to now)
Duration:       [_______ minutes]            (optional)
Location:       [_____________________]      (optional)

Notes:
┌───────────────────────────────────────────────────────────┐
│                                                           │
│                                                           │
└───────────────────────────────────────────────────────────┘

                                          [Cancel]    [Log]
```

Type dropdown: curated kinds with icons + "Custom…" inline custom kind entry.

Occurred date defaults to today; time defaults to current time. Both editable. Past dates fully allowed; future dates beyond +5 minutes rejected with friendly error.

#### 3.4.3 Interaction log section on detail view

Reverse-chronological list. Each entry:

```
[Icon]  Meeting · May 5, 2026 · 14:30      45 min · Cafe Lahore   [⋯]
        Discussed Q3 partnership terms. Need to follow up with
        legal review next week.
```

- Kind icon from 3.1.2 mapping
- Kind label · date · time (locale-formatted)
- Duration and location on the right (if present)
- Notes preview: first 3 lines, expand on click for full
- Overflow menu: Edit / Delete (soft)

#### 3.4.4 Pagination

Load 20 most recent on initial load. "Load older" button at bottom loads next 20. No infinite scroll (deliberate — explicit pagination keeps the page responsive and the user oriented).

#### 3.4.5 Empty state

When no interactions exist:

```
No interactions logged yet.
[+ Log your first interaction]
```

#### 3.4.6 Edit modal

Same shape as Log modal, pre-filled. Submitting updates the row. If `occurred_at` changes, `last_contact_at` recomputes.

#### 3.4.7 Delete confirmation

Soft-delete with confirmation: "Delete this interaction? The person's last-contact date will be recomputed." Confirm removes; recomputation runs.

### 3.5 Follow-up perspective at `/people/follow-up`

#### 3.5.1 Page

New route `/people/follow-up`. Lists people who are due or overdue for follow-up.

#### 3.5.2 Query

```sql
SELECT * FROM "Person"
WHERE user_id = :userId
  AND deleted_at IS NULL
  AND next_followup_at IS NOT NULL
  AND next_followup_at <= NOW()
  AND (followup_snooze_until IS NULL OR followup_snooze_until <= NOW())
ORDER BY next_followup_at ASC  -- most overdue first
LIMIT 50
```

Pagination: 50 per page with "Load more" if needed.

#### 3.5.3 Layout

Page header: "Follow-up" with count badge showing total due.

Each row:

```
┌──────────────────────────────────────────────────────────────────┐
│ [Avatar]  Sarah Khan                                17 days     │
│           Friend · every 30 days                    overdue      │
│           Last contacted Apr 19                                  │
│                                                                  │
│           [Log interaction]   [Snooze ▼]                         │
└──────────────────────────────────────────────────────────────────┘
```

- Avatar, display name, relationship type, cadence
- Last-contacted line (if available)
- Overdue label uses neutral style (not red, not emphasized) — same visual weight as other text. Days computation: `floor((NOW() - next_followup_at) / 86400)`.
- `[Log interaction]` opens the Log modal pre-filled with this person; on submit, person disappears from the list (`last_contact_at` updates → `next_followup_at` shifts forward)
- `[Snooze ▾]` dropdown: 1 day, 3 days, 1 week, 2 weeks, 1 month, custom date

Click row (anywhere outside the action buttons) navigates to person detail.

#### 3.5.4 Snooze logic

Snooze sets `Person.followup_snooze_until = NOW() + N days` (or specified custom date). Doesn't change `last_contact_at` or `next_followup_at`.

Person disappears from the perspective until the snooze expires; reappears automatically (the query handles it — no job needed).

Audit log: `person_followup_snoozed` with `snooze_days` field in the activity payload.

#### 3.5.5 Empty state

When no follow-ups are due:

```
No follow-ups due.
```

That's it. No celebration, no praise streak, no "great job staying in touch." Just the fact.

#### 3.5.6 Filter

Optional filters at top of perspective:
- Relationship type (chips, dynamic based on types in due-list)
- Tag filter (multi-select, AND semantics)

Both reflected in URL state.

#### 3.5.7 Sort

Default: most overdue first. Alternative: alphabetical by name. Sort selector at top.

### 3.6 No notification, no nag

This wave does not add:
- Email or push notifications about overdue follow-ups
- Daily digest emails
- Banner in the app saying "5 follow-ups due"
- Badge count on the People nav item or the People sidebar entry
- Dashboard widget surfacing overdue people

The follow-up perspective is opt-in. The user goes there when they want to. Don't push.

(If the user later asks for a badge count or dashboard surface, that's a new decision to weigh — not a default.)

---

## 4. Verification

### PersonInteraction model
1. Schema correct, including `kind`, `occurred_at`, optional `duration_minutes`, `location`, `notes`, `source_capture_id`, `source_task_id`
2. Soft-delete via `deleted_at`
3. `PersonInteraction` added to `reattachOrphanData()` and schema comment list
4. Validation: `occurred_at` rejects future timestamps beyond +5 min
5. Validation: `kind` 1-32 chars, alphanumeric + spaces + hyphens, lowercased
6. Validation: `duration_minutes` 0-1440
7. Validation: `notes` 0-10000 chars
8. `source_capture_id` and `source_task_id` validated as belonging to the same user

### Mutations
9. `people.interactions.list({ personId, limit, cursor })` — paginated, newest first
10. `people.interactions.byId(id)` works
11. `create` updates `Person.last_contact_at` correctly via `recomputeAndPersist`
12. `update` — when `occurred_at` changes, recomputes
13. `update` — when `deleted_at` changes (e.g., via direct edit), recomputes
14. `remove` (soft delete) recomputes — `last_contact_at` may decrease if the removed row was the most recent
15. `restore` recomputes
16. Audit log entries fire: `person_interaction_logged`, `_updated`, `_deleted`, `_restored`

### last_contact_at maintenance
17. Source of truth: `MAX(occurred_at)` across non-deleted PersonInteraction rows for the person
18. Never auto-bumped from captures, tasks, notes, or inbound emails
19. Recomputation runs on every interaction CRUD
20. Recomputation also runs when `Person.cadence_days` changes via `people.update`
21. Manual override available on Person detail page
22. Override stored directly in `Person.last_contact_at`
23. Override remains until a newer interaction is logged
24. Audit log: `person_last_contact_override_set`

### Cadence
25. `Person.cadence_days` settable via Person edit form
26. Form options: None, Weekly (7), Monthly (30), Quarterly (90), Yearly (365), Custom
27. Custom days input validates 1-3650
28. `next_followup_at` computed per the formula in 3.2.2
29. Computed when `cadence_days` changes
30. Computed when `last_contact_at` changes
31. Null when either input is null
32. Person detail header cadence line matches the table in 3.3.3
33. No exclamations, no emoji, no color shifts based on overdue
34. Time relative formatting respects locale

### Cadence suggestion banner
35. `suggestCadence()` returns null with fewer than 3 interactions
36. Returns median gap when ≥3 interactions
37. Banner appears only when: cadence is null AND ≥3 interactions AND not recently dismissed for similar value
38. `[Set]` updates `Person.cadence_days` to the suggested value
39. `[Dismiss]` sets `Person.cadence_suggestion_dismissed_at = NOW()`
40. Re-suggestion: after dismissal, suppress until 3 more interactions AND median differs by >7 days from prior dismissed suggestion
41. Audit log: `person_cadence_suggestion_accepted`, `person_cadence_suggestion_dismissed`

### Interaction log UI
42. "Interactions" section on person detail replaces the 5a-i placeholder
43. "+ Log interaction" button opens modal
44. Modal: Type dropdown with curated kinds + Custom option, Occurred date+time defaulting to now, optional Duration and Location, Notes textarea
45. Submitting saves PersonInteraction row, updates last_contact_at, refreshes section, closes modal
46. Log section: reverse-chronological, 20 per page, "Load older" button
47. Each entry shows kind icon (per 3.1.2 mapping), kind label, date/time (locale), duration if present, location if present, notes preview (3 lines, expand on click)
48. Edit and Delete via overflow menu
49. Edit modal pre-fills correctly
50. Delete confirmation explains last-contact recomputation
51. Empty state: "No interactions logged yet" with primary CTA

### Follow-up perspective
52. `/people/follow-up` route renders
53. Query filters: `next_followup_at IS NOT NULL AND next_followup_at <= NOW() AND (followup_snooze_until IS NULL OR followup_snooze_until <= NOW())`
54. Sorted: most overdue first by default
55. Header shows count badge
56. Each row: avatar, name, relationship type, cadence string, last-contacted line, overdue days, action buttons
57. Overdue label uses neutral style (no red, no emphasis)
58. `[Log interaction]` opens Log modal pre-filled with this person
59. After logging, person disappears from list (next_followup_at moves forward)
60. `[Snooze ▾]` shows: 1 day, 3 days, 1 week, 2 weeks, 1 month, custom date
61. Snooze sets `followup_snooze_until` and removes person from list immediately
62. Snoozed person reappears automatically when `followup_snooze_until <= NOW()`
63. Audit log: `person_followup_snoozed` with `snooze_days` payload
64. Click row (outside action buttons) navigates to person detail
65. Empty state: "No follow-ups due." (no celebration text)
66. Filter chips for relationship type and tags work, URL state survives refresh
67. Sort selector: most overdue / alphabetical
68. Pagination: 50 per page with "Load more"

### Cross-cutting
69. `prisma generate` run after schema changes
70. PersonInteraction in `reattachOrphanData()` and schema comment list
71. New components use Stratum tokens — zero hardcoded hex
72. All new tooltips use `<Hint>`
73. Locale formatting respected for dates and durations
74. Pino logger used for any new logs
75. No regression in Wave 5a-i functionality (list, detail, edit, picker, tags)

When all 75 verification steps pass, Wave 5a-ii is complete.

---

## 5. Rules of engagement

### 5.1 The relationship clock advances only on explicit interactions

`last_contact_at` is sourced **only** from PersonInteraction rows or explicit user override. It is **never** auto-bumped from:
- Captures that mention the person
- Tasks assigned to the person
- Notes that reference the person
- Inbound emails from the person via the email-to-inbox feature
- Calendar events involving the person (if/when calendar ships)

Why: relationship cadence is signal about *intentional connection*. Auto-bumping makes the signal noisy. A scheduled meeting that didn't happen, an email that auto-replied, a mention in a task — none of those are the same as actually catching up.

If a future feature wants to "auto-suggest an interaction was had" based on inferred signals, that's a separate decision (and should produce a candidate the user confirms, not a silent bump).

### 5.2 Calm UI, no nagging

The follow-up perspective shows facts. It does not:
- Use red or alarm colors for overdue
- Add emoji or exclamations
- Display badge counts on navigation
- Push notifications
- Send digest emails
- Surface "you have 5 overdue follow-ups" banners on the dashboard

The user opens the perspective when they want to. The system respects that.

When a future wave (5c — relationship strength) introduces scoring, the same rule applies: scores are facts, not judgments. No "weak relationship — fix it!" copy. No prioritization labels. The user infers their own meaning from the data.

### 5.3 The cadence suggestion is a suggestion

The auto-detected cadence appears as a one-time banner with [Set] and [Dismiss] actions. It is not:
- Auto-applied
- Persistent until acknowledged (one dismissal closes it)
- Recurring after every new interaction

Conditions for re-suggestion are deliberately conservative (3 more interactions AND >7-day shift in median) so the suggestion doesn't pester.

### 5.4 Snooze is a UI-only delay, not a cadence change

Snoozing a follow-up sets `followup_snooze_until`, which the perspective query filters by. It does not modify `last_contact_at` or `next_followup_at` or `cadence_days`.

Reason: snooze is "I'll deal with this later" — it's not a statement about the relationship's natural cadence. When the snooze expires, the underlying cadence math is unchanged.

If the user repeatedly snoozes the same person, that's a signal the cadence is wrong. We could surface this as a prompt in the future ("You've snoozed Sarah 4 times — adjust cadence?"). Not in this wave.

### 5.5 Interaction kinds are curated but extensible

The dropdown shows curated kinds (`meeting`, `call`, `message`, `email`, `in_person`, `video`, `other`). Custom kinds are accepted via "Custom…" entry, validated against the same string rules as elsewhere.

Custom kinds get a fallback `Activity` icon. Don't try to be clever about icon mapping for custom strings — clarity beats cleverness.

### 5.6 Pagination over infinite scroll

The interaction log uses explicit pagination (20 per page, "Load older" button). The follow-up perspective uses pagination (50 per page, "Load more"). Don't infinite-scroll either.

Reason: people read these views for understanding, not browsing. Pagination keeps users oriented and prevents accidental over-load on long lists.

### 5.7 Snooze duration audit logging matters

Audit log entry for snoozes records the duration in days. This becomes useful in Wave 5c when relationship strength scoring considers snooze patterns as a signal of cadence misalignment.

Capture the data now even if the analysis comes later.

---

## 6. What is NOT in this wave

**Wave 5b** (immediately next):
- Two-way Google Contacts sync
- `@` mention persistence via `Link` model (replaces text-search fallback in 5a-i Notes tab)
- Birthdays surface (next 30 days on dashboard, uses `PersonEvent` from 5a-i)
- Person merging with audit log

**Wave 5c** (intelligence layer):
- Relationship strength scores (computed metric considering frequency, recency, channel diversity)
- Opportunities sub-module — `Opportunity` model, status pipeline, value tracking, person linkage

**Wave 5d** (external enrichment):
- LinkedIn import (CSV → multi-value rows)
- Activity scanning via enrichment provider — TBD between Lusha, Apollo, Clay
- Job change / role update / life event detection

**Permanently out of scope for this wave:**
- Auto-bumping `last_contact_at` from any source other than `PersonInteraction` rows
- Notifications, badge counts, dashboard surfacing of overdue follow-ups
- Streaks, scores, gamified relationship indicators
- Bulk interaction logging
- Calendar event → interaction inference (this might come back later as a candidate-with-confirm flow, not an auto-bump)

If you find yourself building any of these, stop.

---

## 7. Recommended Build Sequence

1. **`PersonInteraction` schema** — migration, add to `reattachOrphanData()`, schema comment list, run orphan recovery test
2. **`recomputeAndPersist` helper** in `src/core/people/last-contact.ts` — covered by unit tests if practical
3. **Mutations**: `create`, `update`, `remove`, `restore` with audit logging; wire `recomputeAndPersist` into all four
4. **Person form: cadence field** — extend the existing edit form (5a-i) with the Follow-up section
5. **Manual override** affordance on Person detail header
6. **`people.update` extension** — call `recomputeAndPersist` when `cadence_days` changes
7. **Person detail: Interactions section** — replace placeholder with empty-state + Log button
8. **Log interaction modal** — opens from Interactions section
9. **Interaction log list rendering** — entries, pagination, edit/delete
10. **Cadence suggestion banner** — `suggestCadence()`, conditional rendering, accept/dismiss flow
11. **Cadence display line** on detail header — all states from 3.3.3 table
12. **Follow-up perspective at `/people/follow-up`** — query, layout, snooze
13. **Snooze logic** — dropdown, set `followup_snooze_until`, person disappears from list
14. **Filter and sort** on follow-up perspective with URL state

Run `prisma migrate dev` after schema change. Run `prisma generate`. Run `npm run typecheck` after every step. Verify no regression in Wave 5a-i functionality.

---

## 8. Final note

Wave 5a-ii is where Atlas People stops being a contact graph and starts being a relationship system. The mechanics are simple — interaction log, cadence math, perspective query — but the principles are non-negotiable:

- **Explicit signal only.** The clock moves when the user says it does.
- **Calm surface.** Facts, not judgments.
- **Opt-in.** The user comes to the data; the data doesn't come to the user.

These principles separate Atlas from typical CRMs that nag, alert, and gamify. Stay disciplined here — every relaxation of these rules is a slide toward the kind of tool the user is trying to escape.

Begin with section 3.1.1.
