# Atlas Codebase Audit — 2026-05-07

## Executive Summary

**Codebase:** ~95 400 lines TypeScript/TSX · 1 351-line Prisma schema · 33 tRPC routers · 9 pg-boss jobs  
**Audit date:** 2026-05-07  
**Phase A changes:** dependency bumps (patch + safe minor), Prettier formatting pass, 25+ unused-import and dead-code removals — all committed before this report was written. Test baseline held at **318 passing / 33 pre-existing failures** throughout.

### Finding counts by severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 4 |
| Medium | 17 |
| Low | 26 |
| Info | 12 |
| **Total** | **59** |

### Top 3 priorities

1. **[H-SEC-1] No rate limit on `/api/help/chat`** — Any logged-in user can drive unbounded Anthropic API costs through this endpoint; conversely, chat AI calls are not routed through the shared cost-logging wrapper so spend goes untracked.
2. **[H-SEC-2] No global HTTP security headers** — The application has no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Referrer-Policy` headers. This is a baseline web-security gap.
3. **[H-DEP-1] `expr-eval` — high-severity vulnerability, no upstream fix** — The `expr-eval` package is flagged by npm audit as high severity and is unmaintained. It requires active replacement.

### Suggested follow-up work packages

| Work package | Effort | Risk |
|---|---|---|
| Security hardening sprint (HTTP headers, pino redact, help/chat rate limit) | M | Low |
| Search performance sprint (trigram indexes, Note FTS trigger) | L | Low |
| Dependency surgery (expr-eval replacement, Prisma 7 upgrade planning) | L | Medium |
| Type safety hardening (remove `as any` in table components, widen Prisma User type) | S | Low |
| Test coverage sprint (fix 4 failing test files, add router-level tests) | M | Low |
| Stratum compliance round (title= → Hint migration, raw hex → Stratum token) | M | Low |

---

## Phase A Summary

### Dependency hygiene (applied)

| Package | Before | After | Change type |
|---|---|---|---|
| `@next/bundle-analyzer` | 16.2.0 | 16.2.5 | patch |
| `@tanstack/react-query` | 5.74.4 | 5.100.9 | minor |
| `@typescript-eslint/*` | 8.19.x | 8.59.2 | minor |
| `@trpc/*` | 11.16.x | 11.17.0 | patch |
| `chrono-node` | 2.7.x | 2.9.1 | minor |
| `libphonenumber-js` | 1.11.x | 1.12.43 | minor |
| `postcss` | 8.4.x | 8.5.14 | patch |
| `react` / `react-dom` | 19.0.0 | 19.2.6 | patch |
| `react-hook-form` | 7.54.x | 7.75.0 | minor |
| `zustand` | 5.0.2 | 5.0.13 | patch |
| `eslint-config-next` | 15.5.15 | 15.5.16 | patch |

### Code hygiene (applied)

- Removed 25+ unused imports across `src/` (see commit for full list)
- Removed dead `TypeRow` function in `project-type-picker.tsx`
- Removed dead `enforcePrimary` function in `people.ts`
- Removed dead `navigateToSubtask` variable in `task-inspector.tsx`
- Removed dead `blockSplit`/`inlinePattern` in `md-import-claude.ts`
- Removed unused `todayStart` destructure in `tasks.ts`
- Prettier formatting pass ran across `src/**/*.{ts,tsx}`
- TypeScript `--noUnusedLocals` check: **0 errors** in production code after Phase A

### Items intentionally skipped (require `--force` or are major versions)

- `expr-eval` high-severity — no fix available without replacement (→ H-DEP-1)
- `elliptic` via Storybook — fix requires Storybook major downgrade (→ M-DEP-3)
- `esbuild <0.25` via Vitest — fix requires Vitest v3 major upgrade (→ M-DEP-4)
- `@tootallnate/once` via `@replit/object-storage` — upstream SDK fix required (→ L-DEP-5)
- All major version upgrades (Next.js 16, Prisma 7, Zod 4, Tailwind 4, TypeScript 6, Vitest 4) — flagged below

---

## Findings

Each finding is formatted as:

> **ID · Title**  
> Severity · Location · Effort · Risk

---

### 5.1 Code Organization

---

**CO-1 · Repeated soft-delete user-scoping pattern (137 occurrences)**  
**Severity:** Low · **Location:** `src/server/routers/*.ts` (all 33 routers) · **Effort:** M · **Risk:** Low

**Description:** The clause `{ user_id: ctx.user.id, deleted_at: null }` appears verbatim 137 times across the router layer. If the soft-delete convention changes (e.g., adding a `purge_at` field), every occurrence must be updated manually.

**Recommendation:** Extract a `userOwned(userId: string, extra?: Prisma.XxxWhereInput)` helper modelled on the existing `withDeleted()` helper in `src/core/db/soft-delete.ts`. Replace the 137 occurrences incrementally.

---

**CO-2 · Oversized files approaching maintenance threshold**  
**Severity:** Low · **Location:** `src/app/(app)/settings/settings-client.tsx` (2 700+ lines), `src/server/routers/tasks.ts` (2 115 lines) · **Effort:** L · **Risk:** Low

**Description:** Both files are well above the 500-line guideline in the task spec. `settings-client.tsx` contains at least 5 conceptually distinct sections (billing, AI usage, integrations, account, danger zone) that could be standalone components.

**Recommendation:** Split `settings-client.tsx` into section sub-components. Split `tasks.ts` router into `tasks-list.ts`, `tasks-mutate.ts`, and `tasks-search.ts` sub-routers merged into a parent.

---

**CO-3 · Magic numbers — position arithmetic uses bare `1024` in 6 routers**  
**Severity:** Info · **Location:** `src/server/routers/folders.ts:225-226`, `src/server/routers/checklist.ts:9,118,122`, `src/server/routers/contexts.ts:47-48`, `src/server/routers/projects.ts:595-596`, `src/server/routers/task-templates.ts:13,156,251` · **Effort:** S · **Risk:** Low

**Description:** The fractional-indexing step size `1024` is inlined in 6 routers. No named constant documents its purpose.

**Recommendation:** Export `const POSITION_STEP = new Prisma.Decimal(1024)` from `src/core/db/index.ts` and replace all occurrences.

---

**CO-4 · `0.0005` AI cost estimate hardcoded in two places**  
**Severity:** Info · **Location:** `src/server/routers/capture.ts:460,644` · **Effort:** S · **Risk:** Low

**Description:** The per-capture AI cost estimate `0.0005` (USD) is inlined twice. If the model or pricing changes, both must be updated by hand.

**Recommendation:** Extract `const ESTIMATED_COST_PER_CAPTURE_USD = 0.0005` as a named constant in `src/core/ai/index.ts`.

---

**CO-5 · `pino-pretty` in `dependencies` instead of `devDependencies`**  
**Severity:** Low · **Location:** `package.json` · **Effort:** S · **Risk:** Low

**Description:** `pino-pretty` is used only in the development logger transport (guarded by `NODE_ENV !== 'production'`). It is listed in `dependencies`, adding unnecessary production bundle weight.

**Recommendation:** Move `pino-pretty` to `devDependencies`. Confirm the production build does not bundle it (it is listed in `serverExternalPackages` in `next.config.mjs`, so the risk is minimal, but the classification is still incorrect).

---

### 5.2 Speed Optimization

---

**SO-1 · Note FTS computed at query time — no GIN index**  
**Severity:** Medium · **Location:** `src/server/routers/search.ts:127` · **Effort:** M · **Risk:** Low

**Description:** Task FTS uses a trigger-maintained `search_vector` column with a GIN index. Note FTS uses `to_tsvector('english', COALESCE(n.body_text,'') || ' ' || COALESCE(n.title,''))` computed inline at query time with no index. For users with many notes this becomes a full sequential scan.

**Recommendation:** Add a `search_vector` column to the `Note` model, maintain it with a DB trigger mirroring `task_search_vector_trigger`, and add `CREATE INDEX CONCURRENTLY note_search_vector_idx ON "Note" USING GIN(to_tsvector('english', search_vector))`.

---

**SO-2 · ILIKE fallback search runs without trigram index**  
**Severity:** Medium · **Location:** `src/server/routers/search.ts:108-161` (notes), `202-238` (tasks) · **Effort:** M · **Risk:** Low

**Description:** When FTS returns no results, the search router falls back to `ILIKE '%query%'` on `Note.title`, `Note.body_text`, `Task.title`, and `Task.notes`. Without `pg_trgm` trigram indexes these cause full sequential scans.

**Recommendation:** Option A: Enable `CREATE EXTENSION IF NOT EXISTS pg_trgm` and add `GIN` trigram indexes on the four columns. Option B: Remove the ILIKE fallback entirely and rely on FTS only (simpler but changes search behaviour).

---

**SO-3 · In-memory rate limiters reset on every process restart**  
**Severity:** Medium · **Location:** `src/app/api/convert/import/route.ts:22-33`, `src/app/api/convert/export-pdf/route.ts` · **Effort:** M · **Risk:** Low

**Description:** Both rate limiters use a `Map<string, { count; resetAt }>` stored in module memory. In a multi-instance or serverless deployment, each instance has its own independent counter, allowing users to bypass the limit by distributing requests across instances.

**Recommendation:** Move rate limit state to Redis or use Clerk's built-in rate-limit metadata, or use an edge middleware approach that runs before the function boundary.

---

**SO-4 · No connection pool / PgBouncer configuration**  
**Severity:** Low · **Location:** `src/core/db/index.ts`, `DATABASE_URL` env var · **Effort:** S · **Risk:** Low

**Description:** The Prisma client does not set `connection_limit` and there is no PgBouncer connection string. In serverless deployments each cold start opens new connections; under load this exhausts Postgres's max_connections.

**Recommendation:** Append `?connection_limit=5&pool_timeout=10` to `DATABASE_URL` for serverless, or configure PgBouncer in transaction mode and use the pgBouncer connection string.

---

**SO-5 · Bundle analyzer available but `next build` output not captured in this audit**  
**Severity:** Info · **Location:** `next.config.mjs` — `withBundleAnalyzer` configured · **Effort:** S · **Risk:** Low

**Description:** `@next/bundle-analyzer` is wired in. Bundle composition (per-route JS sizes, client-component boundaries) was not captured during this audit because `next build` was not run in the audit environment.

**Recommendation:** Run `ANALYZE=true npm run build` in a clean environment and review the treemap for oversized client bundles. Pay particular attention to TipTap and Radix UI chunks.

---

### 5.3 Query Patterns

---

**QP-1 · ILIKE without trigram indexes (cross-reference SO-2)**  
*See SO-2 above.*

---

**QP-2 · FTS `search_vector` maintained only on Task, not Note (cross-reference SO-1)**  
*See SO-1 above.*

---

**QP-3 · Signed URL expiry hardcoded at 3 600 seconds (1 hour) with no audit**  
**Severity:** Low · **Location:** `src/server/routers/attachments.ts:364,367` · **Effort:** S · **Risk:** Low

**Description:** Attachment signed URLs expire in 3 600 seconds. This is reasonable but is a hardcoded magic number. There is also no logging when a client hits an expired URL, making debugging attachment access failures silent.

**Recommendation:** Extract `const SIGNED_URL_TTL_SECONDS = 3600` as a named constant and add a `log.warn` in the attachment `GET` handler when a 403 is returned by storage.

---

**QP-4 · `capture.ts` router — hard `take: 200` / `take: 100` without cursor**  
**Severity:** Low · **Location:** `src/server/routers/tasks.ts:1763,1775` · **Effort:** S · **Risk:** Low

**Description:** Two internal queries in the tasks router use a hard `take` limit with no cursor. These are used for sidebar counts and not paginated lists, so the risk is bounded, but a user with >200 tasks in a specific state will receive truncated results silently.

**Recommendation:** Add a comment documenting the known limit, or raise and monitor with a counter metric.

---

**QP-5 · `$queryRaw` / `$executeRaw` — all use tagged template literals (safe)**  
**Severity:** Info · **Location:** `src/core/auth/orphan-recovery.ts`, `src/core/auth/backfill.ts`, `src/server/routers/search.ts`, `src/server/routers/trash.ts` · **Effort:** — · **Risk:** —

**Description:** All raw SQL calls in the codebase use Prisma tagged template literals (`` db.$queryRaw`...` `` or with `Prisma.sql`), which parameterize user values correctly. No raw string interpolation into SQL was found. This is a positive finding.

**Recommendation:** None. Continue using tagged templates; prohibit `$queryRawUnsafe` and `$executeRawUnsafe` via ESLint rule if not already done.

---

### 5.4 Dependency Analysis

---

**H-DEP-1 · `expr-eval` — high-severity vulnerability, no upstream fix**  
**Severity:** High · **Location:** `package.json` (direct dependency) · **Effort:** M · **Risk:** Medium

**Description:** `npm audit` reports `expr-eval` as high-severity (GHSA-unknown). The package is unmaintained. No fix is available without replacing the package. It is used for formula evaluation in the tables feature.

**Recommendation:** Replace `expr-eval` with `mathjs` (actively maintained, similar API) or write a narrow inline evaluator covering only the arithmetic operators Atlas uses. Scope: identify all call sites (`grep -r 'expr-eval'`) and write a thin adapter.

---

**M-DEP-2 · `drizzle-zod` — no usage found in source**  
**Severity:** Medium · **Location:** `package.json` · **Effort:** S · **Risk:** Low

**Description:** `depcheck` flagged `drizzle-zod` and a search of `src/` finds zero imports. The package appears to be a leftover from an earlier migration to Prisma.

**Recommendation:** Remove `drizzle-zod` from `package.json` and run `npm install` to update the lockfile.

---

**M-DEP-3 · `elliptic` — moderate vulnerability via Storybook**  
**Severity:** Medium · **Location:** `node_modules/elliptic` via `@storybook/nextjs` · **Effort:** L · **Risk:** Low

**Description:** `npm audit` reports `elliptic` (GHSA-848j-6mx2-7j84) via the Storybook dependency chain. The only safe fix is `@storybook/nextjs@7.6.24`, which is a major downgrade (current: 9.1.20). Not safe to apply.

**Recommendation:** Track Storybook 10.x release; the advisory is expected to be resolved there. In the interim, Storybook runs only in development — production is not affected.

---

**M-DEP-4 · `esbuild <0.25` — vulnerability via Vitest**  
**Severity:** Medium · **Location:** `node_modules/esbuild` via `vitest@2.1.9` · **Effort:** L · **Risk:** Low

**Description:** GHSA-67mh-4wv8-2f99 affects `esbuild <0.25.0`. The fix requires Vitest v3+ which is a major version upgrade with breaking changes to the test API.

**Recommendation:** Plan a Vitest v3 upgrade sprint once Storybook 10 is adopted (both are major upgrades that should be batched).

---

**L-DEP-5 · `@tootallnate/once` / `teeny-request` — low/moderate via `@replit/object-storage`**  
**Severity:** Low · **Location:** `node_modules/@replit/object-storage` (transitive) · **Effort:** — · **Risk:** Low

**Description:** The Replit Object Storage SDK transitively depends on vulnerable versions of `@google-cloud/storage → teeny-request → @tootallnate/once`. No fix is available without an upstream SDK update.

**Recommendation:** File an issue with Replit requesting an Object Storage SDK update. No action required until Replit publishes a fix.

---

**L-DEP-6 · Major version upgrade opportunities (tracking)**  
**Severity:** Low · **Location:** `package.json` · **Effort:** XL · **Risk:** High

**Description:** Several major version upgrades are available with documented performance or security improvements:

| Package | Current | Latest | Key improvement |
|---|---|---|---|
| `next` | 15.5.16 | 16.2.5 | Improved React Server Components, perf |
| `prisma` / `@prisma/client` | 5.22.0 | 7.8.0 | Query engine rewrite, breaking migration API |
| `zod` | 3.25.76 | 4.4.3 | Breaking API — v4 migration guide required |
| `tailwindcss` | 3.4.19 | 4.2.4 | CSS-native engine — config format changed |
| `vitest` | 2.1.9 | 4.1.5 | Also resolves esbuild vuln |
| `typescript` | 5.9.3 | 6.0.3 | Stricter defaults |
| `lucide-react` | 0.469.0 | 1.14.0 | Major — icon name changes |
| `@hookform/resolvers` | 3.10.0 | 5.2.2 | Must match react-hook-form major |
| `pino` | 9.14.0 | 10.3.1 | Transport API changes |
| `sonner` | 1.7.4 | 2.0.7 | Breaking toast API changes |

**Recommendation:** Do not apply these as a batch. Plan individual upgrade sprints in dependency order: Vitest → Prisma → Tailwind → Next.js. Each sprint should include a full test run.

---

**L-DEP-7 · `@anthropic-ai/sdk` minor lag (0.91 → 0.95)**  
**Severity:** Low · **Location:** `package.json` · **Effort:** S · **Risk:** Low

**Description:** The Anthropic SDK is 4 minor versions behind (0.91.1 vs 0.95.0). The changelog shows no breaking changes.

**Recommendation:** Apply `npm install @anthropic-ai/sdk@^0.95.0` and run tests.

---

**L-DEP-8 · `@aws-sdk/client-s3` minor lag (3.1038 → 3.1044)**  
**Severity:** Low · **Location:** `package.json` · **Effort:** S · **Risk:** Low

**Description:** Two minor versions behind; no breaking changes expected.

**Recommendation:** Apply `npm install @aws-sdk/client-s3@3.1044.0 @aws-sdk/s3-request-presigner@3.1044.0`.

---

### 5.5 Library Updates

*See 5.4 (Dependency Analysis) above — library update findings are consolidated there to avoid duplication.*

**LU-1 · No automated dependency update tooling (Renovate / Dependabot)**  
**Severity:** Low · **Location:** Repository root (no `.github/dependabot.yml` or `renovate.json`) · **Effort:** S · **Risk:** Low

**Description:** There is no automated PR generation for dependency updates. The current state was discovered only on manual audit.

**Recommendation:** Add a `renovate.json` with `"extends": ["config:recommended"]` and configure weekly minor/patch auto-merge for test-green PRs.

---

### 5.6 Stratum Compliance

---

**SC-1 · Raw `title=` attributes instead of `<Hint>` (47+ occurrences)**  
**Severity:** Medium · **Location:** Multiple components — representative sample below · **Effort:** M · **Risk:** Low

**Description:** The codebase has a `<Hint>` component for consistent, accessible tooltips. Interactive icon buttons in at least 47 locations use raw HTML `title="..."` instead. Native `title` tooltips are inaccessible on touch devices and ignore the design system delay/styling.

Representative locations:

| File | Line | Content |
|---|---|---|
| `src/components/shell/app-shell-provider.tsx` | 165 | `title="Inspector"` |
| `src/components/tasks/worklog-entry.tsx` | 69, 85 | `title="Edit"`, `title="Delete"` |
| `src/components/tasks/task-inspector-attachments.tsx` | 105, 114, 121, 132 | View / Download / Detach / Remove |
| `src/components/tasks/folder-detail-view.tsx` | 311, 553 | rename, move |
| `src/components/tasks/someday-perspective.tsx` | 104 | `title="Promote to active"` |
| `src/components/tasks/waiting-for-perspective.tsx` | 103, 114, 125 | Mark received / Record follow-up / Convert |
| `src/components/tasks/task-inspector.tsx` | 155, 187 | Block time, View on calendar |
| `src/components/tasks/task-list.tsx` | 767 | `title="Keyboard shortcuts (?)"` |
| `src/components/tasks/task-row-quick-actions.tsx` | 280, 432 | Move to project, More actions |
| `src/components/media/media-filters.tsx` | 117 | `title="From date"` |

**Recommendation:** Run a global replace: for each `title="X"` on an interactive element, wrap the element in `<Hint label="X">...</Hint>`. This can be done incrementally per component. Start with the task inspector which has the highest user surface area.

---

**SC-2 · Hardcoded hex color values in component data arrays**  
**Severity:** Medium · **Location:** `src/components/notes/editor-block-menu.tsx:31-36`, `src/components/notes/editor-bubble-menu.tsx:99-116` · **Effort:** M · **Risk:** Low

**Description:** The note editor block and bubble menus define highlight/text-color palettes using hardcoded hex values:

```
// editor-block-menu.tsx
{ label: "Yellow", value: "#fef08a" },
{ label: "Green",  value: "#bbf7d0" },
{ label: "Blue",   value: "#bfdbfe" },
{ label: "Pink",   value: "#fbcfe8" },
{ label: "Orange", value: "#fed7aa" },
{ label: "Purple", value: "#e9d5ff" },
```

These are stored in TipTap output and will not respond to theme changes. They are duplicated across `editor-block-menu.tsx` and `editor-bubble-menu.tsx`.

**Recommendation:** Extract a shared `NOTE_HIGHLIGHT_COLORS` constant in `src/core/notes/colors.ts` and reference it from both menu files. For long-term theming, map each label to a CSS custom property (e.g. `var(--note-highlight-yellow)`).

---

**SC-3 · `project-add-form.tsx` — inline style with hardcoded hex**  
**Severity:** Low · **Location:** `src/components/tasks/project-add-form.tsx:119` · **Effort:** S · **Risk:** Low

**Description:**
```tsx
style={{ backgroundColor: c === "amber" ? "#d97706" : c }}
```
The amber exception hard-codes a hex value. Tailwind amber-600 (`#d97706`) is the implied intent.

**Recommendation:** Replace with `c === "amber" ? "rgb(217 119 6)" : c` or map the color palette to CSS variables.

---

**SC-4 · Admin orphan detail page uses raw dark-mode hex backgrounds**  
**Severity:** Low · **Location:** `src/app/admin/orphans/[id]/orphan-detail-client.tsx:39,87` · **Effort:** S · **Risk:** Low

**Description:**
```tsx
<div className="… bg-[#111] …">
```
Two panels use `bg-[#111]` and `border-white/20` instead of Stratum surface tokens (`bg-surface-overlay`, `border-border-subtle`).

**Recommendation:** Replace with Stratum surface tokens.

---

**SC-5 · `context-management.tsx` — color options use raw Tailwind palette classes**  
**Severity:** Low · **Location:** `src/components/tasks/context-management.tsx:34-46` · **Effort:** S · **Risk:** Low

**Description:** Context colour options are defined as `{ value: "red", cls: "bg-red-500" }` etc. (8 colours using raw Tailwind palette classes). These bypass Stratum and will not invert in a future dark/light theme swap.

**Recommendation:** Map to Stratum `viz-*` tokens or define a dedicated context color palette in `tailwind.config.ts`.

---

**SC-6 · `request-access-form.tsx` — raw `text-red-500` / `border-red-500` for validation errors**  
**Severity:** Low · **Location:** `src/components/homepage/request-access-form.tsx:98,103,130,135,161` · **Effort:** S · **Risk:** Low

**Description:** Validation error states use `text-red-500` and `border-red-500` rather than the Stratum danger token (`text-accent-danger`, `border-border-error`).

**Recommendation:** Replace with Stratum tokens.

---

### 5.7 Type Safety

---

**TS-1 · `as any` cast on entire tRPC mutation hook (3 locations)**  
**Severity:** Medium · **Location:** `src/app/(app)/capture/saved/saved-client.tsx:40`, `src/components/tables/table-grid.tsx:129,166` · **Effort:** S · **Risk:** Low

**Description:** Three tRPC mutation hooks are cast to `any` to work around TypeScript inference depth limits (TS2589). Casting the entire hook to `any` removes all type safety for the mutation's input, output, and error.

```ts
// table-grid.tsx:129
const upsertCell = (trpc.tables.upsertCell as any).useMutation({...})
```

**Recommendation:** Cast only to the specific inferred type with a narrower assertion, or use `// @ts-expect-error TS2589` with an explanatory comment (consistent with the pattern at `calendar/page.tsx:230`). This preserves the type at the call site.

---

**TS-2 · `User` type missing `ai_budget_usd` field (2 `as any` casts)**  
**Severity:** Medium · **Location:** `src/app/(app)/settings/settings-client.tsx:2106,2112` · **Effort:** S · **Risk:** Low

**Description:**
```ts
const v = (userData as (User & { ai_budget_usd?: number | null }) | undefined)?.ai_budget_usd;
```
The `User` Prisma type does not include `ai_budget_usd` so the code uses an intersection type cast. The field exists in the schema.

**Recommendation:** Add `ai_budget_usd` to the Prisma `User` select in the user router query so it is returned in the type, removing the need for the cast.

---

**TS-3 · `@ts-ignore` / `@ts-expect-error` suppressions (4 occurrences) — all documented**  
**Severity:** Low · **Location:** `src/app/(app)/calendar/page.tsx:230`, `src/app/(app)/settings/settings-client.tsx:2662`, `src/components/tables/table-grid.tsx:149,166` · **Effort:** — · **Risk:** Low

**Description:** All 4 suppressions are annotated with `// TS2589: tRPC type inference depth; safe at runtime`. The root cause is a known tRPC v11 inference depth limitation.

**Recommendation:** Track tRPC's upstream issue. Remove suppressions when the tRPC team resolves the depth limit. No immediate action needed.

---

**TS-4 · `JSON.parse` without Zod validation (18 occurrences)**  
**Severity:** Medium · **Location:** Various — representative locations: `src/core/drive/sync-notes.ts`, `src/core/capture/inbox-migration.ts`, `src/app/api/email/inbound/route.ts` · **Effort:** M · **Risk:** Low

**Description:** There are approximately 18 `JSON.parse(...)` calls in production code that cast the result directly to a typed interface without runtime validation. For data from external sources (webhooks, external APIs, stored blobs) this risks runtime crashes on unexpected shapes.

**Recommendation:** Prioritise wrapping the email inbound webhook payload and any Drive API response parsing with `.safeParse()`. Internal DB round-trip JSON (e.g., `parser_proposal`) may use `z.parse()` with a hard throw since the shape is controlled.

---

**TS-5 · Missing explicit return types on exported functions (non-trivial cases)**  
**Severity:** Info · **Location:** Multiple `src/app/api/*/route.ts` files and `src/components/ui/*.tsx` · **Effort:** S · **Risk:** Low

**Description:** Several exported functions in UI components and API route handlers lack explicit return type annotations. TypeScript infers them correctly but the annotations aid documentation and catch drift when the return shape changes.

**Recommendation:** Add return types to the highest-visibility exported functions first: API route handlers (`Promise<NextResponse>`) and public component props type extractors.

---

**TS-6 · Table component uses `columns as any` / `rows as any` (typing gap)**  
**Severity:** Medium · **Location:** `src/app/(app)/notes/tables/[tableId]/page.tsx:398-399`, `src/components/tables/table-side-panel.tsx:86-87` · **Effort:** M · **Risk:** Low

**Description:** The table grid component accepts `columns` and `rows` props that are cast to `any` at call sites because the generic type is not threaded through correctly. This removes compile-time checking for the table data contract.

**Recommendation:** Add proper generic type parameters to the `TableGrid` and `TableSidePanel` component interfaces so the `columns` / `rows` shapes are strongly typed end-to-end.

---

### 5.8 Test Coverage

---

**TC-1 · 4 pre-existing test file failures (33 tests failing)**  
**Severity:** High · **Location:** `src/components/tasks/__tests__/task-list.test.tsx`, `src/components/tasks/__tests__/task-inspector.test.tsx`, and 2 capture service test files · **Effort:** M · **Risk:** Low

**Description:** 33 tests across 4 files fail on every run. These are pre-existing failures not caused by Phase A changes. Causes:
- `task-list.test.tsx` — jsdom does not implement `DataTransfer` for drag events
- `task-inspector.test.tsx` — tRPC mock setup missing for `tasks.update`
- Capture service tests — AI mock import resolution issues

**Recommendation:** Fix in priority order: (1) add a `DataTransfer` polyfill in the vitest setup file; (2) update the tRPC mock in the task inspector test; (3) fix the capture service AI mock path.

---

**TC-2 · 25 of 33 tRPC routers have no integration test coverage**  
**Severity:** Medium · **Location:** `src/server/routers/*.ts` · **Effort:** L · **Risk:** Medium

**Description:** The codebase has 8 integration test files in `src/server/routers/__tests__/` covering: `capture` (wave 1 paths), `csv-import`, `embed` (wave 4c), `note-versioning`, `projects`, `tables-formula`, `task-templates`, and `today-forecast`. Combined they are 3 238 lines and run against a real database. This is positive.

However, 25 routers have no integration coverage, including several high-risk paths: `tasks.ts` (core CRUD), `search.ts` (ILIKE + FTS), `notes.ts`, `attachments.ts`, `drive.ts`, `admin.ts`, `trash.ts`, `people.ts`, `calendar.ts`, `emails.ts`, and others.

**Recommendation:** Prioritise integration tests for the uncovered high-risk routers: `tasks.ts` (core CRUD and perspective filtering), `search.ts` (ILIKE + FTS logic), and `notes.ts` (note CRUD and versioning beyond the current snapshot test).

---

**TC-3 · Zero test coverage for background job handlers**  
**Severity:** Medium · **Location:** `src/core/jobs/handlers/*.ts` · **Effort:** M · **Risk:** Medium

**Description:** All 9 job handlers have no tests. Drive sync, trash retention, and orphan recovery are business-critical but completely untested.

**Recommendation:** Add unit tests for at least `trash-retention.ts` (simplest handler) and `attachment-cleanup.ts` using mocked Prisma client and mocked storage.

---

**TC-4 · E2E test suite exists (Playwright) but covers only 6 journeys — attachment, search, and AI-parse flows missing**  
**Severity:** Low · **Location:** `e2e/*.e2e.mjs` (8 scripts) · **Effort:** M · **Risk:** Low

**Description:** A Playwright-based E2E suite exists in `e2e/` with 8 test scripts: `task-list`, `task-complete`, `quick-capture`, `project-context`, `sign-out`, `forecast`, `task-inspector`, and `tag-management`. The suite uses a test-login endpoint (`/api/auth/test-login`) for CI authentication. This is a positive finding.

Coverage gaps: attachment upload flow, note creation and rich-text editing, search (type → see results → navigate), and the AI-assisted capture parse path are not covered by E2E tests.

**Recommendation:** Add E2E scripts for: (1) note creation with rich-text content, (2) file attachment upload and preview, (3) global search navigation.

---

**TC-5 · Test suite run time is acceptable; no slow outliers observed**  
**Severity:** Info · **Location:** `vitest.config.ts` · **Effort:** — · **Risk:** —

**Description:** The 19 test files complete in ~18 seconds including environment setup. No individual test exceeds 1.3 seconds. Parallelisation is configured via vitest defaults. This is a positive finding.

---

**TC-6 · Coverage metrics not captured (runtime data gap)**  
**Severity:** Info · **Location:** — · **Effort:** — · **Risk:** —

**Description:** `vitest --coverage` was not run during this audit because it requires the full test suite to pass. Per-module coverage percentages are therefore not available.

**Recommendation:** Fix TC-1 first, then run `npx vitest run --coverage` and review the HTML report for untested modules.

---

### 5.9 Security

---

**H-SEC-1 · No rate limit on `/api/help/chat` — unbounded AI cost exposure**  
**Severity:** High · **Location:** `src/app/api/help/chat/route.ts` · **Effort:** S · **Risk:** Medium

**Description:** The help chat endpoint authenticates via Clerk but applies no per-user request rate limit. Every request creates an Anthropic API call with up to 1 024 output tokens. The endpoint also uses a direct `new Anthropic()` client not routed through `src/core/ai/index.ts`, so calls are invisible to the cost dashboard and do not count against per-user budgets.

Additionally, the `messages` array is accepted without truncation — a user can replay a long conversation history on every request, significantly increasing token consumption.

**Recommendation:**
1. Add a rate limiter matching the pattern in `src/app/api/convert/import/route.ts` (20 req/min per user).
2. Truncate `messages` to the last 20 turns before sending to Anthropic.
3. Route the Anthropic call through `callAI()` in `src/core/ai/index.ts` to log cost.

---

**H-SEC-2 · No global HTTP security headers**  
**Severity:** High · **Location:** `next.config.mjs` (headers function only sets `Cache-Control` on `/api/*`) · **Effort:** S · **Risk:** Low

**Description:** The application has no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security` headers. The only CSP present is scoped to `/api/embed/gist`. Absence of `X-Frame-Options` allows clickjacking; absence of `X-Content-Type-Options` allows MIME sniffing.

**Recommendation:** Add to `next.config.mjs` `headers()` function for all routes:
```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```
CSP with `script-src` requires nonce-based setup (a larger sprint) — flag for a dedicated security sprint after the baseline headers are in place.

---

**M-SEC-3 · Pino logger has no `redact` configuration**  
**Severity:** Medium · **Location:** `src/core/logging/index.ts` · **Effort:** S · **Risk:** Medium

**Description:** The `pino` logger is created without a `redact` array. If any log call includes a structured object containing `access_token`, `refresh_token`, `password`, or an authorization header (e.g., `log.error({ err, req })` patterns), those values appear in plaintext in production logs.

**Recommendation:** Add:
```ts
redact: ['access_token', 'refresh_token', 'token', 'password', 'req.headers.authorization']
```
to the pino options object.

---

**M-SEC-4 · SVG uploads allowed without magic-byte server validation**  
**Severity:** Medium · **Location:** `src/core/attachments/validators.ts` · **Effort:** M · **Risk:** Medium

**Description:** `image/svg+xml` is in the MIME allowlist. SVG validation uses the browser-supplied `file.type` string, which can be spoofed. A malicious user could upload an SVG containing `<script>` tags. If the signed URL is later opened directly (not embedded), script execution occurs in the storage domain context.

**Recommendation:** Inspect the first 512 bytes server-side for SVG uploads: if the file contains `<script`, `javascript:`, or `on*=` event handler attributes, reject it. Consider using the `sanitize-svg` package or running SVGs through DOMPurify server-side.

---

**L-SEC-5 · Email inbound webhook signature check skipped when env var absent**  
**Severity:** Low · **Location:** `src/app/api/email/inbound/route.ts:72` · **Effort:** S · **Risk:** Low

**Description:**
```ts
if (!secret) {
  log.warn({}, "RESEND_WEBHOOK_SECRET not set — skipping signature verification (dev only)");
  return true; // ← allows unsigned requests
}
```
In development the signature check is skipped when `RESEND_WEBHOOK_SECRET` is unset, which is acceptable. However, if the secret is accidentally absent in production, all inbound email requests are accepted unsigned.

**Recommendation:** Add an environment check: if `NODE_ENV === 'production'` and `RESEND_WEBHOOK_SECRET` is absent, throw an error rather than returning `true`.

---

**L-SEC-6 · Attachment signed URL expiry at 3 600 seconds — no refresh mechanism**  
**Severity:** Info · **Location:** `src/server/routers/attachments.ts:364` · **Effort:** S · **Risk:** Low

**Description:** Signed URLs expire in 1 hour. If a user shares a direct signed URL (e.g., embeds it in a note), the link will break after 1 hour. There is no refresh or proxy mechanism.

**Recommendation:** Consider a thin server-side proxy route (`/api/attachments/[fileId]/serve`) that validates ownership and streams the file, avoiding expiring signed URLs for inline content.

---

### 5.10 Background Job Health

---

**BJ-1 · `cleanup-sessions` cron route is a documented no-op stub**  
**Severity:** Low · **Location:** `src/app/api/cron/cleanup-sessions/route.ts` · **Effort:** S · **Risk:** Low

**Description:** The route returns `{ ok: true, message: "Sessions are managed by Clerk; no cleanup needed." }` and does nothing. The comment says it exists to avoid 404s from scheduled callers. The route is **not** in the pg-boss job registry (`src/core/jobs/registry.ts`) — it is a legacy HTTP-polled cron endpoint.

**Recommendation:** Identify and update all external cron schedulers that call this route, then delete the file. Add a note in the next infrastructure review.

---

**BJ-2 · `runBackfillOrphanRecovery` executes on every cold start**  
**Severity:** Low · **Location:** `src/core/jobs/runner.ts:35-39` · **Effort:** S · **Risk:** Low

**Description:** The orphan recovery backfill is called unconditionally on every process start. It checks whether it has already run (idempotent), but still fires a DB query on each cold start. In a high-churn serverless environment this adds latency to every startup.

**Recommendation:** Move the backfill to a one-time pg-boss job (`{ singletonKey: 'backfill-orphan-recovery' }`) rather than an inline startup call, or gate it on an env flag that is disabled once the backfill is confirmed complete.

---

**BJ-3 · Drive sync jobs have no per-user concurrency control**  
**Severity:** Low · **Location:** `src/core/jobs/registry.ts` — three `drive-sync-*` jobs at `0 * * * *` · **Effort:** M · **Risk:** Low

**Description:** The three hourly Drive sync jobs run with pg-boss default concurrency (1 worker). If a single user has a large Drive corpus, that user's sync could delay all other users' syncs within the same scheduled window.

**Recommendation:** Consider using pg-boss `teamSize` / `teamConcurrency` options, or restructure as per-user fan-out jobs scheduled from a coordinator job.

---

**BJ-4 · No queue health check in `/api/health` endpoint**  
**Severity:** Low · **Location:** `src/app/api/health/route.ts` · **Effort:** S · **Risk:** Low

**Description:** The health endpoint checks DB, storage, AI, and Google Drive. It does not check whether pg-boss is running or whether jobs are completing on schedule. A stuck job runner would not surface in the health check.

**Recommendation:** Add a pg-boss state check: query `pgboss.job` for jobs that have been `active` for more than 2× their expected duration and surface as a warning.

---

**BJ-5 · Google Calendar sync scheduled at 02:30 UTC — potential Wave 6a conflict (info)**  
**Severity:** Info · **Location:** `src/core/jobs/registry.ts` — `google-calendar-sync` at `30 2 * * *` · **Effort:** S · **Risk:** Low

**Description:** The task spec notes Wave 6a will add additional calendar sync logic. The current slot (02:30 UTC) is used. If Wave 6a introduces a second calendar-related job, there will be a schedule overlap.

**Recommendation:** Reserve 03:00 UTC for any Wave 6a calendar jobs and document this in the registry file.

---

### 5.11 Logging and Observability

---

**LO-1 · Pino `redact` not configured — sensitive values may appear in logs (cross-ref M-SEC-3)**  
*See M-SEC-3 above.*

---

**LO-2 · Silent `catch {}` blocks in email inbound and Drive OAuth handlers**  
**Severity:** Medium · **Location:** `src/app/api/email/inbound/route.ts:92,110`, `src/app/api/drive/oauth-callback/route.ts:22` · **Effort:** S · **Risk:** Low

**Description:** These empty catch blocks swallow errors silently. The email inbound handler catches JSON parse errors and attachment extraction errors without logging — when inbound email delivery fails silently, there is no log evidence.

**Recommendation:** Replace `catch { }` with `catch (err) { log.warn({ err }, 'description of what failed') }` in these handlers. The health-check catch blocks (`api/health/route.ts`) are intentional fallbacks and are acceptable as-is.

---

**LO-3 · No request-ID propagation across the tRPC → job boundary**  
**Severity:** Low · **Location:** `src/server/trpc.ts` (context), `src/core/jobs/runner.ts` · **Effort:** M · **Risk:** Low

**Description:** The tRPC context includes `user_id` but no `request_id`. When a tRPC mutation enqueues a background job (e.g., Drive sync triggered by note save), there is no correlation ID linking the HTTP request to the resulting job execution in logs.

**Recommendation:** Generate a `request_id` (uuidv7) in tRPC middleware, thread it through context, and pass it as job metadata to pg-boss so job logs include the originating request ID.

---

**LO-4 · `/api/health` — AI check makes a live Anthropic call on every health probe**  
**Severity:** Low · **Location:** `src/app/api/health/route.ts:35-60` · **Effort:** S · **Risk:** Low

**Description:** Every health check invokes `client.messages.create(...)` with `max_tokens: 8`. If the health endpoint is probed every 30 seconds (common for uptime monitors), this generates ~2 880 Anthropic API calls per day and incurs cost. The call is also not logged through the cost tracker.

**Recommendation:** Cache the AI health result for 60 seconds (or use a lightweight ping that doesn't call the inference endpoint, e.g., checking `process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY` is set and making a `GET /v1/models` call instead).

---

**LO-5 · AI cost logging does not cover help/chat calls (cross-ref H-SEC-1)**  
*See H-SEC-1 above.*

---

### 5.12 Schema Health

---

**SH-1 · Note model has no `search_vector` column or FTS index (cross-ref SO-1)**  
*See SO-1 above.*

---

**SH-2 · 13 `Json` columns — several in frequently-queried positions**  
**Severity:** Low · **Location:** `prisma/schema.prisma` — `tasks_prefs` (User), `source_metadata` (8 models), `parser_proposal` (Capture), `manual_row_order` (TableView), `config` (TableColumn), `diff` (AuditLog), `meta` (AuditLog) · **Effort:** L · **Risk:** Low

**Description:** 13 columns use Prisma `Json` type. Some (like `source_metadata`) are write-once metadata that will never be queried — acceptable. `parser_proposal` on `Capture` and `tasks_prefs` on `User` could grow into query targets.

**Recommendation:** For each `Json` column, document whether it is ever queried with `path` operators in raw SQL. If yes, add a `@@index` with a jsonb path expression. If it is queried frequently enough, promote the key fields to typed columns.

---

**SH-3 · Soft-delete consistency across all models — confirmed consistent**  
**Severity:** Info · **Location:** `prisma/schema.prisma` · **Effort:** — · **Risk:** —

**Description:** All 5 major user-data models (`Task`, `Note`, `Project`, `Attachment`, `Person`) have `deleted_at DateTime?`. This is consistent. ✓

---

**SH-4 · `_prisma_migrations` health — runtime data not available**  
**Severity:** Info · **Location:** Neon PostgreSQL database · **Effort:** — · **Risk:** —

**Description:** The migration history table was not queried during this audit (no production DB access). Pending or failed migrations cannot be confirmed from static analysis alone.

**Recommendation:** Run `npx prisma migrate status` against the production DB and verify no migrations are in a `failed` or `pending` state.

---

**SH-5 · `reattachOrphanData()` table list may be incomplete after schema additions**  
**Severity:** Low · **Location:** `src/core/auth/orphan-recovery.ts:183-234` · **Effort:** S · **Risk:** Low

**Description:** The orphan recovery function manually lists tables to re-parent by `user_id` using `$executeRaw` UPDATE statements. The list includes: `Task`, `Note`, `Project`, `Attachment`, `Tag`, `Context`, `Person`, `IntegrationToken`, `SyncState`, `RateLimitTracker`, `GoogleCalendar`, `CalendarEvent`. If a new Wave adds a user-owned model and the team forgets to add it here, orphaned records of that type will not be recovered.

**Recommendation:** Add a CI test or a startup assertion that cross-references the Prisma schema's list of models with `user_id` fields against the table list in `orphan-recovery.ts`.

---

**SH-6 · Redundant index analysis — runtime data not available**  
**Severity:** Info · **Location:** Neon PostgreSQL database · **Effort:** — · **Risk:** —

**Description:** Index usage statistics (`pg_stat_user_indexes.idx_scan`) were not available during this audit. Unused indexes add write overhead without query benefit.

**Recommendation:** Run the following query against production after sufficient traffic:
```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, relname;
```

---

## Cross-Cutting Observations

### 1 — Soft-delete pattern is correct but unabstracted

The `deleted_at` soft-delete convention is applied consistently across all user-data models (positive), but the `{ user_id: ctx.user.id, deleted_at: null }` clause is repeated 137 times verbatim across all 33 routers with no shared abstraction. This is the single highest-duplication pattern in the codebase and is a maintenance liability if the soft-delete convention changes.

### 2 — In-memory state for cross-request concerns

Rate limiters, the session cleanup stub, and the startup backfill all use process-local state that does not survive restarts or work correctly in multi-instance deployments. This is a coherent class of tech debt to address together (likely in a single sprint introducing Redis or leaning on Clerk's metadata for rate state).

### 3 — AI cost tracking has a coverage gap

The cost tracking infrastructure (`AICallLog`, `limits.ts`, per-user budgets) is well-designed, but the help/chat route bypasses it entirely. If additional AI-calling routes are added in future waves, the same pattern risks repeating. A lint rule or tRPC middleware guard ensuring all AI calls go through `src/core/ai/index.ts` would close this structurally.

### 4 — Stratum token adoption is high in core components, lower at edges

Core UI components (`Button`, `Badge`, `Card`, etc.) use Stratum tokens correctly. The gaps are concentrated in: note editor colour pickers (hardcoded hex palettes), context management (raw Tailwind palette classes), admin orphan pages (raw hex backgrounds), and homepage form (validation error colours). These are all at the edges of the design system coverage.

### 5 — Test coverage is strong on parsing logic; partial on routers; absent on job handlers

The test suite covers: algorithmic core (capture parser, formula engine, chrono date parsing), 8 router integration suites (3 238 lines against a real DB), and 8 Playwright E2E scripts covering key task/capture flows. This is a solid foundation. The remaining gap is that 25 of 33 routers have no integration coverage, and the 9 background job handlers are entirely untested. Future changes to router-level composition or job logic go undetected.

---

## Suggested Next Steps

The findings above translate into six work packages, ordered by impact-to-effort ratio. Each includes a suggested prompt the user could give to an agent to execute the work.

---

**Work package 1 — Security baseline** (Effort: S · Risk: Low)  
Addresses H-SEC-1, H-SEC-2, M-SEC-3, L-SEC-5.

> "Add per-user rate limiting (20 req/min) to `/api/help/chat/route.ts`, truncate the messages array to 20 turns, and route the Anthropic call through `src/core/ai/index.ts` for cost logging. Then add `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin` headers to `next.config.mjs`. Also add a `redact` array to the pino logger in `src/core/logging/index.ts` covering `access_token`, `refresh_token`, `token`, `password`, and `req.headers.authorization`."

---

**Work package 2 — Replace `expr-eval`** (Effort: M · Risk: Medium)  
Addresses H-DEP-1.

> "Remove `expr-eval` from the Atlas codebase. Find all call sites (`grep -r expr-eval`), then replace with `mathjs` or a narrow inline evaluator covering only the arithmetic operators Atlas uses in the tables formula feature. Run the formula unit tests after each change."

---

**Work package 3 — Search performance** (Effort: M · Risk: Low)  
Addresses SO-1, SO-2, QP-1, QP-2.

> "Enable the `pg_trgm` Postgres extension in a new Prisma migration. Add a GIN trigram index on `Note.title` and `Note.body_text`. Then add a `search_vector` column to the `Note` model and a DB trigger to keep it in sync with `title || ' ' || body_text`, mirroring the `task_search_vector_trigger` pattern. Add a GIN FTS index on the new column. Update `src/server/routers/search.ts` to use the indexed column for notes instead of the inline `to_tsvector` call."

---

**Work package 4 — Fix pre-existing test failures** (Effort: M · Risk: Low)  
Addresses TC-1.

> "Fix the 33 pre-existing test failures in Atlas. The four affected files are: (1) `task-list.test.tsx` — add a `DataTransfer` polyfill in the vitest setup file to fix jsdom drag events; (2) `task-inspector.test.tsx` — update the tRPC mock to include `tasks.update`; (3) the two capture service integration test files with broken AI mock imports. Run `npm test` after each fix to confirm the suite moves from 318 passing to 351 passing."

---

**Work package 5 — Stratum compliance round** (Effort: M · Risk: Low)  
Addresses SC-1, SC-2, SC-3, SC-4, SC-5, SC-6.

> "Run a Stratum compliance sweep across Atlas components. (1) Migrate all 47+ `title='...'` attributes on interactive elements to `<Hint label='...'>` wrappers. (2) Extract the note editor hex colour palettes from `editor-block-menu.tsx` and `editor-bubble-menu.tsx` into a shared `NOTE_HIGHLIGHT_COLORS` constant in `src/core/notes/colors.ts`. (3) Replace raw `bg-red-*`, `text-red-*`, `border-gray-*`, `bg-[#111]` and inline hex strings with the appropriate Stratum tokens (`accent-danger`, `border-border-error`, `surface-overlay`, etc.)."

---

**Work package 6 — Dependency surgery** (Effort: L · Risk: Medium)  
Addresses L-DEP-5, L-DEP-6, L-DEP-7, L-DEP-8, M-DEP-2, CO-5.

> "Apply these Atlas dependency housekeeping changes: (1) Remove `drizzle-zod` from `package.json` (no import found in src/). (2) Move `pino-pretty` from `dependencies` to `devDependencies`. (3) Bump `@anthropic-ai/sdk` to ^0.95.0 and `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` to 3.1044.0 — run tests after each. (4) Add a `renovate.json` with `\"extends\": [\"config:recommended\"]` to automate future patch updates. (5) Plan (but do not apply) the major version upgrade order: Vitest v4 → Prisma v7 → Tailwind v4 → Next.js v16."

---

## Methodology Notes and Data Gaps

| Area | Data gap | Impact |
|---|---|---|
| Bundle size | `next build` not run; no per-route JS size data | SO-5 is Info-only |
| DB index usage | `pg_stat_user_indexes` not queried (no prod DB access) | SH-6 is Info-only |
| Test coverage % | `vitest --coverage` not run (4 test files fail) | TC-6 is Info-only |
| Migration status | `prisma migrate status` not run against prod | SH-4 is Info-only |
| pg-boss runtime stats | No access to `pgboss.job` table in prod | BJ-4 recommendation is preventive only |
| Log volume | No prod log access; log rate estimates not included | LO-3 is structural only |

All findings are based on static analysis of the codebase at commit time. No fabricated benchmark numbers are included. Gaps are documented above rather than estimated.
