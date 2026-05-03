# Atlas CR — File Conversion: Markdown Import, Word Import, PDF Export

## Read this entire CR before taking any action.

---

## 1. Overview

Atlas users (you, family, friends) bring content from elsewhere — markdown files from Notion exports, markdown saved from Claude conversations, Word documents from professional contexts. They also need to export Atlas notes to PDF for sharing or archival. None of this is currently supported beyond raw file attachment via the Media wave.

This CR adds three operations:

1. **Markdown import** — import a `.md` file as a new Atlas note, with Notion-specific format detection and Claude-conversation handling
2. **Word import** — import a `.docx` file as a new Atlas note, converting via Mammoth
3. **PDF export** — export any Atlas note as a formatted PDF with Stratum typography

All conversions happen server-side via a unified endpoint. For `.docx` imports, the original file is preserved as an Attachment of the resulting note (so the source is always recoverable). For `.md` imports, no separate attachment is created — the markdown content becomes the note content directly.

PDF import is **explicitly out of scope** for this CR. The output quality of PDF-to-markdown is too unreliable to ship as a primary path; users with PDF content can either type the content manually or use external conversion tools.

**The work:**

1. **Unified server-side conversion endpoint** — single `/api/convert` surface handling all formats
2. **Markdown import** with Notion and Claude conversation special-casing
3. **Word import** via Mammoth, original `.docx` preserved as Attachment
4. **PDF export** with Stratum typography, Locale-driven page size, optional override
5. **Conflict handling** — always prompt user when imported note title matches existing note
6. **Import UI in Notes module** — "+ New note" gets a dropdown with import options
7. **Export UI per note** — note metadata panel gets "Export as PDF" action

**Pre-requisites:**

- Wave 4a (Notes) shipped with TipTap editor
- Wave 4 Refinement shipped (BubbleMenu, slash menu, attachments work)
- Stratum compliance round 2 shipped (clean tokens, CI in place)
- Media wave's Attachment infrastructure exists with polymorphic parent
- R2 storage configured

**Estimated scope:** 1.5-2 weeks of focused work.

**Severity:** Medium. Not blocking but unlocks meaningful workflows (importing existing knowledge, sharing formatted exports).

---

## 2. Architecture

### 2.1 Server-side conversion via unified endpoint

All file conversions happen server-side. Client uploads the file; server performs the conversion; client receives the result. Three reasons:

- Conversion libraries (Mammoth, Puppeteer for PDF generation) are large; keeping them server-side avoids bloating the client bundle
- Consistent code path for all formats — easier to add formats later
- Server can preserve uploaded originals as Attachments without round-tripping the bytes

The endpoint surface:

```typescript
// tRPC procedure shape
convert.import({ 
  file: File,           // Uploaded file (multipart)
  source_format: 'md' | 'docx',
  target_folder_id?: string,
  target_project_id?: string,
}) → ConversionResult

convert.export({
  note_id: string,
  format: 'pdf',
  options?: ExportOptions,
}) → { file_url: string, expires_at: Date }
```

Imports return either a successful note creation OR a conflict response requiring user resolution. Exports return a signed URL to a generated PDF file in R2.

### 2.2 R2 permanent storage for source files

When a `.docx` is imported:
1. File uploads to R2 under `users/{user_id}/imports/{import_id}/source.docx`
2. Conversion runs against the R2-stored copy
3. Resulting note is created
4. Attachment record links the R2 file to the note (parent_type='note', parent_id=note.id)
5. The original `.docx` is now permanently associated with the note

The user can later view the original .docx by clicking it in the Attachments section of the note's metadata panel. They can also re-export it if needed.

For `.md` imports, no separate file is preserved — the markdown content IS the note content, so storing it twice is redundant. The note's body in TipTap JSON form is the canonical representation.

For PDF exports, the generated PDF goes to R2 under `users/{user_id}/exports/{export_id}/{note-name}.pdf` with a TTL (24 hours) so the file doesn't accumulate forever. The user downloads it via signed URL; if they want a permanent copy, they save it locally.

### 2.3 Conflict resolution UX

Conflict happens when an imported note's title matches an existing note's title (case-insensitive, after trimming whitespace).

**Always ask the user.** No silent rename, no silent skip, no per-session "remember my choice." Each conflict is a deliberate decision because note titles are meaningful.

The conflict dialog:

```
+------------------------------------------------------------+
|  A note with this title already exists                    |
+------------------------------------------------------------+
|                                                            |
|  Importing: "Half Marathon Training"                      |
|                                                            |
|  An existing note has the same title:                     |
|                                                            |
|    📄 Half Marathon Training                               |
|       In folder: Personal/Health                          |
|       Last updated: April 12, 2026                        |
|       [Open existing →]                                    |
|                                                            |
|  What would you like to do?                                |
|                                                            |
|     ⊙ Rename the imported note                            |
|       New title: [Half Marathon Training (2)]             |
|                                                            |
|     ○ Replace the existing note                           |
|       Existing content moves to trash                     |
|                                                            |
|     ○ Skip the import                                     |
|       The file is not imported                            |
|                                                            |
|              [Cancel]              [Apply]                 |
+------------------------------------------------------------+
```

The user picks one of three resolutions per conflict. Cancel aborts the entire import.

The "Open existing →" link is helpful — sometimes the user genuinely wants to verify what's already there before deciding.

### 2.4 Import UI in Notes module

The "+ New note" button gets a dropdown affordance. Click the main button → blank note. Click the dropdown chevron → menu:

```
+--------------------------------+
|  + Blank note                  |
|  ─────                         |
|  📥 Import .md file            |
|  📥 Import .docx file          |
+--------------------------------+
```

Selecting an import option opens a file picker filtered to the appropriate extension. After file selection, the conversion begins immediately. UI shows progress. On success, the note is created and the editor opens to it. On conflict, the conflict dialog appears.

For consistency, both import types use the same UI flow — only the file extension filter differs.

### 2.5 Export UI per note

Each note has a metadata panel (right side, with Purpose, Project, Folder, etc.). Add an "Actions" section at the bottom:

```
ACTIONS
  📄 Export as PDF
  📄 Export as Markdown   (already exists if Drive sync produces .md; or new)
```

Click "Export as PDF" → opens a small dialog:

```
+------------------------------------------------------------+
|  Export "Half Marathon Training" as PDF                   |
+------------------------------------------------------------+
|                                                            |
|  Page size:                                                |
|  [A4 ▼]    (defaults to Locale; user can override)        |
|                                                            |
|  Include attachments?                                      |
|  ☑ Embed images inline                                     |
|  ☐ List non-image attachments at end                      |
|                                                            |
|  Header/footer:                                            |
|  ☑ Show note title in header                               |
|  ☑ Show page numbers                                       |
|  ☑ Show export date                                        |
|                                                            |
|              [Cancel]              [Export]                |
+------------------------------------------------------------+
```

Click Export → conversion runs, signed URL returned, browser downloads the PDF.

For Markdown export: this might already work via Drive sync (the `.md` file in Drive is essentially the export). If user wants direct download instead, the same Actions section can include "Download as .md" which generates the file on-demand. This is small additional work; include if it fits naturally, defer otherwise.

---

## 3. Detailed deliverables

### 3.1 Markdown import

#### 3.1.1 Standard markdown handling

For a vanilla `.md` file, the import flow:

1. Read file content (UTF-8 text)
2. Parse frontmatter (YAML between `---` markers at top, if present)
3. Convert remaining markdown to TipTap JSON
4. Extract metadata from frontmatter
5. Check for title conflicts
6. Create note with converted content and metadata

**Frontmatter handling:**

```yaml
---
title: Half Marathon Training Plan
tags: [running, fitness, goal]
created: 2026-01-15
updated: 2026-04-30
---
```

Extracted fields:
- `title` → note title (overrides title-from-filename and title-from-first-heading)
- `tags` → existing Atlas tags matched by name; unmatched tags surface in import summary as "tags not found, would you like to create them?"
- `created` → note created_at (preserved if valid date)
- `updated` → note updated_at (preserved if valid date; otherwise current time)
- Other fields → stored in a `frontmatter` JSON metadata field on the note for future reference (don't discard)

**If no frontmatter title:**

Fall back priority:
1. First H1 heading in the body (and remove that heading from the body to avoid duplication)
2. Filename without extension
3. "Untitled note" (last resort)

**Markdown-to-TipTap conversion:**

Use a markdown parser (e.g., `marked` or `remark`) to produce HTML, then `@tiptap/html` to convert to TipTap JSON.

Supported elements (must round-trip cleanly):
- Headings (H1-H6)
- Paragraphs
- Bold, italic, strikethrough, inline code
- Code blocks with language hints
- Bullet lists, numbered lists, task lists with checkboxes
- Block quotes
- Horizontal rules
- Links (URL + text)
- Images (see image handling below)
- Tables (basic markdown table syntax)
- Footnotes (if parser supports; otherwise convert to inline parenthetical references)

#### 3.1.2 Image references

Markdown images look like `![alt](path/to/image.png)` or `![alt](https://example.com/image.png)`.

**For URL references** (http/https): preserve as-is. Image displays via the URL when note is rendered. Don't try to download and re-host (introduces complexity around expired URLs, copyright, etc.).

**For relative path references** (`./image.png` or `image.png`): the image file isn't accessible to the server during single-file import. Two options:
- Replace with a placeholder text: `[Image: image.png — not imported]`
- Show in import summary: "This file references X images that weren't imported. To include images, export with images embedded."

I'd go with the placeholder approach — preserves the user's intent visually, makes it obvious what's missing.

Future bulk import (deferred to later wave) will handle images by uploading sibling files.

#### 3.1.3 Notion-specific handling

Notion's markdown exports have characteristic patterns. Detect and handle:

**Detection:** Notion exports often have:
- A specific frontmatter shape (Notion adds database properties as frontmatter)
- A header line at the top with the page title and date in a specific format
- Internal links of the form `[Page Title](page-id-hash.md)`
- Image references using Notion's CDN URLs (`https://prod-files-secure.s3.us-west-2.amazonaws.com/...`)

If at least 2 of these patterns are present, treat as Notion export.

**Adaptations:**
- Strip Notion's title header line (it'll be redundant with the H1 we extract or filename)
- Notion's database property frontmatter: parse but don't try to map property types (Notion has tags-as-database-property, status enums, etc., that don't map cleanly to Atlas). Store as `notion_properties` in the frontmatter metadata field.
- Internal links to other Notion pages: convert to plain text or keep as broken links. The user can fix them after import. Don't try to resolve (the target pages aren't in Atlas).
- Notion CDN images: warn the user that these URLs may expire. Offer to download and re-host as Atlas attachments. **For this CR**, just preserve the URLs and add a note to the import summary: "This note contains N images hosted on Notion's CDN that may expire. Consider downloading and re-uploading them."

The "download and re-host Notion images" feature would be valuable but adds complexity. Defer to a future enhancement; user can manually save and re-upload if needed.

#### 3.1.4 Claude conversation handling

Markdown saved from Claude conversations has a distinct format:

**Detection:** Claude conversation exports typically have:
- Alternating sections marked as user vs. assistant (formatting varies — sometimes `## User` / `## Assistant` headers, sometimes plain text with no markers)
- Code blocks with language hints
- Sometimes a date/title at the top

If detected, offer the user a choice:

```
+------------------------------------------------------------+
|  This looks like a Claude conversation                    |
+------------------------------------------------------------+
|                                                            |
|  How should it be imported?                                |
|                                                            |
|     ⊙ As a single note                                     |
|       Imports the entire conversation as one note         |
|                                                            |
|     ○ Just Claude's responses                              |
|       Imports only Claude's parts; skips your prompts     |
|                                                            |
|     ○ Treat as plain markdown                              |
|       Ignore conversation structure                        |
|                                                            |
|              [Cancel]              [Continue]              |
+------------------------------------------------------------+
```

Default selection: "As a single note" (preserves all content; user can edit afterward).

If detection is uncertain (the conversation markers are ambiguous), skip this dialog and treat as plain markdown.

### 3.2 Word import

#### 3.2.1 Conversion via Mammoth

Mammoth.js converts `.docx` to HTML or markdown. For Atlas, use the markdown output and then run it through the same markdown-to-TipTap pipeline as `.md` import.

This means: `.docx` → markdown (via Mammoth) → TipTap JSON (via marked + @tiptap/html). The advantage of going through markdown is consistency — both `.md` and `.docx` imports produce the same kind of TipTap output.

#### 3.2.2 What Mammoth handles well

- Headings (Word's heading styles map to H1-H6)
- Bold, italic, underline
- Bullet and numbered lists (including nested)
- Hyperlinks
- Embedded images (extracted as base64 or files)
- Basic tables
- Block quotes

#### 3.2.3 What Mammoth handles imperfectly

- Complex tables (cell merging, nested tables) — may simplify or break
- Footnotes — Mammoth converts to inline references; quality varies
- Comments and tracked changes — discarded by default
- Drawings, SmartArt, equations — discarded
- Custom styles beyond basic formatting — discarded
- Page breaks — preserved as horizontal rules or discarded

**Be honest about this in the import summary.** If Mammoth's output flags any conversion warnings, surface them to the user:

```
Note imported. Some content was simplified during conversion:
  • 2 footnotes converted to inline references
  • 1 complex table simplified
  • Tracked changes discarded
[Open note] [View original .docx →]
```

The "View original .docx →" links to the Attachment record so the user can always reference the source.

#### 3.2.4 Embedded images from .docx

When Mammoth encounters embedded images in a `.docx`, it can extract them. Two paths:

**Path A: Base64 inline.** Images become data URLs embedded in the markdown. Pros: self-contained note. Cons: bloats the note size, slow rendering for large images.

**Path B: Extract as separate Attachments.** Each image becomes an Attachment record on the note, and the markdown references them via Atlas-internal URLs.

Path B is the right choice — matches how Atlas handles attachments generally, keeps notes lean, makes images browsable in the Attachments section.

Implementation: configure Mammoth's image converter to upload each extracted image to R2 as an Attachment, then return the Atlas URL for use in the markdown.

#### 3.2.5 Original .docx as Attachment

After conversion succeeds:
1. The original `.docx` (already in R2 from upload) gets an Attachment record linking it to the new note
2. Filename preserved for the Attachment
3. Visible in the Attachments section of the note's metadata panel
4. Click → downloads the original via signed URL

This means imports are non-destructive: even if the conversion missed something, the original is recoverable.

### 3.3 PDF export

#### 3.3.1 Generation pipeline

```
TipTap JSON → HTML (via @tiptap/html) → styled HTML (with Stratum print CSS) → PDF (via Puppeteer)
```

Puppeteer renders the HTML in a headless Chrome instance and generates the PDF. This produces the highest-fidelity output, supporting all CSS features including web fonts, gradients, and complex layouts.

#### 3.3.2 Stratum-themed PDF template

The generated PDF should look like an Atlas note in print form. Specifically:

**Typography:**
- Body: Atlas's UI sans-serif font (the same font family used in the editor)
- Headings: same family, same size scale as the editor
- Code blocks: monospace font matching editor

This matches Atlas's visual identity and produces modern-looking PDFs (vs. the traditional serif print convention).

**Spacing and layout:**
- Generous line height (1.6) for readability
- Margins: 1 inch / 25mm on all sides (standard document margins)
- Paragraph spacing: matches editor (looks like the note as you wrote it, not compressed)

**Header (top of each page except first):**
- Note title, left-aligned, smaller font, dimmed color
- Horizontal rule below

**Footer (every page):**
- Page number, right-aligned (e.g., "Page 3 of 7")
- Export date, left-aligned (e.g., "Exported May 2, 2026")
- Horizontal rule above

**First page differences:**
- Larger title at top (the H1 of the note)
- Optional subtitle/description if present in metadata
- No header (since the title is right there)
- Footer same as other pages

**Code blocks:**
- Monospace font
- Subtle background (light gray in light mode print)
- Language indicator (small label at top right) if specified
- Syntax highlighting using a print-friendly theme (e.g., `prism-coy` or similar)

**Images:**
- Embedded inline at appropriate size
- If image exceeds page width, scale to fit
- Preserve aspect ratio
- Caption support if alt text is present

**Tables:**
- Render with visible borders
- Alternate row shading (very subtle) for readability
- Page-break-aware: long tables split across pages with header repeated

#### 3.3.3 Page size from Locale

Locale (set in Wave 4a Settings) determines default page size:
- Pakistan (default), most of the world: A4 (210 × 297 mm)
- US/Canada: Letter (8.5 × 11 in)

User can override per-export in the Export dialog. Options:
- A4
- Letter
- Legal
- A3 (rare but supported for posters)

#### 3.3.4 Attachments handling

The export dialog has options:
- "Embed images inline" (default ON) — images appear in the PDF where they're referenced
- "List non-image attachments at end" (default OFF) — appendix listing attached files (.docx originals, etc.) with their names

If "Embed images inline" is OFF, image references show as `[Image: filename]` placeholders.

The "List non-image attachments at end" option, when enabled, adds a final page:

```
─────
Attachments

  • original-document.docx (uploaded May 1, 2026)
  • supporting-data.xlsx (uploaded April 30, 2026)
```

Useful when sharing the PDF with someone who needs to know what other files are associated with the note.

#### 3.3.5 PDF generation infrastructure

Puppeteer requires a Chrome binary. Three deployment options:

**Option A: Puppeteer with bundled Chromium.** `puppeteer` package downloads Chromium on install. Heavy (~150MB) but self-contained.

**Option B: `puppeteer-core` + system Chrome.** Lightweight package, requires Chrome installed on server. Standard for Linux deployments.

**Option C: Serverless PDF service.** Services like Browserless or PDFShift handle generation remotely. Simpler infrastructure but external dependency and per-export cost.

For Atlas's deployment (Replit-hosted), **Option A** is probably right — self-contained, no external dependencies, predictable behavior. Disk space is the trade-off.

If Replit's environment doesn't allow Puppeteer's full Chromium download (sandbox restrictions), fall back to Option C with a free-tier service.

#### 3.3.6 PDF generation as background job

PDF generation takes seconds, not milliseconds. Don't block the API request. Pattern:

1. User clicks Export → API enqueues a generation job, returns job ID
2. Frontend polls job status (or subscribes via WebSocket if available)
3. When complete, frontend receives signed URL and downloads
4. UI shows progress: "Generating PDF... (this usually takes 5-10 seconds)"

For typical notes (1-5 pages), generation should be under 5 seconds. For long notes with many images, may take 15-30 seconds.

#### 3.3.7 Generated PDF storage

Generated PDFs go to R2 with a TTL:

```
users/{user_id}/exports/{export_id}/{note-slug}.pdf
```

TTL: 24 hours. After that, the file is auto-deleted. R2 supports object lifecycle rules for this — configure once, applies to all files in the exports/ prefix.

The user has 24 hours to download. If they need a permanent copy, they save it locally. Atlas doesn't keep a permanent record of every export; that would accumulate forever.

Each export gets logged in the audit log so the user has a record of "I exported note X on date Y" even after the file is gone.

### 3.4 Conflict resolution implementation

#### 3.4.1 Conflict detection

When importing, after the converted note is ready but before saving:

```typescript
const proposedTitle = extractedTitle.trim()
const conflict = await prisma.note.findFirst({
  where: {
    user_id: ctx.user.id,
    title: { equals: proposedTitle, mode: 'insensitive' },
    deleted_at: null,
  }
})
```

If `conflict` is null, proceed with save.

If `conflict` is non-null, return a conflict response to the client. Client shows the conflict dialog.

#### 3.4.2 Conflict response shape

```typescript
type ImportResult = 
  | { type: 'success', note: Note }
  | { type: 'conflict', existing: NoteSummary, proposed: ProposedNote }

type ProposedNote = {
  title: string,
  body_tiptap: JSON,
  metadata: { ... },
  // Includes everything needed to save once user resolves conflict
}
```

#### 3.4.3 Resolution flow

User picks resolution → client sends:

```typescript
convert.resolveImportConflict({
  proposed: ProposedNote,
  resolution: 'rename' | 'replace' | 'skip',
  new_title?: string,  // Required if resolution is 'rename'
}) → ConversionResult
```

Server applies the resolution:
- **rename**: save proposed note with new_title
- **replace**: move existing note to trash, save proposed note with original title
- **skip**: discard proposed note, do nothing

Audit log entries for replace and skip.

#### 3.4.4 Cancel during conflict

If user clicks Cancel in the conflict dialog (rather than picking a resolution), nothing is saved. The uploaded source file (if .docx) remains in R2 under `imports/` — it'll be cleaned up by a periodic job that removes orphaned import files older than 24 hours.

### 3.5 Audit log additions

New audit actions:

- `note_imported_md` (with metadata: source filename, frontmatter fields detected, format detected as Notion/Claude/plain)
- `note_imported_docx` (with metadata: source filename, conversion warnings count, attachment IDs)
- `note_export_pdf` (with metadata: page size, options selected, generation duration)
- `import_conflict_resolved` (with metadata: resolution chosen, existing note ID, proposed title)

These give forensics for "what did I import and when" — useful when reviewing the source of content.

### 3.6 File size and rate limits

#### 3.6.1 Upload size limits

- `.md` files: max 5MB (text files this large are essentially books; rare but supportable)
- `.docx` files: max 50MB (allows for documents with many embedded images)

Files larger than the limit reject at upload with a clear message.

#### 3.6.2 Export size limits

PDF generation has practical limits:
- Notes longer than 100 pages of content: warn user that generation may take a while, but proceed
- Notes with >50 embedded images: warn user about file size, but proceed

Don't hard-block; warn and proceed.

#### 3.6.3 Rate limiting

To prevent runaway resource use:
- Max 10 imports per user per minute
- Max 5 PDF exports per user per minute

If exceeded, return rate-limit response with retry-after time.

For personal use scale, these limits are essentially never hit. They exist as defensive measures against accidental loops or abuse.

---

## 4. tRPC procedures

```typescript
// Conversion procedures
convert.import({ 
  file: File,
  source_format: 'md' | 'docx',
  target_folder_id?: string,
  target_project_id?: string,
}) → ImportResult

convert.resolveImportConflict({
  proposed: ProposedNote,
  resolution: 'rename' | 'replace' | 'skip',
  new_title?: string,
}) → ImportResult

convert.export({
  note_id: string,
  format: 'pdf',
  options: ExportOptions,
}) → { job_id: string }

convert.exportStatus({ job_id: string }) → 
  | { status: 'pending' | 'generating' }
  | { status: 'complete', file_url: string, expires_at: Date }
  | { status: 'failed', error: string }

convert.exportMd({ note_id: string }) → { content: string, filename: string }
  // Direct .md download; lightweight; synchronous
```

---

## 5. Schema changes

```prisma
model Note {
  // existing fields
  
  // NEW: store imported metadata for reference
  imported_from   String?   // 'md' | 'docx' | null (null = native Atlas note)
  imported_at     DateTime? @db.Timestamptz
  source_metadata Json?     // Frontmatter fields, Notion properties, conversion warnings
  
  // existing fields continued
}

// No new tables; uses existing Attachment for source file storage
// No new tables for export jobs; use existing job runner with a 'pdf-export' type
```

---

## 6. File changes

```
/atlas
  /src
    /app
      /api
        /convert
          import/route.ts             (NEW: file upload + conversion endpoint)
          export/route.ts             (NEW: PDF generation endpoint)
    /components
      /notes
        new-note-button.tsx           (UPDATED: dropdown with import options)
        import-conflict-dialog.tsx    (NEW)
        import-progress-dialog.tsx    (NEW)
        export-pdf-dialog.tsx         (NEW)
        claude-conversation-dialog.tsx (NEW: special handling choice)
        note-actions-section.tsx      (UPDATED: add Export as PDF action)
    /core
      /conversion
        md-import.ts                  (NEW: markdown parser + frontmatter)
        md-import-notion.ts           (NEW: Notion-specific handling)
        md-import-claude.ts           (NEW: Claude conversation handling)
        docx-import.ts                (NEW: Mammoth wrapper)
        pdf-export.ts                 (NEW: Puppeteer + Stratum template)
        tiptap-converter.ts           (NEW: markdown ↔ TipTap JSON)
        format-detector.ts            (NEW: detect Notion / Claude / plain)
        conflict-resolver.ts          (NEW)
        attachment-extractor.ts       (NEW: extract images from .docx)
      /pdf
        pdf-template.html             (NEW: Stratum-themed print CSS)
        pdf-render.ts                 (NEW: Puppeteer integration)
    /server
      /routers
        convert.ts                    (NEW: all conversion procedures)
      /jobs
        pdf-export-job.ts             (NEW: background PDF generation)
        import-cleanup-job.ts         (NEW: clean up orphaned import files)
  /package.json
    + mammoth                        (~700KB)
    + marked OR remark               (markdown parser)
    + @tiptap/html                   (TipTap HTML conversion)
    + gray-matter                    (frontmatter parser)
    + puppeteer OR puppeteer-core    (PDF generation)
```

---

## 7. Verification

### Markdown import — basic
1. Click "+ New note" dropdown → import options visible
2. Select "Import .md file" → file picker opens, filtered to .md
3. Select a vanilla .md file → import progresses; note created
4. Note title taken from first H1 (or filename if no H1)
5. Body content matches source markdown
6. Bold, italic, headings, lists all rendered correctly in editor
7. Code blocks preserved with language hints
8. Images via URL render correctly
9. Images via relative path show placeholder text

### Markdown import — frontmatter
10. .md with frontmatter title → note title from frontmatter
11. .md with frontmatter tags matching existing tags → tags applied
12. .md with frontmatter tags not matching → import summary shows "X tags would be created — confirm"
13. .md with frontmatter created/updated dates → preserved on note
14. .md with custom frontmatter fields → stored in source_metadata

### Markdown import — Notion
15. Import a Notion-exported .md → format detected
16. Notion title header line stripped; note title clean
17. Notion CDN images preserved with warning in import summary
18. Notion internal links converted to plain text or kept as broken links
19. Notion database properties stored in source_metadata

### Markdown import — Claude conversation
20. Import a Claude conversation .md → detection dialog appears
21. "As a single note" → entire conversation imported
22. "Just Claude's responses" → only assistant parts kept
23. "Treat as plain markdown" → no special handling
24. Default selection is "As a single note"

### Word import — basic
25. Click "+ New note" dropdown → "Import .docx file" option
26. Select a .docx file → import progresses
27. Note created with title from first heading or filename
28. Body content preserved (paragraphs, headings, lists, formatting)
29. Conversion warnings (if any) shown in import summary
30. Original .docx visible in note's Attachments section
31. Click attached .docx → downloads original

### Word import — embedded images
32. .docx with embedded images → images extracted as Attachments
33. Images appear inline in the note where referenced
34. Images visible in Attachments section
35. Image quality preserved

### Conflict handling
36. Import .md with title matching existing note → conflict dialog appears
37. Dialog shows existing note's folder and last updated date
38. "Rename the imported note" → input pre-filled with "(2)" suffix
39. Apply rename → new note saved with new title; both notes exist
40. Apply replace → existing note moved to trash; new note saved with original title
41. Apply skip → no note created; uploaded source (if .docx) cleaned up
42. Cancel → no note created; uploaded source cleaned up

### PDF export — basic
43. Open a note → metadata panel has Actions section
44. Click "Export as PDF" → export dialog opens
45. Page size pre-filled from Locale (A4 for Pakistan)
46. Click Export → progress shown
47. Download begins automatically when ready
48. Generated PDF opens correctly in PDF viewer

### PDF export — content fidelity
49. Note title appears as large heading on first page
50. Headings (H1-H6) render at correct sizes
51. Bold, italic, code render correctly
52. Code blocks have monospace font and subtle background
53. Lists render with proper indentation
54. Tables render with borders and alternating row shading
55. Images embed inline at appropriate size
56. Long content paginates correctly

### PDF export — header and footer
57. Pages 2+ have header with note title and horizontal rule
58. All pages have footer with page number (right) and export date (left)
59. First page has large title, no header
60. Page numbers correct ("Page 3 of 7")

### PDF export — options
61. Change page size to Letter → PDF generated in Letter dimensions
62. Disable "Embed images inline" → images replaced with placeholders
63. Enable "List non-image attachments at end" → appendix appears with attachment list
64. Disable header → no header on subsequent pages
65. Disable footer → no footer

### PDF export — performance
66. Short note (1-2 pages) generates in under 3 seconds
67. Medium note (5-10 pages) generates in under 10 seconds
68. Long note (50 pages with images) generates in under 60 seconds
69. UI shows progress during generation
70. Generated PDF available via signed URL after generation

### PDF storage
71. Generated PDFs go to R2 under `users/{user_id}/exports/`
72. Files auto-delete after 24 hours
73. Re-exporting same note generates new file (doesn't conflict)
74. Audit log records each export

### Markdown export
75. Click "Export as Markdown" (if implemented) → downloads .md file synchronously
76. Filename matches note title (kebab-cased)
77. Content matches the editor's TipTap content converted to markdown
78. Frontmatter included with note metadata

### Edge cases
79. Import empty .md → fails gracefully with "Empty file" message
80. Import .md with malformed frontmatter → frontmatter parsing fails gracefully, content imports without metadata
81. Import .docx with password protection → fails with clear "Password-protected files not supported" message
82. Import .docx with no readable content → "Couldn't extract content from this file"
83. Export note with no content → produces minimal PDF with title only
84. Export when Puppeteer fails → falls back to error message; doesn't crash app
85. Upload file exceeding size limit → rejected at upload time with clear message

### No regressions
86. All existing Notes functionality works (Wave 4a, Wave 4 Refinement)
87. Drive sync continues to work for new imported notes
88. Reference picker (`[[`) finds imported notes
89. Search finds imported note content
90. Attachments work correctly on imported notes

When all 90 verification steps pass, this CR is complete.

---

## 8. Rules of engagement

### 8.1 Conversion is best-effort, not lossless

Document conversion is inherently lossy in some cases. Don't promise perfect fidelity. The CR's job is to produce useful output that captures the content; the user is responsible for cleanup of edge cases.

When conversion warnings exist (Mammoth flagging issues, frontmatter not parsing, etc.), surface them honestly. Better to say "2 footnotes converted to inline references" than to silently lose footnotes.

### 8.2 Original files preserved for .docx imports

Never lose the user's original `.docx` file. It's preserved as an Attachment so they can always reference back. If the conversion misses something critical, the user can re-extract from the original.

For `.md` imports, no separate file is preserved (the markdown content IS the note), but the source_metadata field records what was detected (frontmatter, format type, etc.).

### 8.3 Server-side everything

All conversion logic runs server-side. Don't try to optimize by doing parts client-side — consistency of behavior matters more than slightly faster client experience. Client uploads raw file; server does the work; client receives the result.

### 8.4 PDF export uses Stratum tokens

The exported PDF should look like an Atlas note. Use the same fonts, sizes, colors (in print-appropriate ways). Don't fall back to generic print styling. The user should see the PDF and recognize it as an Atlas export.

The Stratum compliance work in earlier CRs makes this easier — tokens are consistent, can be referenced from print CSS.

### 8.5 Conflict resolution is always user-decided

Never auto-resolve conflicts. Even if the existing note seems "older and unimportant," the user might genuinely want it. Ask every time.

The only exception: if the existing note is in trash (deleted_at is set), no conflict exists — the new note can use the same title. Document this behavior.

### 8.6 Don't rebuild the editor

The TipTap editor exists from Wave 4a. Imports produce TipTap JSON; the editor renders it. Don't introduce a parallel editing surface or rendering path. One editor, multiple input formats.

### 8.7 PDF generation must not block API requests

Use the existing job runner for PDF generation. The export endpoint enqueues; the client polls for status. Generating a PDF inline would tie up server resources for 5-30 seconds per request — unacceptable for a multi-user system.

### 8.8 Notion image URL warning is informational, not blocking

The CR detects Notion CDN images and warns the user. Don't try to download and re-host them automatically — that's a separate feature with its own complexity (auth, copyright, large files). Just warn so the user knows their images may break later.

---

## 9. Recommended Build Sequence

**Phase 1: Infrastructure (1-2 days)**

1. Install conversion dependencies (Mammoth, marked, gray-matter, @tiptap/html, Puppeteer)
2. Create `convert.ts` tRPC router with stubs
3. File upload handling to R2 (under `imports/` prefix)
4. Audit log additions

**Phase 2: Markdown import core (2-3 days)**

5. Markdown-to-TipTap conversion pipeline
6. Frontmatter extraction (gray-matter)
7. Metadata mapping (title, tags, dates)
8. Conflict detection
9. Conflict resolution dialog and flow

**Phase 3: Notion and Claude special handling (1-1.5 days)**

10. Format detector (Notion patterns, Claude conversation patterns)
11. Notion-specific adaptations (header stripping, internal link handling)
12. Claude conversation choice dialog (single note / Claude only / plain)

**Phase 4: Word import (2-3 days)**

13. Mammoth integration
14. Image extraction as Attachments
15. Original .docx preservation as Attachment
16. Conversion warning surfacing

**Phase 5: PDF export — content rendering (3-4 days)**

17. TipTap → HTML conversion
18. Stratum print CSS (typography, spacing, colors)
19. Header and footer templates
20. Tables, code blocks, images rendering correctly
21. Page break handling for long content

**Phase 6: PDF export — generation pipeline (1-2 days)**

22. Puppeteer integration
23. Background job for generation
24. R2 storage with TTL lifecycle rule
25. Progress polling endpoint
26. Signed URL delivery

**Phase 7: UI integration (1-2 days)**

27. "+ New note" dropdown with import options
28. File pickers for .md and .docx
29. Import progress dialog
30. Export PDF dialog with options
31. Actions section in note metadata panel

**Phase 8: Verification and polish (1-2 days)**

32. All 90 verification steps
33. Cleanup job for orphaned uploads
34. Rate limiting middleware
35. Error message polish

---

## 10. What is NOT in this CR

**Wave 4c territory (or later):**
- Bulk import (folder of .md files, ZIP archives, multiple files at once)
- PDF import (text extraction from PDF, low quality, defer)
- HTML import
- Roam / Obsidian / Bear export format-specific handling beyond Notion
- Two-way sync (Drive .md edits flowing back into Atlas)
- Template-based PDF exports (custom branding, watermarks, etc.)

**Phase 2 territory:**
- Auto-download Notion CDN images during import
- Image optimization on upload
- OCR for image-based PDF imports
- Conversion to formats beyond PDF (.epub, .html, etc.)
- Bulk export (export all notes as a zip)

**Permanently excluded:**
- Importing files via direct paste of content (use the editor for that)
- Realtime collaborative import (multiple users importing simultaneously into same note)

If you find yourself building any of these, stop.

---

## 11. Final note

This CR completes Atlas's content portability story. With these three operations, users can:

- Bring existing knowledge into Atlas (markdown from Notion or Claude, Word documents)
- Take Atlas content out for sharing or archival (PDF export)
- Trust that nothing is locked in (Drive sync exports already, PDF export adds another path)

The Notion-specific handling and Claude conversation handling are small but meaningful — those are your stated content sources, and treating them as first-class formats vs. generic markdown reduces import friction.

PDF export with Stratum typography is the surface where your design system meets external sharing. Done well, exported PDFs become part of the brand experience: family or friends who receive an Atlas-exported PDF see consistent, recognizable typography that signals quality.

The deliberate exclusions — PDF import, bulk import, two-way sync — keep this CR focused. Each excluded feature has its own complexity story and benefits from real-use feedback before scoping. Better to ship single-file conversion well than to half-build everything at once.

Begin with section 9, Phase 1.
