# Replit Agent Prompt — Atlas Wave 4b: Tables

## Read this entire prompt before taking any action.

---

## 1. Overview

Wave 4b introduces **Tables** as an independent entity type within the Notes module. Tables are structured tabular data — typed columns, rows of records, inline editing — designed for the simple-but-real use cases that Notes can't handle well: a personal cash register, a reading list with status, a subscription tracker, a packing list for travel.

This is deliberately scoped to NOT compete with Notion or Airtable. The principle remains: simple, mainly personal use. Tables solve the "I want structure for this list" problem without becoming a database platform.

**The work:**

1. **Table entity** — typed columns, rows, optional project attachment
2. **Six column types only** — Text, Number, Date, Checkbox, Single Select, Currency
3. **Inline cell editing** — Airtable-style with keyboard navigation
4. **Sort, simple filter, footer aggregations**
5. **CSV + JSON Drive backup** — hourly, overwrite, full round-trip preservation
6. **Side panel display** when a table is referenced via `[[Table Name]]`
7. **Notes sidebar shows Tables section** — parallel to Notes section
8. **Tables folder hierarchy** — separate from Notes folders, same pattern

**Pre-requisites:**

- Wave 4a shipped and stable (Notes, Locale, scheduled job runner, Project enhancement)
- Project Type rework CR shipped (open-type system)
- Existing Locale formatters work for currency/number/date display
- Existing scheduled job runner can take new job registration

**Estimated scope:** 2-3 weeks of focused work.

---

## 2. Architecture overview

### 2.1 Tables are peers to Notes, not children

Tables live in the same module as Notes (⌘4) but are a distinct entity type. They have their own folder hierarchy (`TablesFolder`), their own sidebar section, their own URL routes. The Notes sidebar shows both Notes and Tables sections in parallel.

This separation is cleaner than treating Tables as "structured notes." A note is prose; a table is data. Mixing them in the same hierarchy creates conceptual confusion. Keeping them parallel respects the difference while reusing the module surface.

### 2.2 Tables can be standalone or attached to a project

Like Notes, Tables have an optional `project_id`. Standalone tables live in the Tables folder structure (e.g., a personal cash register that isn't part of any specific project). Project-attached tables appear in both: the Tables section AND the project's view.

This dual visibility matters for the same reason as Notes: when working in the Tables surface, you see all your tables. When working in a project, you see tables scoped to that project.

### 2.3 Six column types is the entire vocabulary

The column type list is intentionally small:

- **Text** — free-form string (single line; no rich text in v1)
- **Number** — numeric value, formatted via Locale
- **Date** — calendar date (no time component in v1; just date)
- **Checkbox** — boolean
- **Single Select** — pick one from a defined list of options
- **Currency** — numeric value displayed with currency symbol from Locale

Phase 2 may add: Multi-select, Formula, Relation, Long Text, URL, Email, Phone. None of these are in scope for this wave.

### 2.4 Currency uses single global currency from Locale

A Currency column doesn't have a per-column currency setting. The currency symbol and format come from the user's Locale (set in Wave 4a). This matches the simplicity principle — most personal users have one currency they care about.

If a user needs multi-currency tracking (rare for personal use), they can use multiple Number columns labeled with currency context, or wait for Phase 2 to add per-column currency.

### 2.5 Drive backup preserves round-trip

Each table backs up to Drive as **two files**: a CSV with the row data and a JSON sidecar with the schema (column types, options, metadata). Together they round-trip cleanly — given these two files, the table could be reconstructed exactly.

CSV alone would lose column type information (a Currency column would just be numbers). JSON alone would be less universally usable. Both together is the right trade-off.

### 2.6 No versioning, ever, in Drive

Following the same principle as Notes: Drive is disaster recovery, not version history. Every sync overwrites the same files with the same names. Google Drive maintains its own revision history (~30 days) which is sufficient.

### 2.7 Side panel for references

When a Note or Task contains `[[Cash Register]]`, clicking the resulting link opens the table in a side panel rather than navigating away. The user can view and lightly edit cells without losing their context. Close the panel to return.

This is different from Notes references (which open the note in main pane). The reasoning: tables are usually consulted briefly, not deeply edited from within other contexts. Side panel respects that workflow.

---

## 3. Data model

### 3.1 Table entity

```prisma
model Table {
  id              String    @id @default(uuid()) @db.Uuid
  user_id         String    @db.Uuid
  user            User      @relation(fields: [user_id], references: [id])
  
  // Identity
  name            String    @db.VarChar(200)
  description     String?   // Optional short description displayed at top of table
  
  // Organization
  folder_id       String?   @db.Uuid
  folder          TablesFolder? @relation(fields: [folder_id], references: [id])
  
  project_id      String?   @db.Uuid
  project         Project?  @relation(fields: [project_id], references: [id])
  
  position        Decimal   @db.Decimal(20, 10) @default(0)
  
  // Row order: when the user manually reorders rows, this is the canonical order.
  // When sorts are applied, the sort takes precedence in display but doesn't modify this.
  // Stored as array of row IDs in the desired order.
  // Nullable: when null, rows display in created_at order.
  manual_row_order String[]?
  
  // Drive sync state
  drive_csv_file_id  String?
  drive_json_file_id String?
  drive_synced_at    DateTime? @db.Timestamptz
  drive_sync_error   String?
  
  // Standard fields
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz
  
  // Relations
  columns         TableColumn[]
  rows            TableRow[]
  
  @@index([user_id, deleted_at])
  @@index([user_id, folder_id, deleted_at])
  @@index([user_id, project_id, deleted_at])
}

model TablesFolder {
  id              String    @id @default(uuid()) @db.Uuid
  user_id         String    @db.Uuid
  user            User      @relation(fields: [user_id], references: [id])
  
  name            String
  parent_folder_id String?  @db.Uuid
  parent_folder   TablesFolder? @relation("TablesFolderHierarchy", fields: [parent_folder_id], references: [id])
  child_folders   TablesFolder[] @relation("TablesFolderHierarchy")
  
  position        Decimal   @db.Decimal(20, 10) @default(0)
  
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz
  
  tables          Table[]
  
  @@index([user_id, parent_folder_id, deleted_at])
}

model TableColumn {
  id              String    @id @default(uuid()) @db.Uuid
  table_id        String    @db.Uuid
  table           Table     @relation(fields: [table_id], references: [id], onDelete: Cascade)
  
  name            String    @db.VarChar(100)
  type            String    // 'text' | 'number' | 'date' | 'checkbox' | 'single_select' | 'currency'
  position        Decimal   @db.Decimal(20, 10)
  
  // Type-specific configuration
  config          Json      // See section 3.2 for shape per type
  
  // Footer aggregation preference (per column)
  footer_aggregation String? // 'sum' | 'average' | 'count' | 'min' | 'max' | null (no footer)
  
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz
  
  cells           TableCell[]
  
  @@index([table_id, position, deleted_at])
}

model TableRow {
  id              String    @id @default(uuid()) @db.Uuid
  table_id        String    @db.Uuid
  table           Table     @relation(fields: [table_id], references: [id], onDelete: Cascade)
  
  // No "position" here; ordering is via Table.manual_row_order
  // Created_at is fallback ordering when manual_row_order is null
  
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz
  
  cells           TableCell[]
  
  @@index([table_id, deleted_at])
}

model TableCell {
  id              String    @id @default(uuid()) @db.Uuid
  
  row_id          String    @db.Uuid
  row             TableRow  @relation(fields: [row_id], references: [id], onDelete: Cascade)
  
  column_id       String    @db.Uuid
  column          TableColumn @relation(fields: [column_id], references: [id], onDelete: Cascade)
  
  // Value stored as JSON to handle different types
  // For text: { "text": "..." }
  // For number/currency: { "number": 1234.56 }
  // For date: { "date": "2026-04-30" }
  // For checkbox: { "checked": true }
  // For single_select: { "option_id": "opt_xxx" }
  // null cells are absent rows in this table (no row, treated as empty)
  value           Json
  
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  
  @@unique([row_id, column_id])
  @@index([column_id])
}
```

### 3.2 Column type configurations

The `TableColumn.config` JSON differs by type:

**Text:**
```json
{}
```
No configuration. Stored values are strings.

**Number:**
```json
{
  "decimal_places": 2  // Optional; default uses Locale's number_format
}
```

**Date:**
```json
{}
```
No configuration. Stored values are ISO 8601 date strings (YYYY-MM-DD).

**Checkbox:**
```json
{}
```
No configuration. Stored values are booleans.

**Single Select:**
```json
{
  "options": [
    { "id": "opt_001", "label": "Food", "color": "blue" },
    { "id": "opt_002", "label": "Transport", "color": "green" },
    { "id": "opt_003", "label": "Utilities", "color": "yellow" }
  ]
}
```
Stored values reference option IDs. Adding/removing options is a column edit.

**Currency:**
```json
{
  "decimal_places": 2  // Inherits from Locale by default
}
```
Currency symbol and format come from User's Locale; not stored per-column.

### 3.3 Soft delete cascade

When a Table is soft-deleted (deleted_at set), all its columns, rows, and cells are conceptually deleted too. Don't physically cascade — just filter by Table.deleted_at IS NULL in queries. The hard-delete path (after 30 days in Trash) physically removes the row, which CASCADE handles.

---

## 4. Detailed deliverables

### 4.1 Tables module integration

The Notes module sidebar gets a Tables section, parallel to the Notes section:

```
NOTES                                  
                                       
  📥 All notes                  (12)   
  ⭐ Recent                              
                                       
─ FOLDERS ─────────────────       [+]   
▼ Work                                  
    ▼ Q2                                 
        Planning Meetings                
        Strategy Notes                   
                                       
─ PURPOSES ────────────────             
  Meeting Note          (5)             
  Project Brief         (2)             
  ...                                   
                                       
─ TABLES ──────────────────       [+]  ← NEW
                                       
  📊 All tables                  (4)   
                                       
─ TABLE FOLDERS ───────────       [+]   
▼ Personal                              
    Cash Register                       
    Subscriptions                       
▼ Work                                  
    Q2 Metrics                          
    Reading List                        
                                       
[+ New note]   [+ New table]
```

The Tables section has its own folder hierarchy (`TablesFolder`). Tables can be in folders or at the root.

### 4.2 Creating a table

Click "+ New table" → dialog:

```
+----------------------------------------+
|  New table                       [×]   |
+----------------------------------------+
|                                        |
|  Name                                  |
|  [Cash Register___________]            |
|                                        |
|  Folder (optional)                     |
|  [None ▼]                              |
|                                        |
|  Project (optional)                    |
|  [None ▼]                              |
|                                        |
|              [Cancel]    [Create]      |
+----------------------------------------+
```

After creation, navigate to the table's editor view. The new table starts with one default column "Name" (Text type) and zero rows. User adds columns and rows from there.

### 4.3 Table editor view

The table editor is the primary interface for working with table data. Layout:

```
+------------------------------------------------------------------------+
|  ← Back                                                          [⋯]   |
|                                                                         |
|  Cash Register                                                          |
|  47 rows · Last updated 2 hours ago · ☁ Synced                          |
|                                                                         |
|  [Sort: Date ↓]  [Filter ⛛]                              [+ Add row]   |
|                                                                         |
|  ┌─────┬──────────────┬──────────────┬─────────────┬──────────┬──────┐|
|  │ ≡   │ Date         │ Vendor       │ Amount      │ Category │ Reim │|
|  │     │ Date         │ Text         │ Currency    │ Select   │ Chec │|
|  ├─────┼──────────────┼──────────────┼─────────────┼──────────┼──────┤|
|  │ ≡   │ 30-04-2026   │ Daraz        │ ₨ 2,450.00  │ Food     │ ☐    │|
|  │ ≡   │ 28-04-2026   │ Petrol       │ ₨ 5,000.00  │ Transport│ ☑    │|
|  │ ≡   │ 25-04-2026   │ K-Electric   │ ₨ 12,300.00 │ Utilities│ ☐    │|
|  ├─────┼──────────────┼──────────────┼─────────────┼──────────┼──────┤|
|  │     │              │              │ Sum:        │          │ 1/3  │|
|  │     │              │              │ ₨ 19,750.00 │          │      │|
|  └─────┴──────────────┴──────────────┴─────────────┴──────────┴──────┘|
|                                                                         |
|  [+ Add column]                                                         |
|                                                                         |
+------------------------------------------------------------------------+
```

Visible elements:
- Header with table name, row count, last updated, sync status
- Sort button (shows current sort if any)
- Filter button (shows active filter if any)
- "+ Add row" button (also added at bottom of grid)
- Column headers with name and type label
- Row drag handles (≡) on left
- Footer row with aggregations
- "+ Add column" button after the last column

### 4.4 Cell editing UX (Airtable-style)

#### 4.4.1 Three states per cell

- **Idle**: cell shows its value normally
- **Selected**: single-clicked, cell has visible border, can be navigated with arrow keys
- **Editing**: double-clicked or Enter pressed on selected cell; cell becomes editable input

#### 4.4.2 Keyboard navigation

When a cell is selected:
- `Arrow keys` → move selection to adjacent cell
- `Tab` → move right; at last column, wraps to first column of next row
- `Shift+Tab` → move left
- `Enter` → enter edit mode on current cell
- `Escape` → exit edit mode without saving (revert)
- `Type any character` → enter edit mode and start typing
- `Cmd+C / Cmd+V` → copy/paste cell value (single cell only in v1)
- `Delete / Backspace` → clear cell value (with confirmation if non-empty)

When a cell is editing:
- `Enter` → commit and move down to next row's same column
- `Tab` → commit and move right
- `Escape` → revert and exit edit mode
- `Cmd+Enter` → commit but stay in same cell

#### 4.4.3 Type-specific edit behaviors

**Text**: standard input, accepts any string.

**Number**: input only accepts digits, decimal separator (per Locale), and minus sign. Invalid characters rejected at input time. On commit, parsed and stored as number.

**Date**: clicking opens a small date picker. Typing a recognized date format (e.g., "30-04-2026") parses it. Press Enter to commit.

**Checkbox**: cell is interactive — clicking the checkbox toggles. No edit mode needed; toggle is the entire interaction.

**Single Select**: clicking opens a dropdown with the available options. Type to filter. Click an option or press Enter to commit. Includes "Add new option..." at the bottom for inline option creation.

**Currency**: like Number, but displays with currency symbol from Locale.

### 4.5 Column operations

#### 4.5.1 Adding a column

Click "+ Add column" → small dropdown:

```
+----------------------+
| Type                 |
| ─────                |
| Text                 |
| Number               |
| Date                 |
| Checkbox             |
| Single Select        |
| Currency             |
+----------------------+
```

Pick type → small inline form:

```
+--------------------------------+
|  New column                    |
+--------------------------------+
|  Name: [______________]        |
|                                |
|  (Type-specific config)        |
|                                |
|       [Cancel]    [Create]     |
+--------------------------------+
```

For Single Select, the form includes options entry. For Number/Currency, decimal places. For other types, no extra config beyond the name.

After creation, the column appears at the right end of the grid. Existing rows have empty cells for the new column.

#### 4.5.2 Editing a column

Click column header → opens column settings popover:

```
+--------------------------------+
|  Date column                   |
+--------------------------------+
|                                |
|  Name: [Date_____________]     |
|                                |
|  Footer aggregation:           |
|  [Count ▼]                     |
|                                |
|  ─────                         |
|                                |
|  [Move left] [Move right]      |
|  [Delete column]               |
|                                |
+--------------------------------+
```

User can:
- Rename column
- Set/change footer aggregation
- Move left/right (alternative to drag)
- Delete column (with confirmation)

For Single Select columns, the popover also shows option management (rename, reorder, delete options).

**Column type changes are NOT supported in v1.** If user wants to change a Number column to Currency, they delete the column and create a new one. Type changes get into messy data conversion territory; defer to Wave 4c if needed.

#### 4.5.3 Drag-to-reorder columns

Grab the column header and drag horizontally. Other columns shift to make room. Drop to commit. Position field updates.

#### 4.5.4 Deleting a column

Confirmation dialog: "Delete the [Name] column? This will remove all data in this column ([N] cells with values). This cannot be undone after 30 days in trash."

Soft-delete the column. All its cells effectively disappear from view (filtered by column.deleted_at IS NULL).

### 4.6 Row operations

#### 4.6.1 Adding a row

Click "+ Add row" → new empty row appears at bottom. Selection automatically moves to first cell of new row in editing mode (so user can start typing immediately).

If sort is active, the new row appears in its sorted position rather than at bottom. The manual_row_order is updated to include the new row at the end (so when sort is cleared, it appears in creation order).

#### 4.6.2 Drag-to-reorder rows

The drag handle (≡) on the left of each row. Drag vertically to reorder. Updates Table.manual_row_order.

If a sort is active, dragging is **disabled** with a tooltip: "Clear sort to reorder rows manually." This prevents the confusion of "I dragged the row but it didn't move because sort is overriding."

#### 4.6.3 Deleting a row

Right-click row → "Delete row." Or: select row (click drag handle) and press Delete.

Confirmation if row has any non-empty cells. Soft-delete cascades to cells.

#### 4.6.4 Inserting a row above/below

Right-click row → "Insert row above" or "Insert row below." Creates empty row at the specified position.

### 4.7 Sort

#### 4.7.1 Sort UI

Sort button at top of table opens dropdown:

```
+--------------------------------+
|  Sort by                       |
+--------------------------------+
|  ⊙ None (manual order)         |
|  ○ Date (ascending)            |
|  ○ Date (descending)           |
|  ○ Amount (ascending)          |
|  ○ Amount (descending)         |
|  ○ Vendor (A-Z)                |
|  ○ Vendor (Z-A)                |
|  ...                           |
+--------------------------------+
```

Each column gets two sort options (ascending/descending). Sort is single-column only — no multi-column sort in v1.

Selecting a sort:
- Updates the displayed row order
- Doesn't modify Table.manual_row_order
- Disables drag-to-reorder
- Sort indicator shown next to column name in header (↑ or ↓)
- Sort state persists in URL or local state per-table (so refreshing the table preserves sort)

#### 4.7.2 Sort behavior per type

- Text: alphabetical, case-insensitive
- Number/Currency: numeric
- Date: chronological
- Checkbox: false before true (ascending) or true before false (descending)
- Single Select: alphabetical by option label

Empty cells sort to the end in ascending, beginning in descending.

### 4.8 Filter (simple)

#### 4.8.1 Filter UI

Filter button opens panel:

```
+--------------------------------------+
|  Filter                              |
+--------------------------------------+
|                                      |
|  Where: [Category ▼]                 |
|                                      |
|  [equals ▼]                          |
|                                      |
|  Value: [Food ▼]                     |
|                                      |
|  [Clear]              [Apply]        |
|                                      |
+--------------------------------------+
```

Single filter only in v1. No AND/OR groups.

#### 4.8.2 Operators per type

**Text**: equals, contains, doesn't contain, is empty, is not empty
**Number / Currency**: equals, less than, greater than, between, is empty, is not empty
**Date**: equals, before, after, between, is empty, is not empty
**Checkbox**: is checked, is unchecked
**Single Select**: equals, doesn't equal, is empty, is not empty

#### 4.8.3 Filter persistence

Filter state persists in URL (similar to project filter pills) per table. Refreshing or sharing the table URL preserves the filter.

### 4.9 Footer aggregations

Each column with `footer_aggregation` set displays an aggregation in the footer row.

#### 4.9.1 Aggregation types per column type

**Number / Currency**:
- Sum (default)
- Average
- Count (non-empty rows)
- Min
- Max

**Checkbox**:
- "X / Y" (count of checked / total non-empty cells)
- This is the default; no other options

**Date**:
- Earliest
- Latest
- Count

**Text / Single Select**:
- Count (non-empty)

For columns without footer_aggregation set, footer cell is empty.

#### 4.9.2 Aggregation in filtered views

When a filter is applied, footer aggregations recompute for visible rows only. So sum reflects the filtered subset.

### 4.10 Drive backup

#### 4.10.1 File structure

```
Atlas/
  Tables/
    Standalone/                      ← Tables not attached to a project
      Personal/                      ← Folder hierarchy mirrored
        cash-register.csv
        cash-register.meta.json
        subscriptions.csv
        subscriptions.meta.json
      Work/
        ...
    [Project: Half Marathon]/        ← Tables attached to a project
      training-log.csv
      training-log.meta.json
```

Filenames: kebab-case slug of the table name. No date appended (overwrite, no versioning). If two tables would resolve to the same filename, append a numeric suffix on the second one.

#### 4.10.2 CSV format

Standard CSV with header row. Cell values formatted per type:

- Text: as-is, with proper CSV escaping (quotes around values containing commas/newlines)
- Number: numeric, no formatting (e.g., `1234.56` not `1,234.56` — CSV is data, not display)
- Date: ISO 8601 (`2026-04-30`)
- Checkbox: `true` or `false`
- Single Select: option label (e.g., `Food`) — not the option ID
- Currency: numeric with decimal point (e.g., `2450.00` not `₨ 2,450.00`)

Empty cells are empty fields in CSV.

#### 4.10.3 JSON sidecar format

```json
{
  "table": {
    "id": "019dd9d4-a8c5-7000-...",
    "name": "Cash Register",
    "description": null,
    "folder_path": "Personal",
    "project_id": null,
    "project_name": null,
    "created_at": "2026-01-15T10:30:00Z",
    "exported_at": "2026-04-30T15:00:00Z",
    "row_count": 47
  },
  "columns": [
    {
      "id": "col_001",
      "name": "Date",
      "type": "date",
      "position": 1,
      "footer_aggregation": "count"
    },
    {
      "id": "col_002",
      "name": "Vendor",
      "type": "text",
      "position": 2,
      "footer_aggregation": null
    },
    {
      "id": "col_003",
      "name": "Amount",
      "type": "currency",
      "position": 3,
      "footer_aggregation": "sum",
      "config": { "decimal_places": 2 }
    },
    {
      "id": "col_004",
      "name": "Category",
      "type": "single_select",
      "position": 4,
      "footer_aggregation": null,
      "config": {
        "options": [
          { "id": "opt_001", "label": "Food", "color": "blue" },
          { "id": "opt_002", "label": "Transport", "color": "green" },
          { "id": "opt_003", "label": "Utilities", "color": "yellow" }
        ]
      }
    }
  ]
}
```

The sidecar contains everything needed to reconstruct the table's structure. Combined with the CSV row data, it's a complete round-trip backup.

#### 4.10.4 Sync logic

For each table:

1. Compute Drive folder path (Project name or "Standalone" / folder hierarchy)
2. Generate CSV content from rows + columns
3. Generate JSON sidecar
4. If `drive_csv_file_id` and `drive_json_file_id` are set, update existing files; otherwise create new
5. Store returned file IDs and `drive_synced_at`
6. On error, store `drive_sync_error` and continue with next table

**Renames and moves**: when table name changes, filename changes. Same logic as Notes — delete old Drive files, create fresh on next sync.

#### 4.10.5 Job registration

Add to scheduled jobs:

```typescript
{
  name: 'drive-sync-tables',
  schedule: '0 * * * *',  // Hourly at minute 0
  handler: syncTablesToDrive,
  description: 'Backup all tables to Google Drive as CSV+JSON',
}
```

The handler from Wave 4a was a no-op placeholder; this wave implements it.

### 4.11 Side panel display when referenced

When a Note or Task contains `[[Cash Register]]`, the resolved link opens in a side panel rather than navigating away.

#### 4.11.1 Panel layout

```
+---------------------------------+--------------------+
|  Original note/task content     |  ← Side panel      |
|                                 |                    |
|  ...we discussed this in        |  Cash Register     |
|  [[Cash Register]] which shows  |  47 rows           |
|  expense pattern...             |                    |
|                                 |  [Sort] [Filter]   |
|                                 |                    |
|                                 |  ┌──┬───────┐     |
|                                 |  │  │ Date  │     |
|                                 |  │ ≡│ 30-04 │     |
|                                 |  │ ≡│ 28-04 │     |
|                                 |  │  │ ...   │     |
|                                 |  └──┴───────┘     |
|                                 |                    |
|                                 |  [Open full →]     |
|                                 |  [×]               |
+---------------------------------+--------------------+
```

#### 4.11.2 Panel behaviors

- Width: 50-60% of viewport on desktop
- Full-screen on mobile
- Inline editing works in the panel (click cells, edit, etc.)
- Sort and filter work
- "Open full →" button navigates to the table's full editor view
- Close button (×) returns focus to the original content
- Escape key closes the panel

#### 4.11.3 Performance

The panel loads the table's data on open (not preloaded with the parent content). For large tables (1000+ rows), initial load shows a skeleton; rows appear progressively.

For personal scale (typically <500 rows), this is instant.

### 4.12 Tables in Project view

When viewing a project (e.g., "Run a half marathon"), if any tables are attached (via `project_id`), they appear in the project view alongside notes and tasks.

```
+----------------------------------------------------------+
|  Run a half marathon                            [⋯]      |
|  Goal · Active · Target: October 2026                    |
|  ─────                                                    |
|  12 tasks total · 6 active · 6 completed                 |
|  Last activity: yesterday                                |
|                                                           |
|  ── BRIEF ──                                              |
|                                                           |
|  ★ Half Marathon Training Plan                            |
|  My approach to building up to 21km by October...        |
|  [Open note →]                                            |
|                                                           |
|  ── TASKS ──                                              |
|  [task list as before]                                   |
|                                                           |
|  ── NOTES ──                                              |
|  • Training log April 28                                  |
|  • Nutrition strategy                                     |
|                                                           |
|  ── TABLES ──                          ← NEW             |
|  📊 Training log (24 sessions)                           |
|  📊 Race day logistics                                   |
|                                                           |
|  [+ New table]                                            |
|                                                           |
+----------------------------------------------------------+
```

Click a table → opens in main pane (not side panel; user is already in project context). "+ New table" creates a new table pre-attached to this project.

### 4.13 Reference parser updates

The cross-module reference parser from Wave 3a/4a needs to handle Tables:

- `[[Cash Register]]` resolves to a Table if one with that name exists
- The picker shown when typing `[[` includes Tables alongside Notes, Tasks, Projects, Contexts, People
- Tables have a distinct icon (📊) in the picker to differentiate

Update the Link table — `target_type` can now be `'table'`.

### 4.14 Audit log additions

New audit actions:

- `table_created`
- `table_updated`
- `table_deleted`
- `table_restored`
- `table_renamed`
- `table_folder_changed`
- `table_project_changed`
- `column_added`
- `column_renamed`
- `column_deleted`
- `column_reordered`
- `row_added`
- `row_deleted`
- `row_reordered`
- `cell_value_changed` (could be high-volume; consider rate-limiting or batching for activity feed display)
- `tables_folder_created`
- `tables_folder_renamed`
- `tables_folder_moved`
- `tables_folder_deleted`

### 4.15 Settings update

Update Settings → System → Jobs to show the now-active Drive sync — Tables job (was placeholder in Wave 4a):

```
┌────────────────────────────────────────────────────┐
│ Drive sync — Tables                      [Active]  │
│ Backup all tables to Google Drive as CSV + JSON    │
│ Schedule: Every hour                                │
│ Last run: 3:00 PM (success, 4 tables synced)       │
│ Next run: 4:00 PM                                   │
│ [Run now] [Pause]                                   │
└────────────────────────────────────────────────────┘
```

---

## 5. tRPC procedures

```
// Tables
tables.create({ name, folder_id?, project_id? })
tables.list({ folder_id?, project_id? }) → Table[] with column/row counts
tables.byId({ id }) → Table with columns, rows, cells (paginated rows for large tables)
tables.update({ id, name?, description?, folder_id?, project_id? })
tables.delete({ id })

// Folders
tablesFolder.create({ name, parent_folder_id? })
tablesFolder.list() → tree structure
tablesFolder.rename({ id, new_name })
tablesFolder.move({ id, new_parent_folder_id? })
tablesFolder.delete({ id })  // Cascades soft-delete to tables within

// Columns
columns.add({ table_id, name, type, position?, config? })
columns.update({ id, name?, footer_aggregation?, config? })
columns.reorder({ id, new_position })
columns.delete({ id })

// Rows
rows.add({ table_id, position?, initial_values? })
rows.delete({ id })
rows.reorder({ table_id, ordered_row_ids })  // Updates Table.manual_row_order

// Cells
cells.update({ row_id, column_id, value })
cells.bulkUpdate({ updates: [{ row_id, column_id, value }] })

// Search
search.tables({ query, folder_id?, project_id? })
```

---

## 6. File structure additions

```
/atlas
  /app
    /(app)
      /notes
        /tables
          /page.tsx                          (All tables view)
          /[tableId]/page.tsx                (Table editor)
          /folder/[folderId]/page.tsx        (Folder contents)
  /components
    /tables
      table-editor.tsx                       (Main editor view)
      table-grid.tsx                         (The grid component)
      table-cell.tsx                         (Generic cell, dispatches by type)
      cell-text.tsx
      cell-number.tsx
      cell-date.tsx
      cell-checkbox.tsx
      cell-select.tsx
      cell-currency.tsx
      column-header.tsx
      column-add-button.tsx
      column-settings-popover.tsx
      row-drag-handle.tsx
      table-sort-button.tsx
      table-filter-panel.tsx
      table-footer-aggregations.tsx
      table-side-panel.tsx                   (For [[Table]] references)
    /tables/sidebar
      tables-folder-tree.tsx
      tables-section.tsx
    /projects
      project-tables-section.tsx             (NEW: Tables section in project view)
  /core
    /tables
      service.ts                             (CRUD with cell handling)
      drive-sync.ts                          (Sync logic for tables → Drive)
      csv-export.ts                          (Generate CSV from rows + columns)
      json-export.ts                         (Generate JSON sidecar)
      filename.ts                            (Generate safe filenames)
      cell-value.ts                          (Type-specific value handling)
      sort.ts                                (Sort logic per type)
      filter.ts                              (Filter operators per type)
      aggregations.ts                        (Sum, average, etc.)
  /server
    /routers
      tables.ts
      tablesFolder.ts
      columns.ts
      rows.ts
      cells.ts
```

---

## 7. Verification (Definition of Done)

### Tables core
1. Open Notes module → see Tables section in sidebar
2. Click "+ New table" → dialog opens
3. Create table named "Cash Register" → editor opens
4. Default column "Name" exists; zero rows
5. Click "+ Add column" → type picker appears
6. Pick "Date" → name input appears
7. Create Date column → appears in grid
8. Create Number, Text, Checkbox, Single Select, Currency columns the same way
9. All six column types render correctly in headers

### Cell editing
10. Single-click empty cell → cell selected (visible border)
11. Arrow keys navigate selection between cells
12. Tab moves selection right; at end, wraps to next row
13. Enter on selected cell → enters edit mode
14. Type any character on selected cell → enters edit mode and starts typing
15. Escape during edit → reverts and exits edit mode
16. Enter during edit → commits and moves down
17. Tab during edit → commits and moves right

### Type-specific cell editing
18. Text cell: accepts any string
19. Number cell: rejects non-numeric input
20. Number cell formats per Locale on display (e.g., 1,234.56)
21. Date cell: clicking opens date picker
22. Date cell: typing recognized format parses correctly
23. Checkbox cell: clicking toggles state (no edit mode needed)
24. Single Select cell: clicking opens dropdown with options
25. Single Select: type to filter options
26. Single Select: "Add new option..." creates inline option
27. Currency cell: same as Number, displays with currency symbol from Locale

### Column operations
28. Drag column header to reorder → other columns shift
29. Click column header → settings popover opens
30. Rename column → updates everywhere
31. Set footer aggregation → footer updates
32. Move column left/right via popover buttons → reorders
33. Delete column → confirmation, then column removed
34. For Single Select column: option management works (add, rename, reorder, delete)

### Row operations
35. Click "+ Add row" → empty row appended; first cell in edit mode
36. Drag handle (≡) to reorder row → updates manual order
37. Drag-to-reorder disabled when sort active (with tooltip)
38. Right-click row → context menu (insert above/below, delete)
39. Insert row above → new empty row at correct position
40. Delete row → confirmation if non-empty, then removed

### Sort
41. Click Sort → dropdown with column options ascending/descending
42. Apply Date descending → rows reorder correctly
43. Sort indicator (↓) shown next to column header
44. Sort persists on page refresh
45. Clear sort → returns to manual order
46. Empty cells sort to end (ascending) or beginning (descending)

### Filter
47. Click Filter → panel opens
48. Pick column, operator, value → Apply
49. List filters correctly
50. Active filter shown with visual indicator
51. Footer aggregations recompute for visible rows only
52. Clear filter → all rows visible
53. Filter persists on page refresh

### Footer aggregations
54. Number/Currency column: Sum is default; calculates correctly
55. Change to Average, Count, Min, Max → updates correctly
56. Checkbox column: shows X/Y (checked/total) automatically
57. Date column: aggregations available (Earliest, Latest, Count)
58. Empty cells excluded from aggregations correctly

### Drive sync
59. Settings → System → Jobs shows "Drive sync — Tables" as Active
60. Click "Run now" → job triggers
61. Check Google Drive → Atlas/Tables/[Standalone or Project name]/[folder]/cash-register.csv exists
62. Sidecar cash-register.meta.json exists alongside CSV
63. CSV has correct header row and data
64. JSON sidecar has correct schema with column types and Single Select options
65. Edit a cell in Atlas → wait for next sync (or Run now) → Drive files update
66. Rename a table → on next sync, new files created with new name (old files deleted or stay; verify behavior)
67. Move table to different folder → next sync places files in new folder
68. Delete a table in Atlas → on next sync, Drive files removed

### Side panel for [[Table]] references
69. In a Note, type `[[Cash` → picker shows Cash Register table
70. Pick it → reference inserted with table icon
71. Click reference in note → side panel opens with table
72. Edit cells in side panel → changes save
73. Sort and filter work in side panel
74. "Open full →" navigates to full editor
75. Close (×) returns to note
76. Escape key closes side panel

### Tables in project view
77. Create table with project_id set → appears in project view's Tables section
78. Click table in project view → opens in main pane (not side panel)
79. "+ New table" in project view creates table attached to that project

### Folders
80. Create Tables folder via sidebar
81. Move table into folder
82. Create sub-folder (folders within folders) → nests correctly
83. 5-level depth limit enforced
84. Rename folder → reflects everywhere
85. Delete folder → tables within soft-delete (cascade)

### Cross-functional
86. Audit log records all table operations
87. Search (Cmd+K) finds tables by name
88. References from tasks to tables work (Link table updated)
89. Locale changes update number/currency display in tables
90. No regression in Notes, Tasks, Project view, or any prior wave functionality

When all 90 verification steps pass, Wave 4b is complete.

---

## 8. Rules of engagement

### 8.1 Six column types is the entire vocabulary

Don't add more types because they "seem useful." Multi-select, formula, relation, URL, email, phone, long text — all of these are Wave 4c or Phase 2. The simplicity is the design.

If you find yourself wanting to add a new column type, stop. Either user the existing types creatively (e.g., URL stored as Text), or note it as a question for the user.

### 8.2 No multiple views

Tables have one view: the grid. No kanban, no calendar, no gallery. These are Phase 2.

If a feature would require alternate views to make sense (e.g., "show this date column as a calendar"), that's a sign it's out of scope. The use case fits a single-view table or it doesn't fit Tables in this wave.

### 8.3 Cell value validation is strict

Each column type has expected value shape. Reject invalid values at the API layer:

- Text: any string up to ~10,000 chars
- Number/Currency: must be parseable as number; reject NaN
- Date: must be valid ISO 8601 date string
- Checkbox: must be boolean
- Single Select: must reference an existing option ID (or be null/empty)

Don't try to be clever about coercion ("user typed 'true' in a Number cell, maybe they meant 1"). Reject and surface the error to the UI.

### 8.4 Drive sync is one-way always

Tables in Drive are backup. Never read FROM Drive to update Atlas. Even if a user edits the CSV in Drive, the next sync overwrites it. Same principle as Notes Drive sync.

The CSV files include a comment in the JSON sidecar's metadata:
```json
"comment": "Generated by Atlas. Edits to this file will be overwritten on next sync."
```

### 8.5 Performance for personal scale

Don't over-engineer for huge tables. Personal use means:
- Tables with <500 rows in typical case, <5000 in extreme
- Cell updates are individual, not bulk imports
- Sorts and filters operate on the full row set in memory

If a table has 50,000 rows, it'll be slow. That's acceptable for v1. If real use shows users wanting larger tables, Wave 4c can add pagination, virtualization, or server-side filtering.

### 8.6 Currency uses Locale, period

No per-column currency in v1. The Currency column type uses User's Locale settings. If user changes Locale, all currency displays update.

If a user needs multi-currency tracking (e.g., one column USD, another PKR), they use Number columns with the currency context in the column name. Wave 4c may add per-column currency if real use demands it.

### 8.7 Stop and ask if unclear

If something doesn't match expectations during build, stop and ask. Specific things worth flagging:

- If the cell value JSON shape causes issues (e.g., querying becomes complex)
- If Drive's API has unexpected behavior with our naming pattern
- If the side panel UX doesn't feel right for some reason
- If sort/filter performance is bad even at small scale

---

## 9. Recommended Build Sequence

**Phase 1: Schema and infrastructure (3-4 days)**

1. Tables, TablesFolder, TableColumn, TableRow, TableCell schemas — Prisma migrations
2. Cascade behavior verification (soft delete on Table propagates)
3. tRPC procedures for tables, folders, columns, rows, cells

**Phase 2: Cell value handling (2-3 days)**

4. Type-specific value validators
5. Cell value serialization/deserialization
6. Sort logic per type
7. Filter operators per type
8. Aggregation functions

**Phase 3: Grid editor UI (5-7 days)**

9. Table editor page with header
10. Grid component with column headers and rows
11. Cell components per type (Text, Number, Date, Checkbox, Single Select, Currency)
12. Selection and edit state management
13. Keyboard navigation (arrows, Tab, Enter, Escape)
14. Type-specific edit behaviors (date picker, select dropdown, etc.)

**Phase 4: Column and row operations (3-4 days)**

15. Add/edit/delete column
16. Drag-to-reorder columns
17. Add/insert/delete row
18. Drag-to-reorder rows
19. Manual row order tracking

**Phase 5: Sort, filter, footer (2-3 days)**

20. Sort UI and logic
21. Filter UI and logic
22. Footer aggregations component

**Phase 6: Sidebar and module integration (2-3 days)**

23. Tables section in Notes module sidebar
24. Tables folder tree
25. New table dialog
26. All Tables view (flat list across folders)

**Phase 7: Reference handling and side panel (2-3 days)**

27. Update reference parser to handle [[Table]] references
28. Update Link table for target_type='table'
29. Side panel component
30. Wire up: clicking [[Table]] reference opens side panel

**Phase 8: Project view integration (1-2 days)**

31. Tables section in project view
32. Create table pre-attached to project
33. Tables list with row counts in project view

**Phase 9: Drive sync (3-4 days)**

34. CSV export logic
35. JSON sidecar export logic
36. Drive sync handler implementation
37. Wire up to existing scheduled job runner (replace placeholder)
38. Handle file lifecycle (create, update, delete on Drive)

**Phase 10: Verification**

39. All 90 verification steps

---

## 10. What is NOT in Wave 4b

**Wave 4c territory:**
- Tracker table feature (designating a table as a Project's progress tracker, percentage display in Project header)
- Multi-select column type
- Formula column type
- Relation column type (table-to-table links)
- CSV import (bringing data INTO Atlas from CSV)
- Long text / rich text in cells
- Note versioning, public sharing, embed types (deferred items from earlier)
- Unified Project view aggregating all module content

**Phase 2 territory:**
- Multiple views (kanban, calendar, gallery)
- Per-column currency settings
- Pagination/virtualization for large tables
- Cell formatting (conditional, colors)
- Bulk operations (multi-cell paste, fill-down)
- Column type changes (changing Number to Currency without data loss)
- Per-column locale override

**Permanently excluded:**
- Two-way Drive sync (Atlas is always source of truth)
- Cell-level audit log entries in Activity feed (too noisy; aggregate at row/column level only)

If you find yourself building any of these, stop.

---

## 11. Final note

Tables complete the data model story for Atlas's Notes module. With Notes for prose and Tables for structure, users can capture and organize most personal knowledge work without reaching for external tools.

The deliberate scoping — six column types, single view, simple filter, no formulas — is what keeps Tables from drifting into Notion territory. Atlas isn't trying to be a database platform. It's trying to handle the realistic 80% of personal use cases (cash register, reading list, simple trackers) cleanly.

The CSV+JSON Drive backup is the longevity feature. If Atlas disappears tomorrow, your tables exist as readable files anyone can open. That's the trust foundation that makes Atlas safe to commit to as a personal system.

Begin with section 9, Phase 1.
