# Replit Agent Prompt — Atlas Wave 4c

## Read this entire document before taking any action.

---

## 1. Overview

Wave 4c is a **thickening wave** — it deepens existing modules rather than adding new ones. Most items lean on infrastructure that already shipped in earlier waves (Tags, Tables, TipTap, Notes, Projects).

**Pre-requisites — all must be live:**

- Wave 4a (Notes module with TipTap)
- Wave 4 Refinement (TipTap full editor, Tables, error handling)
- Wave 4b (Tables with all six column types and Drive backup)
- Project Type Rework CR (free-form `Project.type` string, Task #286 merged)
- Auth Hardening CR (orphan recovery, Clerk ID primary lookup)
- Capture Intelligence (three-tier parsing pipeline)

**The work — 8 items:**

1. **Tags on notes** — `TagOnNote` join + UI parity with task tagging
2. **Embed types in notes** — TipTap embed extension for whitelisted providers
3. **CSV import for Tables** — upload-and-create flow with type detection
4. **Multi-select column type** — 7th column type for Tables
5. **Formula column type** — computed values from other columns in the same row
6. **Tracker tables** — designate a Table + column as a Project's metric; surface in Project header
7. **Task templates** — reusable task shapes with checklist support
8. **Note versioning** — snapshot history with view/restore (no diff view in this wave)

**Estimated scope:** 4 weeks of focused work.

**This wave does NOT include:**

- Relation columns between tables
- Public sharing of notes (Wave 4d)
- Type-based templates (Wave 4d)
- Unified Project view (Wave 4d)
- Note diff view (deferred — view and restore only in 4c)
- Calendar, Journals, or People modules (separate waves)

---

## 2. Stack constraints (do not deviate)

- **Framework**: Next.js 15 App Router with React 19 RSC
- **Type safety**: TypeScript strict, tRPC v11, Zod for input validation
- **ORM**: Prisma against Neon Postgres
- **PKs**: UUIDv7 via `newId()` from `src/core/db.ts` — every new model
- **Design system**: Stratum tokens from `src/styles/tokens.css`. **Zero hardcoded hex values anywhere in components.** Use CSS custom properties only.
- **UI primitives**: shadcn/ui via Radix. Tooltips through `<Hint>` from `src/components/ui/hint.tsx` — never raw `title=""`.
- **Icons**: lucide-react (already in stack)
- **Editor**: TipTap (ProseMirror). Use the existing extension surface; do not introduce a different editor.
- **Soft-delete**: every new model with content carries `deleted_at TIMESTAMPTZ?`
- **Audit log**: every meaningful entity change writes to `AuditLog` via `logActivity()` from `src/core/audit.ts`
- **Locale**: number, currency, and date formatting routes through `useLocale()` for client and pure server formatters from `src/lib/locale.ts`
- **Logging**: Pino via the factory in `src/core/logging.ts`
- **Orphan recovery**: any new table with a `user_id` column **must** be added to `reattachOrphanData()` in `src/core/auth/orphan-recovery.ts`. Update the schema comment list.
- **CI**: do not modify `.github/workflows/ci.yml`

---

## 3. Detailed deliverables

### 3.1 Tags on notes

Notes currently have no tag relationship. Tags exist on Tasks (`TagOnTask`) and Attachments (`TagOnAttachment`) but not on Notes.

#### 3.1.1 Schema

```prisma
model TagOnNote {
  tag_id      String   @db.Uuid
  note_id     String   @db.Uuid
  created_at  DateTime @default(now()) @db.Timestamptz
  
  tag         Tag      @relation(fields: [tag_id], references: [id], onDelete: Cascade)
  note        Note     @relation(fields: [note_id], references: [id], onDelete: Cascade)
  
  @@id([tag_id, note_id])
  @@index([note_id])
  @@index([tag_id])
}
```

Update `Tag` and `Note` models to include the inverse relation.

`TagOnNote` does not have a direct `user_id` column — orphan recovery cascades through Note. **Verify** the orphan recovery test still passes after this addition; if not, add explicit handling.

#### 3.1.2 Tag mutations on notes

Extend the `notes` tRPC router:

- `notes.addTag(noteId, tagId)` — creates `TagOnNote` row, increments `Tag.usage_count`, audit log
- `notes.removeTag(noteId, tagId)` — deletes `TagOnNote` row, decrements `Tag.usage_count`, audit log
- `notes.setTags(noteId, tagIds[])` — diff against current, add/remove as needed in single transaction

Existing patterns from `tasks.addTag` etc. should be mirrored.

#### 3.1.3 UI

Note detail header shows a tag row similar to the Task detail tag row:
- Existing tags rendered as chips
- "+ Tag" button opens the same tag picker used for tasks
- Click a tag chip to remove (with confirmation tooltip)

Note list view shows tags inline beneath the title (Stratum tag chip style, small variant).

#### 3.1.4 Tag-based filter on note list

`/notes` gains a tag filter — multi-select tag chips at the top of the list. Filter applied via URL: `?tag=tag-uuid-1&tag=tag-uuid-2`. AND semantics (note must have all selected tags). Survives refresh.

#### 3.1.5 `#tag` syntax in note body

The `#tag` syntax in note body should already work via TipTap mentions. Verify that:
- Typing `#` in the editor opens the tag mention dropdown
- Selecting a tag from the dropdown inserts the mention node
- The note's `body_text` includes the tag label
- The mention click navigates to a tag-filtered view

If this isn't already wired (Wave 4a may have stubbed it), wire it now. The mention node should also create a `TagOnNote` row when first added so the relationship is durable beyond text content.

---

### 3.2 Embed types in notes

The README mentions "Image and URL embedding/unfurling" already exists in Notes. Wave 4c extends this with **provider-specific rich embeds** for a whitelist of services.

#### 3.2.1 TipTap extension

Build a custom TipTap node `Embed` (or use `@tiptap/extension-iframe` as a base if it integrates cleanly). The node has attributes:

- `provider`: enum string — see whitelist below
- `url`: original URL
- `embed_url`: provider-normalized embed URL (e.g., `https://www.youtube.com/embed/VIDEO_ID`)
- `title`: optional, fetched via oEmbed when available
- `thumbnail_url`: optional, fetched via oEmbed when available

#### 3.2.2 Whitelist

Initial supported providers (regex match against URL):

| Provider | URL pattern |
|---|---|
| `youtube` | `youtube.com/watch`, `youtu.be/` |
| `vimeo` | `vimeo.com/` |
| `spotify` | `open.spotify.com/(track|album|episode|playlist)/` |
| `soundcloud` | `soundcloud.com/` |
| `twitter` | `twitter.com/`, `x.com/` |
| `github_gist` | `gist.github.com/` |
| `codesandbox` | `codesandbox.io/s/` |
| `loom` | `loom.com/share/` |

URLs that don't match a whitelisted provider fall back to the existing URL unfurl behavior.

#### 3.2.3 Slash command

Add `/embed` to the slash command menu. Opens a small dialog:

```
┌────────────────────────────────────────┐
│ Embed external content                 │
├────────────────────────────────────────┤
│ Paste a URL                            │
│ [_________________________________]    │
│                                        │
│ Supported: YouTube, Vimeo, Spotify,    │
│ SoundCloud, Twitter, GitHub Gist,      │
│ CodeSandbox, Loom                      │
│                                        │
│      [Cancel]            [Embed]       │
└────────────────────────────────────────┘
```

On submit:
1. Parse URL, detect provider
2. If unsupported: show inline error, suggest pasting as link instead
3. If supported: build `embed_url`, optionally fetch oEmbed metadata
4. Insert `Embed` node at cursor

#### 3.2.4 Render

In the editor and read views:
- Render an iframe with `sandbox="allow-scripts allow-same-origin allow-presentation"`
- Aspect ratio appropriate to provider (16:9 for video, auto for tweets)
- Loading state shows the title and thumbnail (if available) before iframe loads
- Error state shows "Embed unavailable" with the original URL as a fallback link

#### 3.2.5 Drive sync

Embeds round-trip through Markdown export/import as inline links: `[Title](url)`. The provider/embed metadata is recoverable from the URL on re-parse.

---

### 3.3 CSV import for Tables

Currently Tables can only be created empty and populated row-by-row. CSV import lets users seed a Table from existing tabular data.

#### 3.3.1 Endpoint

```
POST /api/convert/import-table
Content-Type: multipart/form-data
Fields: file (CSV, max 10 MB), folder_id?, project_id?, table_name?
```

Use **PapaParse** (already in stack from notes import) to parse the CSV.

Rate limit: **5 imports / min per user**.

#### 3.3.2 Type detection

Server-side first pass on the parsed CSV:

| Detected type | Rule |
|---|---|
| `number` | All non-empty cells are numeric (`Number.isFinite()` after locale-aware parse) |
| `currency` | All non-empty cells match `/^[€$£¥₹₨]?\s?-?\d[\d,]*(\.\d+)?$/` (currency-shaped) |
| `date` | All non-empty cells parse as ISO 8601 or via `chrono-node` parse with high confidence |
| `checkbox` | All non-empty cells are `true`/`false`/`yes`/`no`/`1`/`0` |
| `single_select` | < 20 distinct values across 50+ rows |
| `multi_select` | Cells contain pipe `|` or comma separators with consistent-looking option vocabulary |
| `text` | Default fallback |

`multi_select` detection only fires if the **3.4 Multi-select column type** has shipped first — see Build Sequence.

#### 3.3.3 Preview UI

Tables list page → "Import CSV" button → opens import wizard:

**Step 1: Upload**
- Drag-drop or file picker
- Validate: extension `.csv`, size ≤ 10 MB, parseable

**Step 2: Preview**
- Show first 10 rows as a grid
- Each column header has a type dropdown — defaults to detected type, user can override
- Each column header has an editable name field (defaults to CSV header)
- Show count: "X rows will be imported"

**Step 3: Confirm**
- Pick destination folder (or leave standalone)
- Pick project to attach (optional)
- Confirm Table name (defaults to filename without extension)
- Show estimated row count
- "Import" button

#### 3.3.4 Import flow

In a single transaction:
1. Create `Table` record
2. Create `TableColumn` rows in declared order with detected/overridden types and configs
3. For Single Select / Multi-select columns: extract distinct values across the CSV, create option entries with auto-assigned colors from the Stratum palette
4. Create `TableRow` rows with fractional positions
5. Create `TableCell` rows with type-coerced values

If any row fails type coercion, write `null` cell value and continue. Report the count of failed cells in the success message ("Imported 247 rows. 12 cells couldn't be parsed and were left empty.").

#### 3.3.5 Validation

- Empty CSV → reject with friendly error
- CSV with no parseable rows → reject
- CSV with > 10,000 rows → reject with message suggesting split
- Encoding non-UTF-8 → warn user, attempt latin-1 fallback
- Column count exceeds 50 → reject (sanity limit)

---

### 3.4 Multi-select column type

7th column type for Tables. Stores an array of option IDs, similar in shape to Single Select but with multiple selections per cell.

#### 3.4.1 Schema

`TableColumn.type` accepts new value `multi_select`. The `config` JSON shape mirrors Single Select:

```json
{
  "options": [
    { "id": "uuid-1", "label": "Important", "color": "blue" },
    { "id": "uuid-2", "label": "Urgent", "color": "red" }
  ]
}
```

`TableCell.value` JSON for multi-select cells:

```json
{ "option_ids": ["uuid-1", "uuid-2"] }
```

Empty cell: `{ "option_ids": [] }` or `null` — treat both as empty.

#### 3.4.2 Cell editor

Click cell → opens chip-style picker:
- Search input at top
- Existing options as toggleable chips
- "+ Create new option" inline
- ESC closes; click outside closes; chips remain selected

Display in cell: stacked chips with label and option color (Stratum tag chip style, small variant). Truncate with "+N" badge if more than 3 chips.

#### 3.4.3 Sort and filter

- **Sort**: alphabetical by first selected option label; empty cells last (asc) or first (desc)
- **Filter operators**: `contains any of [opts]`, `contains all of [opts]`, `is empty`, `is not empty`

#### 3.4.4 Aggregation

Footer aggregations for Multi-select:
- `count` — non-empty cell count (default)
- `count_per_option` — show "Important: 12, Urgent: 8" inline (optional, lower priority for this wave)

#### 3.4.5 CSV / JSON sidecar

CSV export: pipe-separated option labels. Cell value `["Important", "Urgent"]` → CSV cell `Important|Urgent`. Empty cell → empty string.

JSON sidecar: full option metadata (with IDs) at the column level + array of option IDs per cell.

---

### 3.5 Formula column type

Heaviest item in the wave. Formula columns produce computed values from other columns **in the same row**.

#### 3.5.1 Scope and constraints

**In scope:**
- Single-row references: `{ColumnName}` resolves to the same row's value in `ColumnName`
- Operators: `+ - * / % ( ) == != < > <= >= && || !`
- Built-in functions: `IF(cond, then, else)`, `CONCAT(a, b, ...)`, `ROUND(n, decimals)`, `ABS(n)`, `MIN(a, b, ...)`, `MAX(a, b, ...)`, `DAYS_BETWEEN(date1, date2)`, `NOW()`, `LEN(text)`, `UPPER(text)`, `LOWER(text)`
- Return types: `number`, `text`, `date`, `boolean`
- Static evaluation at table query time

**Out of scope (do NOT build):**
- Cross-row aggregation (no `SUM(Col)` across rows — that's footer aggregations)
- Cross-table references (relation columns deferred indefinitely)
- User-defined functions
- Loops, recursion, conditionals beyond `IF()`
- Date arithmetic beyond `DAYS_BETWEEN` and `NOW()`

#### 3.5.2 Library

Use **`expr-eval`** (well-tested, MIT, ~10KB, supports custom functions and operators). If `expr-eval` is unsuitable for any reason, document why and pick the next-best small expression evaluator. Do not write a parser from scratch.

#### 3.5.3 Schema

`TableColumn.type` accepts `formula`. `config` JSON:

```json
{
  "expression": "{Quantity} * {UnitPrice}",
  "return_type": "number",
  "decimals": 2
}
```

Formula columns have **no `TableCell` rows** — values are computed at query time. This means:
- Inserting a row doesn't require creating cells for formula columns
- Updating a referenced column doesn't require recomputing stored cells
- Cell value is computed when serializing the row for the UI

#### 3.5.4 Evaluation

Server-side evaluator in `src/core/tables/formula.ts`:

```typescript
function evaluateFormula(
  expression: string,
  rowCells: Record<columnName, cellValue>,
  returnType: 'number' | 'text' | 'date' | 'boolean'
): { value: any; error?: string }
```

Pre-process the expression to replace `{ColumnName}` tokens with resolved values from `rowCells` based on column data type:
- Number/Currency → numeric literal
- Date → ISO date string passed to `DAYS_BETWEEN` or `NOW()`-comparable form
- Checkbox → boolean literal
- Single Select → selected option label as string
- Multi-select → comma-separated option labels as string (defer formula support for multi-select if it adds complexity)
- Text → quoted string

#### 3.5.5 Validation at column save

When a user saves a formula column:

1. **Parse**: expression must parse
2. **Reference check**: every `{ColumnName}` token must match an existing column in the same Table (case-sensitive)
3. **Self-reference check**: a formula column cannot reference itself
4. **Circular reference check**: if column A's formula references column B and B references A, reject
5. **Return type check**: the expression's actual return type must match the declared `return_type`. If `return_type = number` and the expression evaluates to a string, reject

Errors shown inline beneath the formula input, friendly text only ("Column 'XYZ' doesn't exist", not the parser's raw output).

#### 3.5.6 Cell display

Computed cells display:
- **Number**: formatted with `decimals` config + locale (e.g., `1,234.56`)
- **Currency**: formatted with locale currency (e.g., `₨ 2,450.00`)
- **Date**: formatted via locale date format
- **Boolean**: a check or empty (Stratum check icon)
- **Text**: as-is

Error states:
- Evaluation fails → cell shows `#ERROR` in `--accent-danger` color
- Hover shows error reason via `<Hint>`
- Sort treats errors as null
- Filter treats errors as null

#### 3.5.7 UI: Formula input

Add Column → Type: Formula → expression form:

```
Type:           [Formula           ▼]
Return type:    [Number            ▼]
Decimals:       [2]                   (only for Number return type)

Expression:
┌────────────────────────────────────────────┐
│ {Quantity} * {UnitPrice}                   │
└────────────────────────────────────────────┘

Available columns: Quantity (Number), UnitPrice (Currency), Status (Single Select)
Functions: IF, CONCAT, ROUND, ABS, MIN, MAX, DAYS_BETWEEN, NOW, LEN, UPPER, LOWER
```

When the user types `{`, show an inline autocomplete dropdown of column names. Click or arrow-select inserts `{ColumnName}` and closes the dropdown.

#### 3.5.8 Drive sync

CSV export: evaluate formula for each row and export the computed value as a regular cell (no formula syntax in CSV). Multi-select formula support out of scope for this wave.

JSON sidecar: include the formula expression and return type at the column level so the formula can be reconstructed on import.

---

### 3.6 Tracker tables

Designate a Table + a specific column as a Project's metric source. The Project header surfaces the current value (and optional progress against a target).

**This is the only sanctioned percentage in Atlas.** It exists because the user explicitly opts in by configuring a tracker.

#### 3.6.1 Schema

Add to `Project`:

```prisma
tracker_table_id        String?  @db.Uuid
tracker_column_id       String?  @db.Uuid
tracker_aggregation     String?  // sum | average | count | min | max | checked_ratio
tracker_target_value    Decimal? @db.Decimal(18, 4)
tracker_target_label    String?  // optional unit/label, e.g., "km", "books read"

tracker_table  Table?       @relation("TrackerTable", fields: [tracker_table_id], references: [id], onDelete: SetNull)
tracker_column TableColumn? @relation("TrackerColumn", fields: [tracker_column_id], references: [id], onDelete: SetNull)
```

`onDelete: SetNull` ensures that deleting the source Table or column invalidates the tracker without breaking the Project.

#### 3.6.2 Configuration UI

Project settings → new "Tracker" section:

```
TRACKER (optional)
─────────────────────────────────────────

Source table:    [Pick a table         ▼]
Column:          [Pick a column        ▼]   (filtered to compatible types)
Aggregation:     [Sum                  ▼]   (options vary by column type)

Target (optional)
Target value:    [_____]  Label: [_____]    e.g. "1000 km", "50 books"

[Clear tracker]                      [Save]
```

Compatible column types per aggregation:
- `sum`, `average`, `min`, `max`: Number, Currency, Formula(Number)
- `count`: any type
- `checked_ratio`: Checkbox only

When the user changes the source table, the column dropdown filters to valid types. When the user changes the aggregation, the column dropdown re-filters.

#### 3.6.3 Computed metric

Extend `projects.byId` to compute a `tracker` object when a tracker is configured:

```typescript
{
  table_id, column_id, table_name, column_name,
  aggregation, current_value, target_value, target_label,
  percentage,        // null if no target
  status,            // 'configured' | 'unavailable' (table or column deleted)
}
```

Computation respects current Table state — soft-deleted rows excluded, formula columns evaluated.

#### 3.6.4 Display in Project header

`ProjectHeaderMetrics` gains an optional tracker line beneath existing counts:

**With target:**
```
12 tasks total · 8 active · 4 completed · Last activity: yesterday
Distance: 350 km / 1,000 km (35%)
```

**Without target:**
```
12 tasks total · 8 active · 4 completed · Last activity: yesterday
Total saved: ₨ 2,450,000
```

**Unavailable (source deleted):**
```
12 tasks total · 8 active · 4 completed
Tracker unavailable — source has been removed [Reconfigure]
```

The tracker line uses **the same neutral text style** as the other metrics. No celebration UI when % crosses thresholds. No color shifts based on status. Facts, not interpretations.

#### 3.6.5 Audit log

Setting, changing, and clearing a tracker each write an audit log entry: `project_tracker_set`, `project_tracker_changed`, `project_tracker_cleared`.

---

### 3.7 Task templates

Reusable task shapes. Saved once, instantiated many times.

#### 3.7.1 Schema

```prisma
model TaskTemplate {
  id                          String    @id @db.Uuid
  user_id                     String    @db.Uuid
  name                        String
  body_json                   Json?     // optional notes body in TipTap JSON
  body_text                   String?
  default_project_id          String?   @db.Uuid
  default_estimated_minutes   Int?
  default_recurrence_rule     String?
  default_flagged             Boolean   @default(false)
  usage_count                 Int       @default(0)
  created_at                  DateTime  @default(now()) @db.Timestamptz
  updated_at                  DateTime  @updatedAt @db.Timestamptz
  deleted_at                  DateTime? @db.Timestamptz
  
  user                        User                              @relation(fields: [user_id], references: [id], onDelete: Cascade)
  default_project             Project?                          @relation(fields: [default_project_id], references: [id], onDelete: SetNull)
  default_contexts            ContextOnTaskTemplate[]
  default_tags                TagOnTaskTemplate[]
  checklist_items             TaskTemplateChecklistItem[]
  
  @@index([user_id])
}

model TaskTemplateChecklistItem {
  id          String   @id @db.Uuid
  template_id String   @db.Uuid
  body        String
  position    Decimal  @db.Decimal(18, 8)
  
  template    TaskTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)
  
  @@index([template_id])
}

model ContextOnTaskTemplate {
  template_id String @db.Uuid
  context_id  String @db.Uuid
  
  template    TaskTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)
  context     Context      @relation(fields: [context_id], references: [id], onDelete: Cascade)
  
  @@id([template_id, context_id])
}

model TagOnTaskTemplate {
  template_id String @db.Uuid
  tag_id      String @db.Uuid
  
  template    TaskTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)
  tag         Tag          @relation(fields: [tag_id], references: [id], onDelete: Cascade)
  
  @@id([template_id, tag_id])
}
```

Add `TaskTemplate` to `reattachOrphanData()` (it has `user_id`).

#### 3.7.2 tRPC router

New router `taskTemplates`:

- `list()` — user's templates, sorted by `usage_count DESC, name ASC`
- `byId(id)`
- `create(input)` — name, body, defaults, checklist items
- `update(id, input)`
- `delete(id)` — soft delete
- `instantiate(id, overrides?)` — creates a Task from the template; increments `usage_count`; copies checklist items to `ChecklistItem` rows; returns the new Task

#### 3.7.3 UI

**Settings → Templates → Task Templates**:
- List view with name, usage count, default project, last used
- Create / Edit form
- Delete with confirmation

**Capture and new-task entry points**:
- Add "From template…" affordance in:
  - Quick Capture modal (small dropdown next to capture input)
  - New Task button on Tasks views
  - Project detail "+ Task" button
- Picker shows top 10 templates by usage; "All templates…" link opens full picker
- On select: fields prefilled in the new-task UI; user can edit before saving

**"Save as template" action**:
- On any existing task → context menu → "Save as template…"
- Pre-fills the template form from the task's current state
- Captures: title becomes template name, notes/checklist/contexts/tags/estimated time copy over

#### 3.7.4 Out of scope

- Template variables (`{{date}}`, `{{week_number}}`) — defer
- Template categories or folders — defer
- Sharing templates — defer (single-user product)

---

### 3.8 Note versioning

Snapshot history with view and restore. **No diff view in this wave** — that's deferred. Just version list + read-only preview + restore.

#### 3.8.1 Schema

```prisma
model NoteVersion {
  id              String   @id @db.Uuid
  note_id         String   @db.Uuid
  version_number  Int
  body_json       Json
  body_text       String?
  body_markdown   String?
  change_summary  String?
  created_by      String   @db.Uuid    // user_id who triggered the snapshot
  created_at      DateTime @default(now()) @db.Timestamptz
  
  note            Note     @relation(fields: [note_id], references: [id], onDelete: Cascade)
  
  @@index([note_id, version_number])
  @@unique([note_id, version_number])
}
```

`NoteVersion` cascade-deletes with the parent Note. No soft-delete on versions — they live and die with the Note. No `user_id` directly (inherits via Note for orphan recovery).

#### 3.8.2 Snapshot strategy

**Hybrid auto + manual:**

**Auto-snapshot on save with debouncing:**
- On note save, check the latest `NoteVersion` for that note
- If latest version is < 5 minutes old AND created by the same user: **replace** the latest version's content (don't bump version_number, just overwrite)
- Otherwise: create a new version (`version_number = latest + 1`)

**Manual snapshot:**
- Note menu → "Save snapshot" → optional `change_summary` input → creates a new version regardless of debounce window

**Retention cap:**
- Keep last **50 versions per note**
- On version creation, if count > 50: delete the oldest version (version_number = 1 is preserved as the "first ever" anchor; oldest non-anchor is deleted)
- Document this behavior in the UI

#### 3.8.3 tRPC router

Extend `notes`:

- `notes.versions.list(noteId)` — returns version metadata (no body) for the version history panel
- `notes.versions.get(noteId, versionNumber)` — returns full version body for preview
- `notes.versions.restore(noteId, versionNumber)` — creates a NEW version from the selected one's body, makes it current, audit log entry `note_version_restored`

#### 3.8.4 UI

**Note detail → menu → "Version history"**:

Opens a side panel (Stratum side panel pattern, same as the table reference panel from Wave 4b):

```
VERSION HISTORY
─────────────────────────────────
v12  2026-05-06 14:32  current
v11  2026-05-06 14:18
v10  2026-05-05 09:11  "Reorganized intro"
v9   2026-05-04 18:40
...
```

- Click a version → preview pane on the right shows read-only render
- "Restore this version" button on the preview header
- Confirmation dialog: "Restoring will create a new version from this one. Your current version will be preserved in history."
- After restore, side panel updates to show the new current version

**Manual snapshot trigger:**
- Note menu → "Save snapshot" → small dialog with optional summary field → creates the version

**No diff view in this wave.** Add a placeholder "Compare versions (coming soon)" link in the side panel header that's disabled.

#### 3.8.5 Storage notes

Each version stores full TipTap JSON, not deltas. For a single-user product with ~50 versions per note, this is acceptable. Document this trade-off in the Wave 4d planning notes for revisiting if storage becomes a concern.

---

## 4. Verification

### Tags on notes
1. `TagOnNote` exists with proper FKs, indexes, cascade delete
2. `notes.addTag`, `removeTag`, `setTags` mutations exist and work
3. `Tag.usage_count` increments on add, decrements on remove
4. Audit log records `note_tag_added`, `note_tag_removed`
5. Note detail header shows tag chips with click-to-remove
6. Note list shows tags inline
7. `/notes?tag=X&tag=Y` filter works with AND semantics, survives refresh
8. Empty filter state: "No notes with these tags"
9. `#tag` mention syntax in editor inserts mention node and creates `TagOnNote` relationship
10. Mention click navigates to tag-filtered view

### Embed types in notes
11. `Embed` TipTap node defined with required attributes
12. `/embed` slash command opens dialog
13. YouTube URL → embeds successfully with iframe
14. Vimeo URL → embeds
15. Spotify track/album/episode/playlist → embeds
16. SoundCloud → embeds
17. Twitter/X → embeds
18. GitHub Gist → embeds
19. CodeSandbox → embeds
20. Loom → embeds
21. Unsupported URL → friendly error in dialog, suggestion to paste as link
22. iframe carries proper `sandbox` attribute
23. Loading state shows title/thumbnail before iframe loads (when oEmbed available)
24. Markdown export of note with embed produces inline link
25. Markdown import re-detects provider and rebuilds embed node

### CSV import for Tables
26. "Import CSV" button on Tables list page
27. File picker accepts only `.csv`
28. Files > 10 MB rejected
29. Files > 10,000 rows rejected
30. Empty CSV rejected
31. Step 2 preview shows first 10 rows with type-detected columns
32. Each column type can be overridden in preview
33. Each column name can be edited in preview
34. Step 3 confirms folder, project, table name
35. Import creates Table, columns, rows, cells in single transaction
36. Single Select detection creates options with auto-assigned palette colors
37. Multi-select detection works only after section 3.4 ships
38. Failed cell type coercion → null cell, success message reports count
39. Rate limit: 6th import in 1 minute rejected with friendly error
40. Audit log records `table_imported_from_csv`

### Multi-select column type
41. Add Column dropdown includes "Multi-select"
42. Cell editor shows chip-style multi-select picker
43. "+ Create new option" creates new option with palette color
44. Display: chips with truncation "+N" badge for >3 options
45. Sort: alphabetical by first selected option label
46. Filter operators: `contains any of`, `contains all of`, `is empty`, `is not empty`
47. Footer aggregation: `count` of non-empty cells works
48. CSV export: pipe-separated labels per cell
49. JSON sidecar: full option metadata + cell option_ids

### Formula column type
50. Add Column → Type: Formula → expression input visible
51. Return type selector: Number, Text, Date, Boolean
52. Decimals input shown only for Number return type
53. `{` in expression input opens column-name autocomplete
54. Validation: expression must parse
55. Validation: every `{ColumnName}` reference must match an existing column
56. Validation: self-reference rejected with clear error
57. Validation: circular reference rejected
58. Validation: declared return type mismatch rejected
59. Cell value computed at query time (no `TableCell` rows for formula columns)
60. `IF`, `CONCAT`, `ROUND`, `ABS`, `MIN`, `MAX`, `DAYS_BETWEEN`, `NOW`, `LEN`, `UPPER`, `LOWER` all work
61. Operators `+ - * / % ( ) == != < > <= >= && || !` all work
62. Number formula: locale-aware number formatting
63. Currency formula (number with currency display): locale-aware currency formatting
64. Date formula: locale-aware date formatting
65. Boolean formula: check icon or empty
66. Text formula: as-is rendering
67. Eval error: cell shows `#ERROR` in danger color
68. Hover over `#ERROR` shows reason via `<Hint>`
69. Sort treats `#ERROR` cells as null
70. Filter treats `#ERROR` cells as null
71. CSV export: computed value (not formula) per row
72. JSON sidecar: formula expression and return type recoverable

### Tracker tables
73. Project schema has tracker fields with proper FKs
74. Project settings shows Tracker section
75. Source table dropdown lists user's tables
76. Column dropdown filters by aggregation-compatible types
77. Aggregation dropdown filters by column type
78. Target value optional; label optional
79. `projects.byId` returns computed `tracker` object
80. Project header renders tracker line below other metrics
81. With target: shows `current / target (%)`
82. Without target: shows `current` only
83. Source table deleted → tracker shows "Tracker unavailable" with reconfigure link
84. Source column deleted → same
85. Audit log: `project_tracker_set`, `project_tracker_changed`, `project_tracker_cleared`
86. Locale: number/currency in tracker line respects user locale
87. No celebration UI, no color shifts based on % — same neutral style as other metrics

### Task templates
88. `TaskTemplate`, `TaskTemplateChecklistItem`, `ContextOnTaskTemplate`, `TagOnTaskTemplate` all created
89. `TaskTemplate` added to `reattachOrphanData()` and schema comment
90. `taskTemplates` tRPC router has list, byId, create, update, delete, instantiate
91. Settings → Templates → Task Templates list view
92. Create form with name, notes, default project, contexts, tags, estimated minutes, recurrence, flag
93. Checklist items can be added/removed/reordered in the template
94. Edit form pre-fills correctly
95. Soft-delete works
96. "From template…" affordance in Quick Capture modal
97. "From template…" affordance on New Task button
98. "From template…" affordance on Project detail "+ Task"
99. Picker shows top 10 by usage; "All templates…" expands to full list
100. On select: fields prefill in new-task UI; user can edit before saving
101. Instantiate increments `usage_count`
102. Instantiate copies checklist items to `ChecklistItem` rows on the new Task
103. "Save as template" action on existing task pre-fills template form correctly
104. Audit log: `task_template_created`, `task_template_used`, `task_template_deleted`

### Note versioning
105. `NoteVersion` schema, FKs, indexes, unique constraint
106. Auto-snapshot on save with 5-minute debounce: replaces latest if recent
107. Auto-snapshot creates new version when debounce window passed
108. Manual snapshot via menu always creates new version
109. Optional `change_summary` accepted on manual snapshot
110. Retention cap: 50 versions per note enforced; oldest non-anchor pruned
111. First version always preserved
112. `notes.versions.list` returns metadata only (no body)
113. `notes.versions.get` returns full body
114. `notes.versions.restore` creates new version from selected, makes it current
115. Audit log: `note_version_restored`
116. Note detail menu → Version history opens side panel
117. Version list sorted descending (newest first)
118. Click version shows read-only preview
119. Restore button shows confirmation dialog
120. After restore, side panel updates with new current version
121. "Compare versions (coming soon)" link visible but disabled

### Cross-cutting
122. `prisma generate` run after every schema change
123. All new `user_id` tables added to `reattachOrphanData()` — TaskTemplate confirmed
124. All new content tables have `deleted_at` where appropriate
125. Zero hardcoded hex values in any new component
126. All new tooltips use `<Hint>` (no `title=""`)
127. Locale formatting respected throughout (numbers, currency, dates)
128. Pino logger used for any new logging
129. Stratum tokens used for all colors
130. No regression in any prior wave functionality

When all 130 verification steps pass, Wave 4c is complete.

---

## 5. Rules of engagement

### 5.1 Tracker percentages are the only sanctioned percentages

The tracker line in Project header is the sole place a percentage can appear. It exists because the user explicitly opts in by configuring a tracker.

Do not add percentages anywhere else:
- No task completion percentages on Projects
- No formula columns auto-displayed as Project metrics
- No "you're 60% of the way there" messaging
- No celebratory color shifts on tracker

If you find yourself implementing motivational copy, encouraging emojis, or status-based color changes, stop. Facts, not interpretations.

### 5.2 Formula columns are not a programming language

This is a small expression evaluator with same-row references and a curated function set. It is not:
- A programming language with loops or recursion
- A spreadsheet with cross-row aggregation
- A relational system with cross-table references
- A scripting layer for custom logic

If a feature request implies formula columns should support these, defer it. The Tables module is for tabular data, not for being a calculator.

### 5.3 Note versioning preserves, doesn't compete

Versioning runs in the background. It must not:
- Slow down note saves (snapshots happen async or via post-save hook)
- Add a visible "saving version" UI that interrupts editing
- Change the editor experience in any way

The version history panel is opt-in via menu. Most users will never open it. That's fine.

### 5.4 Embed providers are a closed whitelist

Adding a new provider is a code change, not a config option. This is intentional — arbitrary iframes are a security risk, and the whitelist forces deliberate provider review.

If a user pastes an unsupported URL, the system suggests pasting as a regular link. Do not silently treat unknown URLs as embeds.

### 5.5 CSV import is a one-shot, not a sync

CSV import creates a Table from a file once. There is no "re-sync from CSV" or "reimport" — that would be a sync feature with its own conflict semantics. Out of scope.

If the user re-imports the same CSV, they get a new Table. They can delete the old one if they want.

### 5.6 Task templates don't replace projects

A template is a shape for a single task. Multi-task workflows are projects. Don't blur this — no "template = mini-project" feature.

Type-based templates (Wave 4d) will handle the multi-entity instantiation case.

### 5.7 Migration safety

Adding columns to `Project` for tracker fields, adding the `TaskTemplate` family, adding `TagOnNote`, adding `NoteVersion` — these are all additive migrations. They should never:
- Backfill data automatically (no "create initial version for every existing note" — that's a one-shot migration the user opts into if needed, and it's not in scope)
- Change existing column types
- Add NOT NULL constraints to existing tables without defaults

### 5.8 Build sequence respect

Don't ship items out of order. CSV multi-select detection depends on multi-select existing. Formula return type validation against multi-select depends on both. Tracker tables benefit from formula columns being available as tracker sources. Build the foundation before the dependents.

---

## 6. What is NOT in this wave

**Wave 4d territory:**
- Public sharing of notes (URL surface, token rotation, audit on access)
- Type-based templates (instantiate notes + tables + tasks bundle on project creation)
- Unified Project view (aggregate notes, tasks, tables, calendar, journal entries)

**Note diff view** — the version history panel shows list + preview + restore. Diff between any two versions is deferred. Add a disabled "Compare versions (coming soon)" link.

**Relation columns between tables** — explicitly deferred indefinitely. Single-user product doesn't need them.

**Cross-row aggregation in formulas** — that's what footer aggregations are for.

**Cross-table references in formulas** — would require relation columns first.

**User-defined functions in formulas** — closed function set only.

**Template variables** (`{{date}}`, `{{week_number}}`) in task templates — defer.

**Template categories or folders** — defer.

**Calendar, Journals, People modules** — these are separate waves.

**Collaborative editing** — single-user product. Out of scope permanently.

If you find yourself building any of these, stop.

---

## 7. Recommended Build Sequence

Build in this order. Each step is independently shippable and testable.

1. **Tags on notes** — smallest item, builds confidence with the new wave's patterns
2. **Embed types in notes** — isolated to TipTap surface
3. **CSV import for Tables (without multi-select detection)** — isolated to import endpoint
4. **Multi-select column type** — adds the 7th column type
5. **CSV import: enable multi-select detection** — small follow-up to step 3 once step 4 ships
6. **Formula column type** — heaviest item; build once Tables foundation is solid
7. **Tracker tables** — depends on Tables being feature-complete; uses formula columns as valid metric sources
8. **Task templates** — isolated module
9. **Note versioning** — isolated to Notes; build last so the rest of the wave is stable

Run `prisma migrate dev` after each schema change. Run `prisma generate`. Run `npm run typecheck`. Verify the orphan recovery test still passes after every new `user_id` table.

---

## 8. Final note

Wave 4c is the wave where Tables gets serious — formula columns, multi-select, tracker integration. It's also the wave where Notes gets the safety nets — versioning, tagging — that turn it from a writing tool into a knowledge layer.

The tracker tables feature is the philosophical capstone of this wave: it's the one place in Atlas where a percentage can appear, and it appears only because the user explicitly designed the metric. Everything else stays facts-only.

Begin with section 3.1, step 3.1.1.
