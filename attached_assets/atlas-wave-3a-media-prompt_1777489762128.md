# Replit Agent Prompt — Wave 3a Media: Attachments and Media Inbox

## Read this entire prompt before taking any action.

---

## 1. Overview

Atlas's Tasks module has matured but lacks attachment capability. Real GTD use surfaces situations where a task needs an associated file: a screenshot for context, a PDF reference, a meeting agenda, an image of something to remember. This wave adds attachment infrastructure to Tasks and introduces the Media inbox — a unified view of all attachments across Atlas with triage capabilities.

This wave also includes a small but meaningful rename: the **Documents** module placeholder (built in Wave 2 Amendments at ⌘6) is renamed to **Vault**. The new name better communicates the module's scope — it's a vault for life-essential records (passports, deeds, asset ownership, legal documents, digital credentials) rather than a generic document archive. The rename is purely cosmetic at this stage since the module is still a placeholder; the actual Vault module is Phase 2.

**The work:**

1. **Documents → Vault rename** — small but important rename of the Phase 2 placeholder module
2. **Task attachments** — drag-and-drop file upload, display in inspector, multiple attachments per task
3. **Media inbox** — secondary navigation surface listing all attachments across Atlas with filtering, sorting, and bulk operations
4. **Attachment metadata** — tags, descriptions, reviewed flag for triage
5. **Orphan handling** — attachments persist when their parent is deleted, surface in Media inbox for triage

**Pre-requisites:**

- Wave 3a complete and stable
- Wave 3a polish wave complete (subtasks, recurrence, activity feed, quick actions are in place)
- Wave 1's Attachment table exists in schema
- Wave 1's Object Storage (now Cloudflare R2) is functional with signed URL support
- Wave 3c can be running in parallel (no architectural conflict)

**Estimated scope:** 1-2 weeks of focused work.

---

## 2. Architectural context

### 2.1 The Attachment table from Wave 1

Wave 1 included an Attachment table in the schema. That table should already exist. This wave activates it for tasks and adds metadata fields needed for the Media inbox.

Verify the existing schema and add fields as needed. The expected final schema:

```prisma
model Attachment {
  id              String    @id @default(uuid()) @db.Uuid
  user_id         String    @db.Uuid
  user            User      @relation(fields: [user_id], references: [id])
  
  // Storage
  storage_path    String    // Path in R2, e.g., users/{user_id}/attachments/{id}/{filename}
  filename        String    // Original filename, preserved for display
  content_type    String    // MIME type
  size_bytes      BigInt
  
  // Polymorphic parent — which entity this attachment belongs to
  // Wave 1 schema may have this differently; verify and adjust
  parent_type     String?   // "task" | "note" | "journal_entry" | null (orphaned)
  parent_id       String?   @db.Uuid  // ID of the parent entity, or null if orphaned
  
  // Position within parent (for ordering multiple attachments)
  position        Decimal   @db.Decimal(20, 10) @default(0)
  
  // Triage metadata (new in this wave)
  description     String?   // User-added context about the attachment
  reviewed        Boolean   @default(false)  // Has user triaged this in Media inbox?
  
  // For images: dimensions for display optimization
  image_width     Int?
  image_height   Int?
  
  // For images/PDFs: a small thumbnail stored separately for fast Media inbox rendering
  thumbnail_path  String?
  
  // Tags (many-to-many via TagOnAttachment)
  tags            TagOnAttachment[]
  
  created_at      DateTime  @default(now()) @db.Timestamptz
  updated_at      DateTime  @updatedAt @db.Timestamptz
  deleted_at      DateTime? @db.Timestamptz
  
  @@index([user_id, parent_type, parent_id, deleted_at])
  @@index([user_id, reviewed, deleted_at])
  @@index([user_id, content_type, deleted_at])
}

model TagOnAttachment {
  tag_id          String    @db.Uuid
  tag             Tag       @relation(fields: [tag_id], references: [id])
  attachment_id   String    @db.Uuid
  attachment      Attachment @relation(fields: [attachment_id], references: [id])
  
  @@id([tag_id, attachment_id])
  @@index([attachment_id])
}
```

Note the parent_type/parent_id pattern. This is intentionally polymorphic so that as Notes (Wave 4), Journals (Wave 7), and other modules ship, attachments work uniformly. The Media inbox queries this table generically.

### 2.2 Storage layer

Attachments are stored in R2 via the storage abstraction layer (already in place from the R2 setup). The flow:

1. User drops file
2. Frontend uploads to a tRPC endpoint (or signed upload URL)
3. Server stores file in R2 at `users/{user_id}/attachments/{attachment_id}/{filename}`
4. Server creates Attachment record with storage_path
5. For images: generate thumbnail (max 400px on longest side), store separately, save thumbnail_path
6. Display URL is generated on demand via signed URL with custom domain

For images, generating thumbnails server-side is significantly better than rendering full-resolution images everywhere. Use `sharp` library for image processing.

### 2.3 Cross-module reuse

This wave's infrastructure (the Attachment table, upload flow, Media inbox) is built generically and will be reused by:
- Notes (Wave 4) — notes have attachments
- Journals (Wave 7) — journal entries have attachments  
- Vault (Phase 2) — Vault will use a separate model with stricter requirements, but the Attachment infrastructure is the foundation

No special handling needed for cross-module support — the polymorphic parent_type/parent_id supports it from day one.

---

## 3. Detailed deliverables

### 3.0 Documents → Vault rename (do this first)

The Documents module placeholder (added in Wave 2 Amendments at ⌘6) gets renamed to **Vault** throughout the codebase. Since the module is still a placeholder (no actual functionality built), this is a purely cosmetic rename touching:

**Codebase changes:**

1. Module rail navigation: change label from "Documents" to "Vault"
2. Route path: rename `/documents` to `/vault` (set up redirect from old path for any bookmarks)
3. Page component: rename `documents/page.tsx` to `vault/page.tsx`
4. Empty state messaging on the page:
   - Headline: "Vault — coming in Phase 2"
   - Body: "Secure storage for life-essential records: passports, deeds, asset ownership, legal documents, digital credentials. Encrypted, intentional, built for things you want to keep forever. Coming in Phase 2."
5. Keyboard shortcut tooltip/hint: "⌘6 — Vault" (was "⌘6 — Documents")
6. Any code constants, type literals, or i18n strings that reference "Documents" as the module name
7. Search the codebase for `Documents`, `documents`, `DOCUMENTS` — update only those that refer to the module name (not the generic file type term, e.g., "Word document," "PDF documents," etc.)

**What does NOT change:**
- The module is still a Phase 2 placeholder — no functionality is built
- The disabled "Promote to Documents" affordance mentioned later in this prompt becomes "Promote to Vault" (already reflected in 3.2.6)
- Cross-module mentions in code comments stay accurate ("Vault will use this when it ships in Phase 2")

**Why now:**
The rename is in this wave because it's a simple change that benefits from being done before any user data or bookmarks accumulate around the old name. With family/friends starting to use Atlas, doing the rename in the next module shipment is timing the change well — the small disruption is absorbed alongside other changes.

**Verification:** After the rename, the navigation rail shows "Vault" at position ⌘6, the URL reads /vault, and no references to "Documents" remain except in cases where "documents" refers to the generic file type (e.g., file type filter category in Media inbox).

---

### 3.1 Task attachment functionality

#### 3.1.1 Upload flow

Three places where users can attach files:

**A. Drag-and-drop onto task inspector**

The task inspector becomes a drop target. Dragging files over it shows a visual indicator ("Drop to attach"). Releasing files uploads them and attaches to the current task.

**B. Capture modal**

The capture modal (Wave 2) gets a new attachment affordance — a paperclip icon next to the text input. Click → file picker. Selected files are uploaded; the resulting task includes the attachments.

Drag-and-drop also works in the capture modal.

**C. Task list row context menu**

Right-click a task → "Attach file..." → file picker. Less prominent than drag-drop but available.

#### 3.1.2 Upload mechanics

The upload is async and non-blocking:

1. User initiates upload
2. Frontend immediately creates a placeholder UI ("Uploading [filename]... 35%")
3. File uploads in chunks; progress reported via fetch with progress events
4. On completion, Attachment record created, placeholder replaced with real attachment display
5. On failure: clear error, retry option, file is not lost (kept in browser memory until explicit cancel)

For files larger than 25MB, show a confirmation: "This file is [X] MB. Upload anyway?" Files larger than 100MB are rejected with a clear error message ("Atlas supports files up to 100MB. For larger files, consider linking to cloud storage.")

#### 3.1.3 Display in task inspector

The task inspector gets a new section "Attachments" between Notes and Subtasks:

```
ATTACHMENTS · 3
─────────────

[image thumbnail]    [PDF first page]    [📄 generic icon]
screenshot.png       agenda.pdf          notes.docx
1.2 MB               340 KB              45 KB

[+ Attach file]
```

For images: thumbnail (auto-generated, max 200px in this view), filename, size below.
For PDFs: first-page render as thumbnail, filename, size.
For other types: generic file icon (varies by content_type — Word doc icon, code file icon, etc.), filename, size.

Click an attachment → opens in lightbox/viewer:
- Images: fullscreen lightbox with zoom, prev/next arrows for multiple images
- PDFs: inline browser PDF viewer if browser supports, otherwise download
- Video: native video element with controls
- Audio: native audio element with controls
- Other: download immediately

Hover an attachment → reveals quick actions:
- 🔍 View (same as click)
- ⬇ Download
- 🏷️ Add tag
- 🗑️ Detach (removes from task; attachment becomes orphan in Media inbox)

#### 3.1.4 Display in task list rows

Tasks with attachments show a small paperclip icon and count in the task list row:

```
☐ 🚩 Call Ahmed about Q2 partnership   📎3   #urgent  [May 3]
```

Click the paperclip → opens task inspector to the Attachments section.

This isn't on every row — only when count > 0. Keeps lists clean for tasks without attachments.

### 3.2 Media inbox — the new navigation destination

#### 3.2.1 Navigation placement

A disk icon (or similar — a clean, recognizable storage glyph) is added to the secondary navigation area, above the existing Trash icon. The visual hierarchy:

```
[Tasks]
[Calendar]   ← top primary modules
[People]
[Notes]
[Journals]
[Vault]      ← module placeholder (Phase 2; renamed from Documents)

   ─────    ← existing divider

[Media]     ← NEW: disk icon, opens Media inbox
[Trash]     ← existing
```

The two-icon stack at the bottom (Media + Trash) reads as "system management" tools, distinct from the five primary modules above. This is intentional — Media is power-user territory.

The disk icon should be visually distinct from the document/file icons used elsewhere. A simple `Disc` or `HardDrive` icon from Lucide works well.

Keyboard shortcut: `⌘8` opens Media (continuing the ⌘1-⌘5 pattern for primary modules; ⌘6 reserved for Vault, ⌘7 for any future addition; ⌘8 for Media; ⌘9 for Trash).

#### 3.2.2 Media inbox layout

When the Media icon is clicked, the main content area shows the Media inbox:

```
+----------------------------------------------------------+
|  Media                                                   |
+----------------------------------------------------------+
|                                                          |
|  [Search...]    Filter: [All types ▼] [All sources ▼]    |
|                 Sort: [Newest first ▼]                   |
|                                                          |
|  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
|  │          │  │          │  │  📄      │  │          ││
|  │  [image] │  │  [image] │  │   PDF    │  │  [image] ││
|  │          │  │          │  │          │  │          ││
|  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
|  screenshot   meeting-photo  agenda.pdf    diagram      |
|  Task: Call    Task: Q2       Note: Q2     Orphaned     |
|  Apr 28        Apr 27         Apr 27        Apr 25      |
|                                                          |
|  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
|  │  📊      │  │          │  │  🎬      │  │  📄      ││
|  │  XLSX    │  │  [image] │  │  Video   │  │   PDF    ││
|  │          │  │          │  │  0:34    │  │          ││
|  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
|  ...                                                     |
|                                                          |
+----------------------------------------------------------+
```

A grid of attachment tiles. Each tile shows:
- Thumbnail (image, PDF first page, or content-type icon for other types)
- Video duration overlay if applicable
- Filename below thumbnail
- Source attribution: "Task: [title]", "Note: [title]", or "Orphaned" if parent deleted
- Date created

Click a tile → opens the attachment in a side panel with full preview and metadata.

#### 3.2.3 Side panel for attachment detail

When an attachment is selected in Media inbox:

```
+--------------------------------+
|  agenda.pdf            [×]     |
+--------------------------------+
|                                |
|  [PDF preview, full size]      |
|                                |
|  ─────────────────────         |
|                                |
|  FILENAME                      |
|  agenda.pdf                    |
|                                |
|  TYPE                          |
|  PDF · 340 KB                  |
|                                |
|  SOURCE                        |
|  Task: Q2 Planning Meeting     |
|  [Open task →]                 |
|                                |
|  CREATED                       |
|  April 27, 2026 at 2:30 PM     |
|                                |
|  TAGS                          |
|  [meeting] [q2] [+ add]        |
|                                |
|  DESCRIPTION                   |
|  [Optional context note...]    |
|                                |
|  ─────────────────────         |
|                                |
|  ☐ Mark as reviewed            |
|                                |
|  [⬇ Download]  [🗑️ Delete]     |
|                                |
+--------------------------------+
```

The side panel shows:
- Full preview of the attachment (image, PDF, video player, etc.)
- Filename, type, size
- Source attribution with link to parent if exists
- Created timestamp
- Tags (editable)
- Description (editable, free-form text)
- "Reviewed" checkbox for triage
- Actions: download, delete

For orphaned attachments, the SOURCE field shows: "Orphaned (previously attached to deleted task: Q2 Review)" with no live link.

#### 3.2.4 Filters

The Media inbox supports filtering across multiple dimensions:

**By type:**
- All types (default)
- Images
- PDFs
- Documents (Word, Excel, PowerPoint, etc.)
- Videos
- Audio
- Other

**By source:**
- All sources (default)
- Tasks (attachments currently on tasks)
- Notes (attachments currently on notes — empty until Wave 4)
- Journals (attachments currently on journal entries — empty until Wave 7)
- Orphaned (attachments whose parent has been deleted)

**By status:**
- All (default)
- Reviewed
- Unreviewed

**By tag:** Click any tag in any side panel → filters Media inbox to that tag.

**By date range:** date picker for created_at range.

**Search:** searches filename and description fields.

Multiple filters compose (AND logic). Clear all filters with "Reset" button.

#### 3.2.5 Sort

- Newest first (default; sorts by created_at desc)
- Oldest first
- Largest first (size_bytes desc)
- Smallest first
- Filename A-Z
- Filename Z-A

#### 3.2.6 Bulk operations

When multiple attachments are selected (via shift-click or cmd-click):

A bulk action bar appears:

```
3 selected | Tag... | Mark reviewed | Delete | Detach
```

- **Tag**: opens tag picker, applies tags to all selected
- **Mark reviewed**: sets reviewed=true on all selected
- **Delete**: soft-deletes all selected (with confirmation)
- **Detach**: removes parent_id (orphans them); only enabled if all selected currently have a parent

**Future bulk action (when Vault ships):** "Promote to Vault" appears in the bulk bar, enabled only for compatible types (PDFs, images, videos, certain credentials). For this wave, the affordance can be present but disabled with tooltip "Vault module coming soon."

#### 3.2.7 Empty states

- No attachments at all: "No media yet. Attach files to tasks, notes, or journal entries — they'll appear here."
- Filtered to nothing: "No media matches these filters. [Reset filters]"
- Search with no results: "No media matches your search."

### 3.3 Orphan handling

When a parent entity (currently: task; later: note, journal entry) is soft-deleted, its attachments don't cascade-delete. They persist with parent_type and parent_id retained but with a flag indicating orphaned status.

Implementation:

When a task is soft-deleted (deleted_at set):
1. Task's attachments are NOT modified directly
2. Media inbox queries that look at "attachments where parent is alive" filter out attachments whose parent has deleted_at set
3. Media inbox queries that look at "orphaned" attachments include those whose parent has deleted_at set
4. The Attachment record retains its parent_id reference for context display ("Previously attached to deleted task: [title]")

When a task is restored from trash:
- Its attachments become non-orphaned again automatically (no schema change needed; just the parent's deleted_at is cleared)

When a task is hard-deleted (permanent delete via "Empty trash"):
- Its attachments become true orphans: parent_type and parent_id stay set (for historical context) but the parent task no longer exists in DB
- Attachments remain in Media inbox indefinitely until user explicitly deletes them

When user re-assigns an orphan in Media inbox:
- Side panel has "Attach to..." action that lets user pick a different task/note/journal as the new parent
- parent_type and parent_id updated; orphan status removed

### 3.4 tRPC procedures

```
attachments.upload({ file, parent_type, parent_id })  
  // Server-side: receives file, uploads to R2, generates thumbnail if image/PDF, creates Attachment record
  
attachments.list({ parent_type, parent_id })  
  // Lists attachments for a specific parent
  
attachments.byId({ id })  
  // Single attachment with full metadata
  
attachments.update({ id, description?, tags?, reviewed? })  
  // Updates triage metadata
  
attachments.delete({ id })  
  // Soft delete
  
attachments.detach({ id })  
  // Sets parent_id to null (orphans the attachment)
  
attachments.reattach({ id, new_parent_type, new_parent_id })  
  // Re-assigns an orphan to a new parent
  
attachments.bulkUpdate({ ids, updates })  
  // Bulk metadata changes
  
attachments.bulkDelete({ ids })  
  
attachments.bulkDetach({ ids })

// Media inbox
media.list({ filter, sort, limit, cursor })
  // Returns paginated attachments matching filter
  // Filter includes: types[], sources[], status, tag_ids[], date_range, search_query
  
media.stats()  
  // Returns counts: total, by type, unreviewed, orphaned
  // Useful for badge counts in navigation
```

### 3.5 Storage path conventions

Attachment storage paths follow a consistent pattern:

```
users/{user_id}/attachments/{attachment_id}/{filename}
```

Thumbnails stored separately:

```
users/{user_id}/attachments/{attachment_id}/thumb_{filename}.webp
```

Thumbnails are generated as WebP for compression efficiency. Max dimension 400px on longest side.

For PDFs, thumbnail is the rendered first page as image (use `pdf-lib` or similar).

For videos, thumbnail is the first frame (use `ffmpeg` if available, otherwise generic icon).

If thumbnail generation fails (corrupt file, unsupported format), fall back to generic icon. Don't block upload on thumbnail generation.

### 3.6 Settings additions

In Settings → Storage:
- Total attachment count
- Total storage used (human-readable: MB/GB)
- Breakdown by type (images: X MB, PDFs: Y MB, etc.)
- "Manage in Media inbox →" link
- Cleanup suggestion: "You have 12 unreviewed attachments. [Review them]"
- Cleanup suggestion: "You have 3 orphaned attachments. [View orphans]"

### 3.7 Audit log additions

New audit actions:
- `attachment_uploaded` (with parent type/id, filename, size)
- `attachment_deleted`
- `attachment_detached`
- `attachment_reattached` (with old parent and new parent)
- `attachment_metadata_updated`
- `attachment_marked_reviewed`

These appear in the parent entity's Activity feed (e.g., a task's activity shows when files were attached/detached).

---

## 4. File structure additions

```
/atlas
  /app
    /(app)
      /media
        /page.tsx                    # Media inbox page
        /[attachmentId]/page.tsx     # Direct link to attachment detail
  /api
    /attachments
      /upload/route.ts               # Multi-part upload endpoint
  /components
    /attachments
      attachment-tile.tsx            # Grid tile in Media inbox
      attachment-detail-panel.tsx    # Side panel with full preview
      attachment-section.tsx         # In task inspector
      attachment-upload-zone.tsx     # Drag-drop wrapper
      attachment-lightbox.tsx        # Image/video fullscreen viewer
      attachment-thumbnail.tsx       # Reusable thumbnail component
    /media
      media-inbox.tsx                # Main Media inbox view
      media-filters.tsx
      media-sort.tsx
      media-bulk-bar.tsx
  /core
    /attachments
      service.ts                     # Upload, thumbnail generation, etc.
      thumbnail.ts                   # Image/PDF/video thumbnail logic
      validators.ts                  # File type/size validation
  /server
    /routers
      attachments.ts
      media.ts
```

---

## 5. Verification (Definition of Done)

### Documents → Vault rename
1. Module rail at ⌘6 shows "Vault" (not "Documents")
2. Navigate to ⌘6 → page renders with new copy ("Vault — coming in Phase 2", body about secure storage for life-essential records)
3. URL is `/vault` (not `/documents`)
4. Old `/documents` URL redirects to `/vault` (or returns 404 with helpful message)
5. Codebase grep for "Documents" returns only intentional references (file type filter category, comments referencing the rename history)

### Task attachments
6. Open a task inspector → drag an image file onto it
7. Upload progress shown; on completion, image appears as thumbnail in Attachments section
8. Click thumbnail → fullscreen lightbox opens
9. Attach a PDF → first-page thumbnail rendered, click opens browser PDF viewer
10. Attach a Word doc → generic icon shown, click downloads
11. Attach 3 images → all visible in inspector; click first → lightbox with prev/next navigation
12. Hover an attachment → quick actions appear (view, download, tag, detach)
13. Detach an attachment from task → no longer in task inspector, appears orphaned in Media inbox
14. Task list row shows paperclip icon with count for tasks with attachments
15. Click paperclip on row → inspector opens to Attachments section
16. Capture modal supports drag-drop attachments
17. Capture modal supports paperclip → file picker
18. Right-click task → "Attach file..." works

### Media inbox
19. Click disk icon in nav → Media inbox opens
20. All attachments across all parents visible as grid
21. Image attachments show thumbnails
22. PDF attachments show first-page thumbnails
23. Other types show generic icons
24. Each tile shows filename, source attribution, date
25. Click tile → side panel opens with full preview
26. Side panel shows: filename, type, size, source, tags, description, reviewed checkbox
27. Edit description in side panel → saves on blur
28. Add tags via tag picker → saves immediately
29. Mark as reviewed → checkbox state persists
30. Click "Open task →" link → navigates to parent task

### Filters and sort
31. Filter by type "Images" → only images shown
32. Filter by source "Orphaned" → only orphans shown
33. Filter by status "Unreviewed" → only unreviewed shown
34. Click a tag → filters to that tag
35. Search by filename → matching results
36. Multiple filters compose correctly
37. "Reset" clears all filters
38. Sort by largest first → ordered by size desc
39. Sort by filename → alphabetical

### Bulk operations
40. Shift-click multiple tiles → multi-select
41. Bulk action bar appears
42. Bulk tag → all selected get the tag
43. Bulk mark reviewed → all selected reviewed=true
44. Bulk delete → confirmation, all soft-deleted
45. Bulk detach → all become orphans

### Orphan handling
46. Delete a task with attachments → attachments stay in DB
47. Media inbox shows them as "Orphaned (previously attached to: deleted task X)"
48. Restore the task → attachments no longer orphaned
49. Hard-delete a task → attachments remain in Media inbox as orphans
50. Re-assign an orphan to a different task → "Attach to..." dialog works
51. Orphan now appears in the new parent's inspector

### Storage and quotas
52. Try to upload file >100MB → rejected with clear message
53. Upload 25MB file → confirmation shown, upload proceeds on confirm
54. Settings → Storage shows accurate totals and breakdown
55. Cleanup suggestions appear when applicable

### Cross-functional
56. Audit log records all attachment actions
57. Task's Activity feed shows "Attached file: [filename]" entries
58. Search (Cmd+K) finds attachments by filename
59. All thumbnails load via signed URLs through the configured custom domain
60. Signed URLs expire correctly (test by waiting and refreshing)

When all 60 verification steps pass, the Media wave is complete.

---

## 6. Rules of engagement

### 6.1 Attachments are non-blocking

Like capture, file uploads are async and never block the user. Upload starts immediately, progress shown, user can continue working with the task while upload finishes. If upload fails, retry is available; the file is preserved in browser state until user explicitly cancels.

### 6.2 Thumbnails are generated server-side

Don't try to generate thumbnails in the browser. Use server-side image processing (sharp library) for images, PDF rendering for PDFs, ffmpeg for videos when available. This ensures consistent quality and offloads work from the user's browser.

If thumbnail generation fails, fall back to generic icon — never block upload completion on thumbnail generation.

### 6.3 The polymorphic parent pattern is intentional

The Attachment table uses parent_type/parent_id rather than separate foreign keys for each entity type. This is intentional — it means attachments work uniformly across Tasks, Notes, Journals, and any future modules without schema changes.

The trade-off is no foreign-key constraint enforcement at the DB level. Application-level validation must ensure parent_type/parent_id pairs are valid. The cost is acceptable for the flexibility gained.

### 6.4 Vault (Phase 2) is NOT this wave

Vault is a future Phase 2 module for permanent records (passports, deeds, credentials). It has stricter security and curation requirements. This wave does NOT build Vault — it only sets up the infrastructure that Vault will eventually use.

If you find yourself building "promote to Vault" flows or vault-style features, stop. The "Promote to Vault" affordance can exist as a disabled placeholder for now ("Vault module coming soon").

### 6.5 100MB hard limit is real

Files over 100MB are rejected. Atlas isn't a backup service or a video editing platform. The realistic use cases (screenshots, photos, PDFs, occasional video clips) all fit comfortably under this limit. If users need larger files, they should link to cloud storage (Drive, Dropbox) instead of uploading.

### 6.6 Orphans are preserved indefinitely

Don't auto-delete orphaned attachments. The whole point of the Media inbox is that orphans get triaged in the user's own time. The user might want to re-assign an orphan, promote it to Vault (when that exists), or just keep it for reference.

If storage costs become a real concern, that's a Phase 2 conversation about retention policies — not something to silently auto-delete.

### 6.7 Stop and ask if anything is unclear

If at any step something doesn't match expectations, stop and ask. Some specific things to flag:

- If Wave 1's Attachment table schema differs significantly from what's spec'd here
- If the storage abstraction doesn't support the operations needed
- If signed URL generation is unreliable for any file types
- If thumbnail generation is consistently failing for a specific format

---

## 7. Recommended Build Sequence

1. **Documents → Vault rename** — small cosmetic rename of the placeholder module (section 3.0), do this first as it's the smallest piece and unblocks naming consistency for the rest
2. **Schema verification and additions** — confirm Attachment table from Wave 1, add missing fields (description, reviewed, thumbnail_path, image dimensions, TagOnAttachment)
3. **Storage path conventions** — codify the path structure in code constants
4. **Upload endpoint** — multipart upload, validation, R2 storage
5. **Thumbnail generation** — image (sharp), PDF (pdf-lib), basic
6. **Attachment tRPC procedures** — CRUD, list by parent, bulk operations
7. **Task inspector Attachments section** — display, drag-drop, click to view
8. **Lightbox component** — image/video fullscreen viewer with navigation
9. **Capture modal attachment support** — paperclip and drag-drop
10. **Task list row paperclip indicator** — count badge, click to open
11. **Media inbox layout** — grid, tiles, side panel
12. **Media tRPC procedures** — list with filters, stats
13. **Filters and sort** — by type, source, status, tags, date, search
14. **Bulk operations** — selection, action bar, batch updates
15. **Orphan handling** — query logic, "previously attached to" display, reassignment
16. **Settings storage section** — totals, breakdown, cleanup suggestions
17. **Audit log integration** — new action types
18. **Navigation update** — disk icon above trash, ⌘8 shortcut
19. **Verification** — all 60 steps

---

## 8. What's NOT in this wave

**Phase 2 territory:**
- Vault module (the permanent records vault)
- Promotion of attachments to Vault
- Encryption at rest for sensitive attachments
- Vault-style PIN/biometric prompts
- Vault categorization

**Not in scope:**
- OCR on images/PDFs (could be Phase 2 for searchability)
- AI-generated descriptions or tags for attachments (Phase 2)
- Inline image annotation (Phase 2)
- Sharing attachments externally (Phase 3 commercial)
- Attachment versioning (Phase 2)

**Wave 4+ territory (built when those modules exist):**
- Notes attachment UI (the infrastructure is here; Notes module wires it up)
- Journals attachment UI (same)

If you find yourself building any of these, stop.

---

## 9. Final note

This wave fills a real gap that's surfaced through actual GTD use. Tasks have always benefited from contextual files; this wave gives them that capability cleanly. The Media inbox transforms scattered attachments into a triageable workspace, and the polymorphic infrastructure positions Atlas for the rest of Phase 1's modules to inherit attachment capability without rebuilding.

Vault (Phase 2) becomes the natural next step for the small subset of files that genuinely deserve permanent vault-grade storage. But that's a future wave with different requirements. This wave is about getting the everyday file capability solid.

Begin with section 7, step 1.
