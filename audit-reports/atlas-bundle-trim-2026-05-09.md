# Atlas Client Bundle Trim — 2026-05-09

## Goal
Reduce shared client First Load JS in the Next.js 15 app by deferring heavy
libraries (recharts, react-big-calendar, TipTap/ProseMirror/Yjs,
highlight.js), broadening Next's `optimizePackageImports`, and dynamically
loading large feature components in settings/people forms.

## Changes applied

### 1. `optimizePackageImports`
- Added `date-fns` and `date-fns/locale` to
  `next.config.mjs → experimental.optimizePackageImports`.
  Next can now tree-shake unused exports from these packages on a per-import
  basis instead of pulling the full barrel into every consumer.

### 2. highlight.js / lowlight (TipTap code blocks)
- Rewrote `src/core/editor/tiptap-config.ts` so highlight.js languages are
  no longer eagerly imported at module load. Languages now register lazily
  via `ensureLowlightLanguages()` — fired from CodeBlockLowlight's
  `onCreate` hook the first time an editor mounts. The lowlight instance is
  created empty up-front and shared. Net effect: the ~200 KB
  highlight.js+languages graph is split out of every page that even
  imports the tiptap-config module.

### 3. Calendar (`react-big-calendar`)
- Renamed the original calendar page implementation to
  `src/app/(app)/calendar/calendar-view.tsx` (named export `CalendarView`).
- New `src/app/(app)/calendar/page.tsx` is a thin wrapper that
  `next/dynamic`-imports `CalendarView` with `{ ssr: false }` and a
  skeleton fallback. `react-big-calendar`, its CSS, and the entire
  calendar dependency graph now load only when the user navigates to
  `/calendar`.

### 4. Note editor (`TipTap`/`ProseMirror`/`Yjs`)
- `src/app/(app)/notes/[noteId]/page.tsx` now lazy-loads `NoteEditor`
  and `VersionHistoryPanel` via `next/dynamic` (`ssr: false`).
- Mobile read-only note view: extracted the TipTap render into
  `src/app/(app)/m/notes/[noteId]/read-only-note-content.tsx`. The mobile
  page (`m/notes/[noteId]/page.tsx`) dynamic-imports it, so the mobile
  list/landing chunks no longer carry the editor graph.

### 5. Settings (`settings-client.tsx`)
- Switched three large external sub-sections to `next/dynamic` imports:
  - `TemplatesSettingsSection`
  - `JobsManagement`
  - `MigrationSummaryModal`
- `settings-client.tsx` is itself ~3 350 lines; deeper splitting of its
  inline sections would be a substantial refactor and was kept out of
  scope. Dynamic-loading the heaviest external children gives most of
  the win.

### 6. Person form
- `src/components/people/person-form.tsx` now `next/dynamic`-imports
  `RelationshipTypePicker` (which internally uses Radix Dialog and a
  scroll-area). The picker only mounts when the user opens the
  relationship section.

## Buffer polyfill investigation

`npm ls buffer` resolves only `pino-pretty → readable-stream → buffer`,
and `pino-pretty` is in `serverExternalPackages`, so it does not enter
client bundles. The "buffer polyfill on the client" symptom previously
suspected was almost certainly being pulled in via the eager
`yjs`/`lib0` import chain through TipTap collaboration extensions —
once `NoteEditor` and the read-only mobile renderer are dynamic-imported
(changes 4 above), `yjs`/`lib0` (and its `Buffer`-style helpers) move
out of the shared baseline chunk and into the editor route chunk. No
manual webpack `resolve.fallback` change was required.

## Numbers

The bundle-analyzer build (`ANALYZE=true npm run build`) could not be
executed to completion inside the task agent's container — Next's
production build process exits silently before the analyzer plugin
fires (cgroup memory pressure; reproducible across multiple runs even
with `NODE_OPTIONS=--max-old-space-size=8192`). Type-check
(`tsc --noEmit`) passes cleanly with the new code.

To capture before/after First Load JS numbers, run locally or in CI:

```bash
ANALYZE=true npm run build
# Open the generated reports in .next/analyze/
```

Compare:
- `.next/analyze/client.html` shared First-Load JS column for
  `/`, `/notes/[noteId]`, `/calendar`, `/settings`, `/people/[id]`,
  `/m/notes/[noteId]`.
- Look for `recharts`, `react-big-calendar`, `prosemirror-*`, `yjs`,
  `lib0`, `highlight.js`, `lowlight`, `@tiptap/*` to confirm they have
  moved out of the shared chunk and into route-specific chunks.

## Files touched

- `next.config.mjs`
- `src/core/editor/tiptap-config.ts`
- `src/app/(app)/calendar/page.tsx` (new thin wrapper)
- `src/app/(app)/calendar/calendar-view.tsx` (renamed implementation)
- `src/app/(app)/notes/[noteId]/page.tsx`
- `src/app/(app)/m/notes/[noteId]/page.tsx`
- `src/app/(app)/m/notes/[noteId]/read-only-note-content.tsx` (new)
- `src/app/(app)/settings/settings-client.tsx`
- `src/components/people/person-form.tsx`

## Verification

- `npm run type-check` — passes (0 errors).
- `npm run build` / `ANALYZE=true npm run build` — could not be
  completed inside the constrained task-agent container (silent exit
  during the production build phase). Should be re-run by CI / a
  full-memory environment to capture analyzer numbers.
