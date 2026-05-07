# Replit Agent Prompt — Atlas Wave 5a-i

## Read this entire document before taking any action.

---

## 1. Overview

Wave 5a-i is the first half of the Atlas People module rollout. It establishes:

- A **Dex-quality relational Person schema** that round-trips every Google Contacts field
- The **personal CRM foundation**: list, detail, edit, picker, tags on people

Wave 5a-ii (separate prompt) follows immediately after with the **relationship intelligence layer**: interactions, cadence, follow-up perspective. Subsequent waves (5b, 5c, 5d) add two-way Google Contacts sync, relationship strength scoring, opportunities, LinkedIn import, and external enrichment.

**Why a relational schema now, before sync ships:** two-way Google Contacts sync (Wave 5b) needs every field to round-trip cleanly. Migrating from flat to relational *after* the user has hundreds of synced contacts is risky. Build the data shape correctly the first time.

**Pre-requisites — all must be live:**

- Wave 4a (Notes module with TipTap)
- Wave 4 Refinement (TipTap full editor, error handling)
- Wave 4b (Tables)
- Project Type Rework CR (free-form `Project.type` string — its picker pattern is reused here)
- Auth Hardening CR (orphan recovery, Clerk ID primary lookup)
- Capture Intelligence (three-tier parsing pipeline)
- Existing `Person` model with `id`, `user_id`, `handle`, `display_name`, `email`
- Existing `@` mention syntax in TipTap and capture parser

**The work — 17 sub-items grouped into:**

**Schema layer**
1. Refactor `people` tRPC router (move procedures out of `capture.ts`)
2. Expanded `Person` model with full name decomposition + flat fields
3. `PersonEmail` — multi-value
4. `PersonPhone` — multi-value
5. `PersonAddress` — multi-value, fully structured
6. `PersonOrganization` — multi-value, with employment history
7. `PersonUrl` — multi-value
8. `PersonEvent` — multi-value (birthdays, anniversaries, custom)
9. `PersonRelation` — person-to-person edges
10. `PersonSkill` — multi-value
11. `PersonInterest` — multi-value
12. Migration of existing `Person.email`, `phone`, `company`, `role`, `linkedin_url`, `twitter_handle` to multi-value rows

**UI layer**
13. People list view at `/people/`
14. Person detail view at `/people/{id}` with all multi-value sections
15. Person create / edit forms with multi-value UI patterns
16. Improved person picker (the `@` mention experience)
17. Tags on people via `TagOnPerson`

**Estimated scope:** 4 weeks of focused work.

---

## 2. Stack constraints (do not deviate)

- **Framework**: Next.js 15 App Router with React 19 RSC
- **Type safety**: TypeScript strict, tRPC v11, Zod for input validation
- **ORM**: Prisma against Neon Postgres
- **PKs**: UUIDv7 via `newId()` from `src/core/db.ts` for every new row
- **Design system**: Stratum tokens from `src/styles/tokens.css`. **Zero hardcoded hex values anywhere in components.**
- **UI primitives**: shadcn/ui via Radix. Tooltips through `<Hint>` from `src/components/ui/hint.tsx` — never raw `title=""`.
- **Icons**: lucide-react
- **Soft-delete**: every model with content carries `deleted_at TIMESTAMPTZ?` — **essential for two-way sync** (Wave 5b needs to know "this was deleted, don't re-create")
- **Audit log**: every meaningful entity change writes to `AuditLog` via `logActivity()` from `src/core/audit.ts`
- **Locale**: number, currency, and date formatting routes through `useLocale()` for client and pure server formatters from `src/lib/locale.ts`
- **Logging**: Pino via the factory in `src/core/logging.ts`
- **Orphan recovery**: any new table with a direct `user_id` column **must** be added to `reattachOrphanData()` in `src/core/auth/orphan-recovery.ts`. Multi-value Person relations cascade through `Person` and do **not** carry their own `user_id` — mirroring the existing pattern of `TagOnTask` and `ChecklistItem`.
- **CI**: do not modify `.github/workflows/ci.yml`

---

## 3. Common patterns for multi-value Person relations

To avoid repetition across sections 3.3–3.11, every multi-value Person relation (`PersonEmail`, `PersonPhone`, `PersonAddress`, `PersonOrganization`, `PersonUrl`, `PersonEvent`, `PersonRelation`, `PersonSkill`, `PersonInterest`) follows the **same structural pattern**:

### 3.0.1 Schema baseline

Every multi-value Person relation includes these columns:

```prisma
id                String    @id @db.Uuid
person_id         String    @db.Uuid

// Source provenance — per-row tracking for two-way sync
source            String    @default("manual")    // 'manual' | 'google_contacts' | 'linkedin_csv' | 'enrichment' | etc.
source_id         String?                          // provider's ID for this row (e.g., Google resourceName)
source_metadata   Json?                            // provider-specific extras not modeled natively
last_synced_at    DateTime? @db.Timestamptz

// Lifecycle
created_at        DateTime  @default(now()) @db.Timestamptz
updated_at        DateTime  @updatedAt @db.Timestamptz
deleted_at        DateTime? @db.Timestamptz

person            Person    @relation(fields: [person_id], references: [id], onDelete: Cascade)

@@index([person_id])
@@index([person_id, deleted_at])
```

**No direct `user_id`.** These cascade through `Person` for orphan recovery.

### 3.0.2 Type field convention

Where a relation has a `type` field (e.g., email type, phone type, address type), it is:
- A `String` column, **not a Prisma enum**
- Validated app-side against a curated list of common values
- Custom strings allowed — same pattern as `Project.type` and `Person.relationship_type`
- Lowercased + trimmed at the validation layer

Common values per relation are listed in their respective sections.

### 3.0.3 Primary flag pattern

For relations that have a notion of "primary" (`PersonEmail`, `PersonPhone`, `PersonAddress`, `PersonOrganization`):

- `is_primary Boolean @default(false)` column on the row
- App-layer invariant: at most one row with `is_primary = true` per (person_id, deleted_at IS NULL)
- Enforced via tRPC mutation logic, not a DB constraint (DB partial unique on JSON-shaped predicates is unwieldy across providers)
- When user marks a new row primary: previous primary in the same group is set to `is_primary = false` in the same transaction
- When user deletes the primary: if other rows exist for that person, the most-recently-updated becomes primary automatically

### 3.0.4 Mutation surface (per relation)

Each multi-value relation has tRPC procedures under `people.{relation}`:

- `add(personId, input)` — creates row; if `is_primary=true`, demotes previous primary
- `update(id, input)` — updates row; primary promotion handled the same way
- `remove(id)` — soft delete (`deleted_at = NOW()`); if was primary, auto-promote next
- `restore(id)` — clears `deleted_at` (used by undo and by sync reconciliation)

### 3.0.5 Audit log entries

Per relation: `person_{relation}_added`, `person_{relation}_updated`, `person_{relation}_removed`, `person_{relation}_restored`. The `entity_id` on the audit row is the relation row's ID; `parent_entity_id` references the `Person`.

---

## 4. Detailed deliverables

### 4.1 Refactor `people` tRPC router

The current person procedures live inside `capture.ts`. This wave establishes a dedicated router.

**Steps:**

1. Create `src/server/routers/people.ts`
2. Move all person-related procedures from `capture.ts` to `people.ts`
3. Mount the new router in `src/server/routers/_app.ts`
4. Update **every caller** in the codebase that previously called `trpc.capture.person.*` — point them at `trpc.people.*`
5. Run `npm run typecheck` to verify no broken references remain
6. Add sub-routers (or namespaces) for: `people.emails`, `people.phones`, `people.addresses`, `people.organizations`, `people.urls`, `people.events`, `people.relations`, `people.skills`, `people.interests`, `people.tags`

The `capture.ts` router should retain only capture-specific procedures.

### 4.2 Expanded `Person` model

#### 4.2.1 Schema

```prisma
model Person {
  id              String    @id @db.Uuid
  user_id         String    @db.Uuid
  handle          String    // existing — used in @ mentions
  
  // Name (full Google Contacts decomposition)
  display_name    String                          // formatted, used as primary UI label
  given_name      String?
  family_name     String?
  middle_name     String?
  honorific_prefix String?
  honorific_suffix String?
  nickname        String?
  phonetic_given_name  String?
  phonetic_family_name String?
  phonetic_middle_name String?
  
  // Personal context
  gender          String?                         // free-form; common values: 'male', 'female', 'non_binary', 'prefer_not_to_say', or custom
  biography       String?                         // free-form notes
  photo_url       String?                         // single primary photo URL; cover photos round-trip via external_data
  relationship_type String?                       // open string with curated suggestions; mirrors Project.type pattern
  
  // Cadence + follow-up (Wave 5a-ii populates these; columns added here so 5a-ii is purely behavioral)
  cadence_days                  Int?
  last_contact_at               DateTime? @db.Timestamptz
  next_followup_at              DateTime? @db.Timestamptz
  followup_snooze_until         DateTime? @db.Timestamptz
  cadence_suggestion_dismissed_at DateTime? @db.Timestamptz
  
  // External round-trip blob
  external_data   Json?                           // source-keyed; e.g., { "google_contacts": { coverPhotos: [...], imClients: [...], userDefined: {...} } }
  
  // Lifecycle
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz
  
  // Relations
  user            User                  @relation(fields: [user_id], references: [id], onDelete: Cascade)
  emails          PersonEmail[]
  phones          PersonPhone[]
  addresses       PersonAddress[]
  organizations   PersonOrganization[]
  urls            PersonUrl[]
  events          PersonEvent[]
  relations_from  PersonRelation[]      @relation("PersonRelation_From")
  relations_to    PersonRelation[]      @relation("PersonRelation_To")
  skills          PersonSkill[]
  interests       PersonInterest[]
  tags            TagOnPerson[]
  
  @@index([user_id])
  @@index([user_id, deleted_at])
  @@index([user_id, next_followup_at])
}
```

Notes:
- **Drop these flat fields** that existed on `Person`: `email`, `phone`, `company`, `role`, `linkedin_url`, `twitter_handle`. Their data migrates to multi-value rows in section 4.12.
- **No `Person.location` flat field.** Location lives only in structured `PersonAddress`.
- `Person` is already in `reattachOrphanData()` — verify after migration.

#### 4.2.2 Validation rules (`src/core/people/validation.ts`)

- `display_name`: required, 1-128 chars, trimmed
- `given_name`, `family_name`, `middle_name`, `nickname`, `honorific_prefix`, `honorific_suffix`, `phonetic_*`: optional, 1-64 chars each
- `gender`: optional, 1-32 chars, lowercased
- `biography`: optional, 0-10000 chars
- `photo_url`: optional, URL shape if provided
- `relationship_type`: optional, 1-32 chars, alphanumeric + spaces + hyphens, lowercased — same rules as `Project.type`. Reuse the `validateProjectType` utility if convenient or duplicate the rules.
- `cadence_days`: optional, 1-3650

#### 4.2.3 Display name auto-derivation

On create / update, if `display_name` is empty AND any name parts are present:
- Server-side derives: `[honorific_prefix] [given_name] [middle_name] [family_name] [honorific_suffix]` joined with single spaces, then trimmed
- If still empty, reject with validation error

On manual edit of name parts, do NOT auto-update `display_name` if user has set it explicitly (treat `display_name` as authoritative once user-set).

### 4.3 `PersonEmail`

#### 4.3.1 Schema

```prisma
model PersonEmail {
  ...baseline from 3.0.1
  
  email       String
  type        String    @default("other")  // 'home' | 'work' | 'other' | custom
  label       String?                       // free-form when type='other' or for additional context
  is_primary  Boolean   @default(false)
}
```

#### 4.3.2 Type values

Curated: `home`, `work`, `other`. Custom strings allowed; lowercased.

#### 4.3.3 Validation

- `email`: required, RFC 5322 shape
- `type`: required, 1-32 chars, alphanumeric + spaces + hyphens, lowercased
- `label`: optional, 1-64 chars

### 4.4 `PersonPhone`

#### 4.4.1 Schema

```prisma
model PersonPhone {
  ...baseline from 3.0.1
  
  number              String                      // user input verbatim
  e164_normalized     String?                      // E.164 format, computed via libphonenumber-js
  type                String    @default("mobile")  // 'mobile' | 'home' | 'work' | 'main' | 'fax' | 'other' | custom
  label               String?
  is_primary          Boolean   @default(false)
}
```

#### 4.4.2 Type values

Curated: `mobile`, `home`, `work`, `main`, `fax`, `other`. Custom strings allowed.

#### 4.4.3 Normalization

On `add` and `update`, attempt to normalize via `libphonenumber-js`:
- Default region: derived from user's locale (e.g., user locale `ur-PK` → default region `PK`)
- If normalization succeeds, store in `e164_normalized`
- If fails, leave `e164_normalized` null and store user input only — don't reject the input
- Do not display the normalized version in UI; user sees what they entered

`e164_normalized` exists for sync matching (Wave 5b) — it's an internal index, not user-facing.

#### 4.4.4 Validation

- `number`: required, 4-32 chars
- `type`: required, 1-32 chars, alphanumeric + spaces + hyphens, lowercased
- `label`: optional, 1-64 chars

### 4.5 `PersonAddress`

#### 4.5.1 Schema

```prisma
model PersonAddress {
  ...baseline from 3.0.1
  
  type              String    @default("home")  // 'home' | 'work' | 'other' | custom
  label             String?
  is_primary        Boolean   @default(false)
  
  // Structured components — all optional individually; at least one required at validation
  street_address    String?                      // line 1
  extended_address  String?                      // line 2 (apt, unit, suite)
  city              String?
  region            String?                      // state / province
  postal_code       String?
  country           String?                      // display name, e.g., "Pakistan"
  country_code      String?                      // ISO 3166-1 alpha-2, e.g., "PK"
  
  // Optional precomputed display string for sync round-trip and quick display
  formatted         String?                      // computed if not user-provided
}
```

#### 4.5.2 Display formatter

Server-side helper `formatAddress(address, locale)`:

- Joins available components in locale-aware order
- US/Canada: `Street, City, Region PostalCode, Country`
- UK: `Street, City, PostalCode, Country`
- Most others: `Street, PostalCode City, Country`
- Returns trimmed, comma-separated string
- Used for display in cards and detail sidebar

The `formatted` column stores either the user-provided override OR the computed default at write time. UI prefers user-provided when present.

#### 4.5.3 Type values

Curated: `home`, `work`, `other`. Custom strings allowed.

#### 4.5.4 Validation

- At least one of `street_address`, `city`, `region`, `country` must be non-empty
- `country_code`: if provided, exactly 2 uppercase ASCII chars
- `type`: required, 1-32 chars

### 4.6 `PersonOrganization`

Captures employment / affiliation history. Each row is one role at one organization. Past roles preserved with `is_current=false`.

#### 4.6.1 Schema

```prisma
model PersonOrganization {
  ...baseline from 3.0.1
  
  name          String                          // company / org name (required)
  title         String?                         // role / job title
  department    String?
  location      String?                         // free-form, not address-structured
  type          String    @default("work")      // 'work' | 'school' | 'other' | custom
  is_current    Boolean   @default(true)
  is_primary    Boolean   @default(false)       // among current orgs, which is the "main" one shown on cards
  start_date    DateTime? @db.Date
  end_date      DateTime? @db.Date
}
```

#### 4.6.2 Validation

- `name`: required, 1-128 chars
- `title`, `department`, `location`: optional, 1-128 chars
- `type`: required, 1-32 chars
- `start_date <= end_date` if both provided
- `end_date` must be null if `is_current = true`

#### 4.6.3 UI display in cards

Person card and detail header show: `{title} @ {name}` of the row where `is_primary = true AND is_current = true AND deleted_at IS NULL`. If no primary, fall back to most-recently-created current org.

### 4.7 `PersonUrl`

#### 4.7.1 Schema

```prisma
model PersonUrl {
  ...baseline from 3.0.1
  
  url     String
  type    String    @default("website")  // 'website' | 'linkedin' | 'twitter' | 'github' | 'instagram' | 'facebook' | 'blog' | 'other' | custom
  label   String?
}
```

#### 4.7.2 Type values

Curated: `website`, `linkedin`, `twitter`, `github`, `instagram`, `facebook`, `blog`, `other`. Custom strings allowed.

#### 4.7.3 Auto-detection helper

When user pastes a URL, **suggest** a type based on hostname:
- `linkedin.com` → `linkedin`
- `twitter.com` / `x.com` → `twitter`
- `github.com` → `github`
- `instagram.com` → `instagram`
- `facebook.com` → `facebook`
- Otherwise default to `website`

Suggestion is pre-filled in the type dropdown; user can override.

#### 4.7.4 Validation

- `url`: required, valid URL with scheme (`http://` or `https://`); auto-prepend `https://` if scheme missing on save
- `type`: required, 1-32 chars

### 4.8 `PersonEvent`

For birthdays, anniversaries, and custom recurring or single events.

#### 4.8.1 Schema

```prisma
model PersonEvent {
  ...baseline from 3.0.1
  
  type    String    @default("birthday")  // 'birthday' | 'anniversary' | 'other' | custom
  date    DateTime  @db.Date
  label   String?                         // e.g., "Wedding anniversary"
}
```

#### 4.8.2 Validation

- `date`: required, valid date
- `type`: required, 1-32 chars

#### 4.8.3 Special handling for birthdays

At most one row per person should have `type = 'birthday'`. Enforce app-side: when adding a second birthday, the previous birthday row is soft-deleted in the same transaction (and an audit log entry records the replacement).

For other event types, multiple rows allowed.

### 4.9 `PersonRelation`

Person-to-person edges (spouse, child, parent, sibling, partner, friend-of-friend, etc.). Supports both linked Person records (when the related person also exists in Atlas) and free-text labels (when they don't).

#### 4.9.1 Schema

```prisma
model PersonRelation {
  ...baseline from 3.0.1
  
  // The relation belongs to the "from" person (= person_id from baseline)
  related_person_id   String?   @db.Uuid       // null when related person isn't in Atlas
  related_text        String?                   // human-readable label when related_person_id is null
  type                String                    // 'spouse' | 'child' | 'parent' | 'sibling' | 'partner' | 'friend' | 'mentor' | 'mentee' | custom
  notes               String?
  
  // Override the baseline relations to add the related-side
  related_person      Person?   @relation("PersonRelation_To", fields: [related_person_id], references: [id], onDelete: SetNull)
  // person from baseline becomes:
  // person   Person    @relation("PersonRelation_From", fields: [person_id], references: [id], onDelete: Cascade)
}
```

Adjust the baseline `person` relation name on this model to `PersonRelation_From` so the named relation pair compiles with Prisma.

#### 4.9.2 Type values

Curated: `spouse`, `child`, `parent`, `sibling`, `partner`, `friend`, `mentor`, `mentee`, `colleague`, `other`. Custom allowed.

#### 4.9.3 Validation

- Exactly one of `related_person_id` or `related_text` must be non-null
- `type`: required, 1-32 chars
- `notes`: optional, 0-2000 chars

#### 4.9.4 Bidirectional inference (read-side)

Atlas does NOT auto-create reciprocal rows when you record "A is parent of B" — this avoids accidental data drift. The inverse relation is only inferred at read time:

- On Person B's detail view, when displaying relations, also query `PersonRelation` rows where `related_person_id = B.id`
- Render those with the inverse phrasing: "A is parent" → "Parent: A" on B's detail
- This creates the appearance of bidirectional data without the storage cost or drift risk

If user explicitly wants to record both directions, they can — two rows, no automatic deduplication.

### 4.10 `PersonSkill`

#### 4.10.1 Schema

```prisma
model PersonSkill {
  ...baseline from 3.0.1
  
  skill_name  String                              // e.g., "Python", "Tax law", "Public speaking"
  proficiency String?                             // optional: 'beginner' | 'intermediate' | 'advanced' | 'expert' | custom
}
```

#### 4.10.2 Validation

- `skill_name`: required, 1-64 chars, trimmed
- `proficiency`: optional, 1-32 chars

#### 4.10.3 Autocomplete

Skill input on form supports autocomplete from the user's existing PersonSkill entries (across all people) — surfaces familiar skills without forcing a fixed taxonomy.

### 4.11 `PersonInterest`

#### 4.11.1 Schema

```prisma
model PersonInterest {
  ...baseline from 3.0.1
  
  interest_name  String                           // e.g., "Hiking", "Chess", "Sci-fi novels"
}
```

#### 4.11.2 Validation

- `interest_name`: required, 1-64 chars, trimmed

#### 4.11.3 Autocomplete

Same pattern as PersonSkill — autocomplete from user's existing entries.

### 4.12 Migration of existing `Person` rows

The current `Person` model has flat fields: `email`, `phone`, `company`, `role`, `linkedin_url`, `twitter_handle`. These need migrating to multi-value rows before the columns can be dropped.

#### 4.12.1 Migration order

Create a single Prisma migration `20260507000000_wave5a_relational_person`:

1. Create all new tables (`PersonEmail`, `PersonPhone`, etc.)
2. Add new flat columns on `Person` (name decomposition, biography, photo_url, etc.)
3. Run data migration SQL inside the same migration:

```sql
-- Email
INSERT INTO "PersonEmail" (id, person_id, email, type, is_primary, source, created_at, updated_at)
SELECT
  -- generate UUIDv7 via uuid_generate_v7() if available, else gen_random_uuid() with a comment
  gen_random_uuid(),
  id,
  email,
  'other',
  TRUE,
  'manual',
  COALESCE(created_at, NOW()),
  NOW()
FROM "Person"
WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL;

-- Phone (similar)
-- Org from company + role (similar)
-- LinkedIn URL → PersonUrl (type='linkedin')
-- Twitter handle → PersonUrl (type='twitter', URL constructed as https://twitter.com/{handle})
```

4. Audit log: write a single `person_migrated_to_relational_v5a` entry per person migrated, with a JSON snapshot of the original flat values for forensic recovery
5. Drop the flat columns on `Person`: `email`, `phone`, `company`, `role`, `linkedin_url`, `twitter_handle`

#### 4.12.2 Pre-migration safety

- Run `prisma migrate dev` in development first against a snapshot
- Verify all new tables populated correctly
- Verify `Person.display_name` still resolves for every user-visible person
- Run the existing orphan recovery test suite — must pass

### 4.13 People list view at `/people/`

#### 4.13.1 Layout

Page header:
- Title: "People"
- Search input (debounced 200ms)
- "+ Add person" button
- View toggle: Card / List (default Card)

Filter bar:
- Relationship type chips (dynamic, mirrors Project Type sidebar)
- Tag chip filter (multi-select, AND semantics)

Sort dropdown:
- Name (A-Z) [default]
- Recently added
- Recently updated
- Last contacted (Wave 5a-ii adds the data; the sort option exists in 5a-i but defaults to Name)

#### 4.13.2 Card view

Each card shows:

```
┌──────────────────────────────────────┐
│  [Avatar]  Display Name              │
│            Title @ Company           │   ← from primary current PersonOrganization
│            City, Country             │   ← from primary PersonAddress (city + country if both present)
│                                      │
│  [tag] [tag]                         │
└──────────────────────────────────────┘
```

Avatar: `Person.photo_url` if present; otherwise initials (first letter of `given_name` + first letter of `family_name`, fallback to `display_name`).

If no primary organization, omit the title/company line. If no primary address with city, omit location line.

#### 4.13.3 List view

Denser layout: Avatar · Name · Title @ Company · Primary email · Primary phone · Tags

#### 4.13.4 Search

Searches across:
- `Person.display_name`, `handle`, `nickname`, `given_name`, `family_name`
- All non-deleted `PersonEmail.email` values
- All non-deleted `PersonOrganization.name` values
- `Person.biography`

ILIKE-based against searchable fields is acceptable for v1. Postgres FTS with a `search_vector` column on `Person` is preferred if straightforward; otherwise defer.

#### 4.13.5 URL state

All filters, sort, search, view mode reflected in URL. Refresh-safe. Browser back/forward works.

#### 4.13.6 Empty states

- No people: "No people yet. Add someone to get started." with primary CTA
- Filters return zero: "No people match these filters." with "Clear filters" link

### 4.14 Person detail view at `/people/{id}`

#### 4.14.1 Layout

Single-column page with sticky right-side TOC nav for jumping between sections:

```
┌──────────────────────────────────────────────────────────────────┐
│ [Avatar]  Display Name                          [Edit]  [⋯ menu] │
│           Honorific · Nickname                                   │
│           Title @ Company · City                                 │
│           [tag] [tag] [tag]                                      │
│                                                                  │
│ Cadence line (Wave 5a-ii)                                        │
├──────────────────────────────────────────────────────────────────┤
│ ABOUT                                              [Sticky TOC]  │
│ Biography text...                                  • About       │
│                                                    • Contact     │
│ CONTACT                                            • Work        │
│ Email: primary, work, personal...                  • Addresses   │
│ Phone: primary, mobile, work...                    • Web         │
│ URLs: linkedin, twitter, github...                 • Events      │
│                                                    • Relations   │
│ WORK                                               • Skills      │
│ Current: Title @ Company [primary]                 • Interests   │
│ Past: Previous Title @ Previous Co.                • Tasks       │
│                                                    • Notes       │
│ ADDRESSES                                          • Files       │
│ Home: 123 Main St, City...                                       │
│ Work: 456 Office Pkwy...                                         │
│                                                                  │
│ EVENTS                                                           │
│ Birthday: March 14                                               │
│ Wedding anniversary: June 21                                     │
│                                                                  │
│ RELATIONS                                                        │
│ Spouse: [Sarah Khan]                                             │
│ Child: [Ahmad Khan]                                              │
│ Mentor: Sajjad Bhai (text)                                       │
│                                                                  │
│ SKILLS                                                           │
│ Python (expert) · Tax law · Public speaking                      │
│                                                                  │
│ INTERESTS                                                        │
│ Hiking · Chess · Sci-fi novels                                   │
│                                                                  │
│ TASKS / NOTES / FILES                                            │
│ (existing patterns, tabs or stacked sections)                    │
└──────────────────────────────────────────────────────────────────┘
```

#### 4.14.2 Section visibility

Sections render only when they have content. If a person has no addresses, the ADDRESSES section is omitted entirely (not shown as empty). Empty Skills section is omitted, etc.

The Edit form (section 4.15) lets the user add to any section regardless of current emptiness.

#### 4.14.3 Contact section affordances

- Email rows: clickable, opens `mailto:` link; primary marked with a small icon
- Phone rows: clickable, opens `tel:` link; primary marked
- URL rows: clickable, opens new tab; provider icons (LinkedIn, Twitter, GitHub etc.) from lucide-react

#### 4.14.4 Tasks tab

Lists tasks where `Task.person_id = personId`. Sort: most recent first. Click → task detail.

#### 4.14.5 Notes tab

Lists notes whose body text contains `@{handle}` (Phase 1 fallback — replaced with `Link` model lookups in Wave 5b).

#### 4.14.6 Files tab

Attachments where `parent_type = 'person'` AND `parent_id = personId`.

#### 4.14.7 Interactions section (placeholder)

Renders "Coming in Wave 5a-ii" disabled placeholder. Wave 5a-ii replaces with the real log.

### 4.15 Person create / edit forms with multi-value UI

#### 4.15.1 Form structure

Long vertical form with section headers and a sticky in-page navigation:

```
SECTIONS                              IDENTITY
─────────                              ───────
• Identity        ← active           Display name *  [_______________]
• Names                              Nickname        [_______________]
• Contact
• Work                               NAMES
• Addresses                          ─────
• Web                                Honorific prefix [____]
• Events                             Given name       [____]
• Relations                          Middle name      [____]
• Skills                             Family name      [____]
• Interests                          Honorific suffix [____]
• Notes                              Phonetic given   [____]
                                     Phonetic family  [____]
                                     Phonetic middle  [____]
```

The sticky TOC scrolls with the form and highlights the active section based on viewport position.

#### 4.15.2 Multi-value section pattern

Every multi-value section follows the same UI shape:

```
EMAIL
─────
┌────────────────────────────────────────────────────────────┐
│ [Type ▼ work    ]  [email@work.com               ]  [⭐] [×] │
├────────────────────────────────────────────────────────────┤
│ [Type ▼ home    ]  [personal@example.com         ]  [○] [×] │
├────────────────────────────────────────────────────────────┤
│ [+ Add another email]                                      │
└────────────────────────────────────────────────────────────┘
```

- Type dropdown: curated values + "Custom…" → opens inline custom-type input
- Value field: appropriate input type (email, tel, URL, date)
- Primary toggle (⭐): one per section can be primary. Toggling a new row's star un-stars the previous primary.
- Remove (×): removes the row from the form (soft-delete on save if it had an existing ID)

#### 4.15.3 Address section

Address is special: each row is structured into Street / Extended / City / Region / Postal / Country / Country code with Type and Primary controls at the top:

```
ADDRESSES
─────────
┌──────────────────────────────────────────────────────────┐
│ Type [home ▼]                            [⭐ Primary] [×] │
│                                                          │
│ Street address    [_______________________________]      │
│ Extended (apt, unit) [_______________________________]   │
│ City              [____________]                         │
│ Region/State      [____________]                         │
│ Postal code       [____________]                         │
│ Country           [Pakistan ▼]    Code: [PK]            │
└──────────────────────────────────────────────────────────┘
[+ Add another address]
```

Country dropdown uses ISO 3166-1 alpha-2 list with display names; country_code auto-populates.

#### 4.15.4 Organization section

```
WORK / AFFILIATIONS
───────────────────
┌──────────────────────────────────────────────────────────────┐
│ Type [work ▼]    [✓ Current] [⭐ Primary]               [×]  │
│                                                              │
│ Organization      [_______________________________]          │
│ Title             [_______________________________]          │
│ Department        [_______________________________]          │
│ Location          [_______________________________]          │
│ Start date  [___]   End date  [___] (disabled if current)   │
└──────────────────────────────────────────────────────────────┘
[+ Add another organization]
```

If "Current" is checked, end date is disabled and cleared. Past organizations show without end date as "Start date — Present" or similar.

#### 4.15.5 Skills / Interests sections

Chip input pattern. Type a skill, hit Enter or comma, chip appears. Click ✕ on chip to remove. Autocomplete suggestions from user's existing entries surface in dropdown as user types.

#### 4.15.6 Relations section

Two row types:

**Linked person:**
```
[Type ▼ spouse]  [@PersonPicker      ]  [_____ notes _____]  [×]
```

**Text-only relation:**
```
[Type ▼ mentor]  [⊕ Sajjad Bhai      ]  [_____ notes _____]  [×]
                  ↑ toggle to text mode
```

A toggle on each row switches between picking an existing Person and entering free text. Stored as `related_person_id` or `related_text` per the schema.

#### 4.15.7 Form submission

- Validate all fields server-side via Zod schemas
- Create / update / soft-delete each multi-value row in a single transaction
- On success, redirect to person detail with toast
- On validation error, scroll to the first invalid field and highlight section in TOC

#### 4.15.8 Custom type entry

When user picks "Custom…" from a type dropdown:
- Inline text input replaces the dropdown
- Same validation rules: 1-32 chars, alphanumeric + spaces + hyphens, lowercased
- Once saved, future occurrences of the custom type appear in the dropdown for that user (recently-used ranking)

#### 4.15.9 Relationship type picker

Dedicated component `relationship-type-picker.tsx` modeled on `project-type-picker.tsx`:
- Standard section: no defaults
- Curated section: `friend`, `colleague`, `family`, `client`, `advisor`, `mentor`, `acquaintance`
- "Custom type…" opens dialog
- Adaptive ranking via `getSuggestedRelationshipTypes()` based on usage in the user's people roster

### 4.16 Improved person picker

Used in: Capture, Task notes, Note bodies, Person filter dropdowns, Waiting-For delegation field, PersonRelation row pickers.

#### 4.16.1 Behavior

- Triggers on `@` keystroke in supported editors and on click in person-typed fields
- Inline dropdown beneath the cursor / field
- Searches:
  - `Person.display_name`, `handle`, `nickname`
  - All non-deleted `PersonEmail.email` values
  - First and family names
- Top of list: most-recently-interacted people (Wave 5a-ii populates `last_contact_at` — until then, sort by `updated_at`)
- Below recent: alphabetical match results
- Bottom of list: "Create new person…" inline option (when query is non-empty)

#### 4.16.2 Render per option

- Avatar (photo or initials)
- Display name
- Title @ Company line if present (from primary current organization)
- Primary email (small, muted) if name match isn't unambiguous
- Tag chips inline (small)
- Keyboard nav: ↑↓ to move, Enter to select, Esc to close

#### 4.16.3 Inline create flow

When user picks "Create new person" with query "Sarah Khan":
- Open small inline dialog (don't navigate away)
- Pre-fill `display_name` from query
- Allow inline entry of: display name, primary email, primary phone
- Required: at least one of email or phone
- All other fields optional — user can complete later via full edit form
- On submit: person created with primary email/phone rows; mention inserted in editor

#### 4.16.4 Performance

People list will be small (single-user, hundreds at most). No virtualization. Simple list rendering.

### 4.17 Tags on people

#### 4.17.1 Schema

```prisma
model TagOnPerson {
  tag_id      String   @db.Uuid
  person_id   String   @db.Uuid
  created_at  DateTime @default(now()) @db.Timestamptz
  
  tag         Tag      @relation(fields: [tag_id], references: [id], onDelete: Cascade)
  person      Person   @relation(fields: [person_id], references: [id], onDelete: Cascade)
  
  @@id([tag_id, person_id])
  @@index([person_id])
  @@index([tag_id])
}
```

Add inverse relations on `Tag` and `Person`. Cascades through `Person` for orphan recovery.

#### 4.17.2 Mutations

- `people.tags.add(personId, tagId)` — creates `TagOnPerson`, increments `Tag.usage_count`, audit log `person_tag_added`
- `people.tags.remove(personId, tagId)` — deletes row, decrements `Tag.usage_count`, audit log `person_tag_removed`
- `people.tags.set(personId, tagIds[])` — diff against current, single transaction

#### 4.17.3 UI

- Tag chips on person detail header with click-to-remove
- "+" pill opens tag picker (same component used elsewhere)
- Tags shown in person card on list view
- Tag filter on people list (multi-select chip filter, AND semantics, URL state)

---

## 5. Verification

### Refactor: dedicated people router
1. `src/server/routers/people.ts` exists, mounted in `_app.ts`
2. All previously-existing person procedures moved out of `capture.ts`
3. Sub-routers / namespaces exist for `emails`, `phones`, `addresses`, `organizations`, `urls`, `events`, `relations`, `skills`, `interests`, `tags`
4. No callers reference `trpc.capture.person.*` anywhere — `npm run typecheck` passes

### Person model expansion
5. All name decomposition fields added per 4.2.1
6. Flat columns dropped: `email`, `phone`, `company`, `role`, `linkedin_url`, `twitter_handle`
7. New flat fields added: `gender`, `biography`, `photo_url`, `relationship_type`, cadence + follow-up fields, `external_data`
8. Validation in `src/core/people/validation.ts` enforces all rules from 4.2.2
9. Display name auto-derives from name parts when empty
10. Display name treated as authoritative once user-set

### PersonEmail
11. Schema correct with baseline + email/type/label/is_primary
12. `add`, `update`, `remove`, `restore` mutations work
13. Primary invariant enforced: marking new primary demotes previous
14. Auto-promote to primary on primary deletion
15. Validation: RFC 5322 email shape
16. Audit log entries fire correctly

### PersonPhone
17. Schema correct, including `e164_normalized` column
18. Normalization via libphonenumber-js with locale-derived default region
19. Failed normalization stores raw input, leaves e164_normalized null
20. Primary invariant + audit log per 13–16

### PersonAddress
21. All structured components present
22. At-least-one-component validation enforced
23. `country_code` validates as 2 uppercase ASCII chars when provided
24. `formatAddress()` returns locale-correct display string
25. `formatted` column stores user override or computed default
26. Primary invariant + audit log per 13–16

### PersonOrganization
27. Schema correct including is_current, is_primary, dates
28. `start_date <= end_date` validation
29. `end_date` null when `is_current = true` validation
30. Person card displays `{title} @ {name}` from primary current org
31. Primary invariant + audit log per 13–16

### PersonUrl
32. Schema and curated types present
33. URL auto-prepends `https://` if scheme missing
34. Type auto-detection from hostname pre-fills dropdown
35. Audit log entries

### PersonEvent
36. Schema correct
37. At most one row per person with `type='birthday'` enforced (replacement on add)
38. Multiple rows allowed for non-birthday types
39. Audit log entries

### PersonRelation
40. Schema correct with named relation pair (`PersonRelation_From` / `PersonRelation_To`)
41. Validation: exactly one of `related_person_id` or `related_text` non-null
42. Detail view shows reverse relations via read-side query (no auto-creation of inverse rows)
43. Audit log entries

### PersonSkill
44. Schema correct
45. Skill autocomplete returns user's existing skill names
46. Audit log entries

### PersonInterest
47. Schema correct
48. Interest autocomplete returns user's existing interest names
49. Audit log entries

### Migration of existing Person rows
50. Migration `20260507000000_wave5a_relational_person` runs cleanly
51. Existing `Person.email` migrates to `PersonEmail` with type='other', is_primary=true
52. Existing `Person.phone` migrates similarly
53. Existing `Person.company` + `role` migrate to single `PersonOrganization` with is_current=true, is_primary=true
54. Existing `Person.linkedin_url` migrates to `PersonUrl` with type='linkedin'
55. Existing `Person.twitter_handle` migrates to `PersonUrl` with type='twitter', URL constructed
56. Audit log: one `person_migrated_to_relational_v5a` entry per migrated person, with original-values JSON
57. Flat columns dropped on `Person` after data migration
58. Orphan recovery test still passes after migration

### People list view
59. `/people/` renders with header, search, filter bar, sort, view toggle
60. Card view default; list view toggle works
61. Card shows avatar (photo or initials), display name, title @ company (from primary current org), city + country (from primary address), tags
62. Sections in card omit cleanly when source data is null
63. List view denser, same data + primary email + primary phone
64. Search debounced 200ms, queries display_name/handle/nickname/given/family/all PersonEmail.email/all PersonOrganization.name/biography
65. Relationship type filter chips dynamic based on types in use
66. Tag filter multi-select with AND semantics
67. Sort options: Name, Recently added, Recently updated, Last contacted (5a-i: defaults to Name)
68. URL state survives refresh; back/forward works
69. Empty state distinguishes zero-people from no-matching-filters
70. "+ Add person" opens create form

### Person detail view
71. `/people/{id}` renders identity card with full name, honorific, nickname, primary org, primary city
72. Sticky TOC nav scrolls with form, highlights active section
73. Sections render only when they have content; empty sections omitted
74. Contact section: email click → mailto, phone click → tel, URL click → new tab with provider icon
75. Work section: current orgs first (primary first), past orgs below
76. Addresses section: primary first, others below; structured display with `formatAddress()`
77. Events section: birthday + others
78. Relations section: linked persons clickable; text relations rendered with notes
79. Reverse relations rendered correctly via read-side query
80. Skills with optional proficiency
81. Interests as plain chips
82. Tasks tab: lists Tasks linked to this person
83. Notes tab: text-search fallback for `@{handle}` matches in body_text
84. Files tab: attachments where parent_type='person'
85. Interactions section: placeholder "Coming in Wave 5a-ii"
86. Edit button opens edit form
87. Delete (overflow menu) soft-deletes with confirmation

### Person create / edit forms
88. Long vertical form with sticky in-page TOC
89. TOC highlights active section based on viewport position
90. Identity section: display name required
91. Names section: full decomposition fields
92. Contact section: multi-value Email, Phone, URL with type/value/primary/remove pattern
93. Type dropdowns include curated values + "Custom…" inline entry
94. Custom type input validates 1-32 chars, alphanumeric+spaces+hyphens, lowercased
95. Recently-used custom types appear in dropdown
96. Address rows: structured input with country dropdown auto-populating country_code
97. Organization rows: name required, current toggle disables end_date, primary marker only on current orgs
98. Skills section: chip input with autocomplete from user's prior skills
99. Interests section: chip input with autocomplete from user's prior interests
100. Relations section: toggle between linked-person picker and text input per row
101. Relationship type picker mirrors Project Type pattern (standard / curated / custom / adaptive)
102. Submit creates / updates / soft-deletes rows in single transaction
103. Validation errors scroll to first invalid field; section highlighted in TOC
104. Cancel confirms unsaved changes if dirty

### Improved person picker
105. `@` triggers picker in Capture, Task notes, Note bodies
106. Searches across name fields, all PersonEmail.email values
107. Most-recently-interacted at top (sort by updated_at in 5a-i)
108. Below recent: alphabetical fuzzy matches
109. "Create new person…" inline option when query is non-empty
110. Inline create dialog: display name + email or phone (one required), all else optional
111. Created person mention inserted into editor
112. Keyboard navigation works (↑↓ Enter Esc)
113. Each option renders avatar, name, title@company, primary email if disambiguating

### Tags on people
114. `TagOnPerson` schema, FKs, indexes, cascade delete
115. `people.tags.add`, `remove`, `set` mutations work
116. `Tag.usage_count` increments / decrements correctly
117. Tag chips on person detail header — add and remove
118. Tag chips shown in person card on list view
119. Tag filter on `/people/` works with AND semantics
120. Audit log: `person_tag_added`, `person_tag_removed`

### Cross-cutting
121. `prisma generate` run after every schema change
122. Person remains in `reattachOrphanData()` post-migration
123. Multi-value Person relations cascade through Person — orphan recovery test still passes
124. New components use Stratum tokens — zero hardcoded hex
125. All new tooltips use `<Hint>`
126. Locale formatting: dates and numbers respect `useLocale()` and pure server formatters
127. `formatAddress()` produces locale-correct strings (US/Canada/UK/default tested)
128. Pino logger used for any new logs
129. Country dropdown uses ISO 3166-1 alpha-2 with display names
130. No regression in capture parsing of `@mentions`
131. No regression in waiting-for delegation flow
132. No regression in task person assignment

When all 132 verification steps pass, Wave 5a-i is complete.

---

## 6. Rules of engagement

### 6.1 The schema is built for two-way sync, even though sync ships in 5b

Every multi-value relation has `source`, `source_id`, `source_metadata`, `last_synced_at`, and `deleted_at`. Don't shortcut these. They're load-bearing for the sync logic that comes next wave.

When a row is soft-deleted, **never hard-delete it without an explicit user action** (and even then, only via the admin panel). Two-way sync needs to know that a row that exists in Google was deliberately removed locally — it can't if the row is gone from the database.

### 6.2 Customer pattern fields use strings, not enums

`type` fields across all multi-value relations are strings, not Prisma enums. The validation layer enforces curated values, but custom values are accepted. This pattern matches `Project.type` and `Person.relationship_type`.

Reason: enums require migrations to extend. The personal CRM space is expansive — phone types, relationship types, organization types — and locking them into enums creates friction every time the user has a new shape of contact data.

### 6.3 No bidirectional auto-creation of relations

When you add "A is parent of B," do NOT auto-create "B is child of A" as a separate row. Maintain a single source of truth. The detail view derives the inverse via read-side query.

If you find yourself writing reciprocal-row creation logic, stop. The complexity isn't worth the small UX win, and it creates drift risk during sync.

### 6.4 Display name treated as authoritative once user-set

Display name is auto-derived from name parts when empty. Once the user has explicitly set it (or it's been set by sync), do not auto-overwrite it on subsequent name part edits.

This protects users who have a `display_name` like "Dr. Sarah" while their name parts say "Sarah Khan" — the formatted display is their preference.

### 6.5 Phone normalization is internal, not user-facing

Store the user's input verbatim. Display the user's input. Use `e164_normalized` only for sync matching.

If a user types "0300-1234567" and we normalize to `+923001234567`, we display "0300-1234567." The normalization is for matching the same person's phone across providers — it's not a "fix your formatting" feature.

### 6.6 The TOC navigation in the form must be sticky and accurate

Long forms with many sections need a navigational anchor. The TOC sidebar:
- Sticks to the viewport during scroll
- Highlights the section currently in view
- Clicking a section scrolls smoothly to it
- Validation errors highlight the relevant section (red dot or similar)

Without this, the form becomes unusable past 5+ sections.

### 6.7 Atlas People is a Dex-quality contact graph

This isn't a contact list. It's a relationship knowledge layer:
- Multi-source (manual, Google Contacts, future LinkedIn, future enrichment)
- Multi-value (real people have multiple emails, addresses, jobs, relationships)
- Round-trippable (every field a provider gives us, we can give back)
- Personal (no sales pipeline framing in this wave)

If you find yourself simplifying to a flat contact card, stop. The richness is the point.

### 6.8 Custom types accumulate organically

When a user adds a custom phone type "WhatsApp," that custom type should appear in future dropdowns for that user. Don't pollute global dropdowns across users — keep custom types user-scoped.

Implementation: track custom types by querying distinct `type` values across each user's existing rows, exclude curated values, sort by recency of use, append to the dropdown below the curated section.

---

## 7. What is NOT in this wave

These ship in subsequent waves:

**Wave 5a-ii** (immediately next):
- `PersonInteraction` model and log UI
- Cadence + follow-up perspective at `/people/follow-up`
- Auto-detected cadence suggestion banner

**Wave 5b** (sync + remaining integrations):
- Two-way Google Contacts sync (uses the schema this wave establishes)
- `@` mention persistence via `Link` model (replaces the text-search fallback in section 4.14.5)
- Birthdays surface (next 30 days on dashboard) — uses `PersonEvent`
- Person merging with audit log

**Wave 5c** (intelligence layer):
- Relationship strength scores (computed, not stored)
- Opportunities sub-module

**Wave 5d** (external enrichment):
- LinkedIn import (CSV first, API later if access)
- Activity scanning via enrichment provider (Lusha / Apollo / Clay — TBD)
- Job change detection, role updates, life events

**Permanently out of scope:**
- Sales pipeline UX framing (deals, stages, forecasts)
- Mass email or outreach campaigns
- Email or push notifications for people events
- Photo upload UI (URL only in v1)
- Two-way sync of multiple Google accounts simultaneously (single-source for sync MVP; multi-source via per-field provenance is supported in the schema for future)
- Bidirectional `PersonRelation` auto-creation
- Hard-delete of multi-value rows (always soft-delete)

If you find yourself building any of these, stop.

---

## 8. Recommended Build Sequence

Build in this order. Each step is independently testable.

1. **Refactor `people` tRPC router** — move procedures out of `capture.ts`, set up sub-router structure
2. **Add new flat columns on `Person`** (name decomposition, biography, photo_url, etc.) — additive migration, no data move yet
3. **Create multi-value tables** (`PersonEmail`, `PersonPhone`, etc.) — schema only, no data yet
4. **Data migration**: move existing flat fields into multi-value rows in a single transaction; audit-log each migration; drop the dropped flat columns
5. **Per-relation mutations**: build `add`, `update`, `remove`, `restore` for each multi-value relation, with primary invariant enforcement and audit logging
6. **`TagOnPerson`** — schema + mutations
7. **People list view** — header, search, filters, card view first; list view second
8. **Person detail view** — identity card and About section first; Contact, Work, Addresses, Web sections next; Events, Relations, Skills, Interests after; Tasks/Notes/Files tabs last
9. **Person create / edit form** — start with Identity + Names sections, add Contact section (multi-value pattern), then iteratively add other sections; the multi-value UI pattern is reusable across sections so build it well once
10. **Sticky TOC navigation** in form and detail view
11. **Relationship type picker** — modeled on Project Type Picker
12. **Improved person picker** — refactor existing `@` picker to use new `people` router; expand search to multi-value emails; add inline create flow
13. **Final integration check**: capture parsing still works, waiting-for delegation still works, task assignment still works

Run `prisma migrate dev` after each schema change. Run `prisma generate`. Run `npm run typecheck` after every step. Verify orphan recovery test after migration.

---

## 9. Final note

Wave 5a-i is the data foundation that lets Atlas eventually become a Dex-quality personal CRM. Most of the wave's complexity lives in the schema — once that's right, the UI patterns repeat across multi-value sections.

The pattern to internalize: **relations carry source provenance**. Every email, phone, address, organization, URL, event, relation, skill, interest knows where it came from and when it was last synced. That's what makes two-way sync (Wave 5b), enrichment (Wave 5d), and provenance debugging tractable.

Begin with section 4.1.
