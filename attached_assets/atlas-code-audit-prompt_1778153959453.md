# Replit Agent Prompt — Atlas Code Audit

## Read this entire document before taking any action.

---

## 1. Overview

This is a **maintenance task, not a feature wave**. The codebase has reached a level of maturity (Waves 0 through 4 plus several CRs shipped, with Waves 4c, 5a-i, 5a-ii, and 6a queued for development) where it benefits from a comprehensive audit before adding more weight.

**The work has two phases:**

### Phase A — Mechanical fixes (auto-applied, low-risk)
Direct code changes for issues that are:
- Mechanically detectable
- Low-risk (no behavior change, no API surface change, no schema change)
- Reversible via standard version control

### Phase B — Audit report (deliverable, no code changes)
A comprehensive Markdown report covering 12 categories. **No code changes from Phase B.** The user reviews the report and prioritizes follow-up work via separate prompts.

The hard rule: **Phase A and Phase B do not overlap.** If something falls outside Phase A boundaries, it goes in the Phase B report — even if you could mechanically fix it. The user makes the call on Phase B items.

**Pre-requisites:**
- All currently-shipped waves and CRs (per the live README)
- Working `npm` and `prisma` CLIs
- Database access to query Postgres for index and table health

**Estimated scope:** 1-2 weeks of focused audit work, depending on codebase depth at audit time.

---

## 2. Stack constraints (do not deviate)

- All existing stack constraints from prior wave prompts apply
- **No major version dependency upgrades.** Patch and minor only in Phase A. Major upgrades flagged in Phase B report.
- **No schema changes** in either phase. Schema observations go in the Phase B report.
- **No test additions** in either phase. Missing tests are an audit finding, not an audit deliverable.
- **No CI changes.** `.github/workflows/ci.yml` remains untouched.
- **No behavior changes.** If a refactor would alter behavior — even subtly — it goes in Phase B, not Phase A.

---

## 3. Phase A — Mechanical fixes

These changes are auto-applied. Each commit must be small, focused, and easily revertable.

### 3.1 Allowed Phase A actions

#### 3.1.1 Dependency security advisories
Run `npm audit` and apply fixes ONLY where:
- The fix is available within the current major version (no breaking change)
- The fix is `npm audit fix` without `--force`
- The advisory severity is moderate, high, or critical
- Run `npm test` after — must pass

If `npm audit fix` would require major version bumps, **skip and report in Phase B**.

#### 3.1.2 Patch version updates for all dependencies
Bump all dependencies to their latest patch version (semver patch only):
- `^1.2.3` → `^1.2.7` if 1.2.7 exists
- Never `^1.2.3` → `^1.3.0` (that's minor)
- Never `^1.2.3` → `^2.0.0` (that's major)
- Run `npm test` after each batch — must pass

#### 3.1.3 Minor version updates (only when changelog confirms no breaking changes)
For each dependency with available minor version updates, check the upstream changelog:
- If the changelog explicitly documents no breaking changes for this minor → safe to apply
- If the changelog documents any breaking changes (even gated behind feature flags) → skip, report in Phase B
- If no changelog exists or it's ambiguous → skip, report in Phase B

Run `npm test` after each batch.

**High-value minor update candidates** (check explicitly):
- Next.js minor versions
- Prisma client + CLI minor versions
- React minor versions (rare; these tend to be major)
- TanStack Query minor versions
- Tailwind minor versions
- Anthropic SDK minor versions

#### 3.1.4 Unused imports cleanup
Run TypeScript with `--noUnusedLocals --noUnusedParameters` (or via `eslint-plugin-unused-imports`):
- Remove unused imports from every `.ts` and `.tsx` file
- Do NOT remove imports that are referenced only in JSX type position (TypeScript may flag these incorrectly)
- Do NOT remove imports that have side effects (e.g., polyfills, Tailwind plugin imports)

#### 3.1.5 Dead export removal (with strict criteria)
Identify exports that have zero references anywhere in `src/`:
- Use a tool like `ts-prune` or grep-based reference search across the codebase
- Only remove if zero references AND not part of a public API surface (tRPC procedures, Next.js route handlers, page exports — these are entry points, never "unused")
- Skip if the export is referenced from a config file (next.config, prisma.config, etc.)
- Skip if the export is used in a test file even if not in `src/`

When in doubt: leave it, flag in Phase B for review.

#### 3.1.6 Dead `console.*` statements
Remove `console.log`, `console.debug`, `console.info` statements that:
- Are not inside conditional `if (process.env.NODE_ENV === 'development')` guards
- Are not part of a meaningful debug helper
- Are clearly leftover from development (e.g., `console.log('here')`, `console.log(x)`)

Keep `console.error` and `console.warn` — those tend to be meaningful even when Pino is the canonical logger.

#### 3.1.7 Trailing whitespace and EOL consistency
Apply Prettier (with the project's existing config) to every file. No config changes.

#### 3.1.8 Missing TypeScript type annotations on exported functions
For exported functions in `src/` that have inferred but trivially-explicit return types:
- Add the return type annotation if it makes the code clearer
- Skip if the inferred type is genuinely complex (don't write monstrous explicit types just for the sake of it)
- This is judgment-light: only do this when adding the annotation is purely additive and aids readability

### 3.2 Disallowed in Phase A

These all go in the Phase B report:

- Major version dependency upgrades (any `^1.x` → `^2.x`)
- Refactoring duplicated logic into shared utilities
- Splitting large files
- Renaming variables, functions, or files
- Restructuring component hierarchies
- Adding indexes, removing indexes
- Schema changes of any kind
- API contract changes (tRPC procedure signatures, REST endpoints)
- Behavior changes, even "obvious bug fixes"
- Adding tests
- Changing log levels or redaction config
- Reformatting comments or rewriting comments
- Removing or changing existing test assertions

If you find a bug during audit, document it in Phase B. Do not fix it in Phase A.

### 3.3 Phase A commit hygiene

Each commit:
- Touches one logical concern (e.g., "patch updates for backend deps")
- Includes a Conventional Commits-style message
- Includes a brief summary of what changed and why
- Test suite passes after each commit

Suggested commit grouping:
- `chore(deps): apply npm audit fixes (patch+minor)`
- `chore(deps): bump backend dependencies (patch)`
- `chore(deps): bump frontend dependencies (patch)`
- `chore(deps): bump [package] to [version]` for high-value individual minor updates
- `chore: remove unused imports`
- `chore: remove dead exports`
- `chore: remove debug console statements`
- `chore: format codebase with prettier`
- `chore: add return type annotations`

---

## 4. Phase B — Audit report

The deliverable is a single Markdown file: `audit-reports/atlas-audit-{YYYY-MM-DD}.md` (place in `audit-reports/` directory at repo root; create the directory if absent).

The report has a fixed structure (section 5). It contains findings — not code changes. Every finding has:

- **Title** — concise, scannable
- **Severity** — Critical / High / Medium / Low / Info
- **Location** — file path and line numbers, or "cross-cutting" with examples
- **Description** — what was observed
- **Recommendation** — what to do about it
- **Effort estimate** — S (< 1 day) / M (1-3 days) / L (> 3 days) / XL (whole-wave scope)
- **Risk** — Low / Medium / High (probability of breaking something during the fix)

### Severity definitions

- **Critical** — security vulnerability, data integrity risk, or actively-broken functionality
- **High** — significant performance issue, accumulated technical debt blocking near-term work, or non-critical security concern
- **Medium** — refactor opportunity with clear payoff, query pattern improvement, moderate-impact debt
- **Low** — code quality improvements, minor inefficiencies, style consistency
- **Info** — observations worth noting, not necessarily action items

---

## 5. The 12 audit categories

For each category below, perform the listed checks and record findings in the Phase B report under that category's section.

### 5.1 Code organization and refactor opportunities

**Checks:**
1. **Duplicated logic across modules.** Look for similar patterns in:
   - Multi-value relation forms (Wave 5a-i ships several; check parity)
   - Picker components (project picker, person picker, tag picker — shared abstraction?)
   - Soft-delete handling
   - Audit log writes
   - Validation utilities
   - Token encryption/decryption
2. **Layer violations.** UI components calling Prisma directly. Business logic embedded in route handlers. Database concerns in components.
3. **File organization consistency.** Are similar concerns grouped consistently? Are folder conventions clear?
4. **Dead code.** Components, exports, types not referenced anywhere.
5. **Long files.** Any file > 500 lines is suspicious. Document; recommend splits.
6. **Long functions.** Any function > 100 lines. Suggest extractions.
7. **Magic numbers and strings.** Hardcoded values that should be constants or config.
8. **Inconsistent naming.** Compare similar entities — are conventions consistent (e.g., `createdAt` vs `created_at`, plural vs singular)?
9. **Component reusability.** Are similar UI patterns abstracted? (Multi-value form sections, list-row patterns, modal wrappers, empty states.)
10. **Concept proliferation.** Are there N different ways to do the same thing? (E.g., multiple form-state libraries, multiple approaches to data fetching.)

**Output per finding:** as defined in section 4.

### 5.2 Speed optimization (frontend + backend)

**Checks:**

#### Frontend
1. **Bundle size.** Run `next build` and note total JS bundle size. Identify the heaviest chunks. Use `@next/bundle-analyzer` if not already in stack.
2. **Component render performance.** Audit for:
   - Components that re-render on every parent update without `React.memo`
   - `useEffect` dependencies that fire too often
   - Context providers that change identity unnecessarily
3. **Asset loading.**
   - Images served at appropriate sizes (Next.js Image component used?)
   - Fonts: are custom fonts loaded with `font-display: swap`?
   - Icon library: are unused lucide-react icons tree-shaken?
4. **Code splitting.** Pages that should be lazy-loaded but aren't. Modals/dialogs that could be lazy.
5. **Streaming and Suspense.** RSC streaming opportunities. Slow data fetches that could stream.
6. **Memoization opportunities.** Expensive computations in render paths without `useMemo`.

#### Backend
7. **Database connection pooling.** Neon Postgres connection limits. Prisma client connection settings. Pooler URL vs direct URL usage.
8. **API response sizes.** tRPC procedures that return more data than the client uses. Suggested: trim selections, paginate.
9. **Server-side computation.** Anything that runs on every request that could be cached.
10. **Static generation.** Pages that could be statically rendered or ISR-cached.

**Output per finding:** as defined in section 4.

### 5.3 Query pattern analysis

**Checks:**
1. **N+1 queries.** Audit every tRPC procedure that returns nested data. For each procedure that loops and queries inside the loop, flag.
2. **Missing indexes.** For each table:
   - Identify common WHERE clause patterns by grepping the codebase
   - Cross-reference with existing indexes in the Prisma schema
   - Flag combinations not covered
3. **Redundant indexes.** Postgres `pg_stats_user_indexes`-equivalent query: indexes never used since last DB stats reset. Document candidate removals.
4. **Soft-delete query overhead.** Every query has `WHERE deleted_at IS NULL`. Verify partial indexes exist on heavy tables (`@@index([user_id, deleted_at])` patterns) so the planner can use them efficiently.
5. **Pagination patterns.** Every list endpoint should use cursor-based pagination, not OFFSET. Flag any using OFFSET on tables that may grow.
6. **Query batching.** Look for sequential `await` patterns that could be `Promise.all`. (Be careful — only flag where the calls are truly independent.)
7. **Transaction sizing.** Long-running transactions block other queries. Audit `prisma.$transaction(...)` calls — any that wrap many operations or call external APIs inside?
8. **COUNT queries.** `SELECT COUNT(*)` on large tables is slow. Approximate counts (`pg_class.reltuples`) work for many UI cases.
9. **LIKE/ILIKE without trigram indexes.** Search procedures using `ILIKE '%term%'` on large tables — flag for `pg_trgm` index consideration.
10. **Postgres-specific health.** Check (via `psql` or Prisma `$queryRaw`):
    - Table bloat (`pgstattuple`-equivalent)
    - Unused indexes (`pg_stat_user_indexes`)
    - Missing FK indexes
    - Sequential scans on large tables
11. **Sync job query efficiency.** Drive sync, attachment cleanup, trash retention — are these jobs using batched queries or row-by-row?
12. **Search vector freshness.** If FTS via `search_vector` is in use (per README), verify triggers update the vector on row updates.

**Output per finding:** as defined in section 4.

### 5.4 Dependency analysis

**Checks:**
1. **Outdated dependencies.** Run `npm outdated`. For each:
   - Current version, latest version, type of update (patch/minor/major)
   - For majors: link to upstream migration guide
   - Flag any with known security advisories
2. **Unused dependencies.** Use `depcheck` or grep-based scan:
   - Imports referenced nowhere in `src/`
   - Devdependencies that aren't actually used in any script or tooling
3. **Duplicate packages.** Run `npm ls --all` and look for the same package at multiple versions. Flag each duplicate path.
4. **Deps vs devDeps misclassification.** Runtime-imported packages in `devDependencies` (will fail in production). Build-time-only packages in `dependencies` (bloats deployment).
5. **Peer dependency warnings.** Run `npm install` and capture peer dep mismatch warnings.
6. **Lockfile health.** `npm ls` should not error. Lockfile entries with no corresponding package.json entry should be flagged.
7. **License compliance.** Run a license scanner (e.g., `license-checker`). Flag any GPL, AGPL, or unlicense dependencies — those are issues for a production app.

**Output per finding:** as defined in section 4.

### 5.5 Library updates (security and performance)

**Checks:**
1. **Security advisories.** From `npm audit`. For each:
   - Severity (critical / high / moderate / low)
   - Affected package and version
   - Available fix (and whether it's a major version)
   - In Phase A range or Phase B
2. **High-value perf updates available.** Major versions with documented performance improvements:
   - Next.js (each major has had perf wins)
   - Prisma (query engine improvements)
   - React (rendering improvements)
   - TanStack Query (caching improvements)
   - Tailwind (CSS generation improvements)
3. **EOL or deprecated dependencies.** Packages no longer maintained. Migration paths.
4. **Renovate / Dependabot opportunities.** Is automated dependency PR creation set up? Recommend if not.

**Output per finding:** as defined in section 4.

### 5.6 Stratum compliance audit

**Checks:**
1. **Hardcoded hex values.** Grep all `.tsx`, `.ts`, `.css`, `.scss` for hex color patterns: `#[0-9a-fA-F]{3,8}`. For each match:
   - File and line
   - Context (component name, usage)
   - Suggested Stratum token replacement
2. **Inline color styles.** Grep for `style=` props with `color`, `background`, `border-color`, `fill`, `stroke`. Flag any using non-token values.
3. **Tailwind utility bypass.** Grep for Tailwind color utilities NOT mapped to Stratum: `bg-blue-500`, `text-red-600`, `border-green-400`, etc. The Stratum-compliant patterns use `bg-accent-primary`, `text-text-primary`, etc.
4. **CSS custom property consistency.** All custom properties should follow the `--color-*`, `--space-*`, `--radius-*`, `--shadow-*` naming pattern from `src/styles/tokens.css`. Flag deviations.
5. **`<Hint>` enforcement.** Grep for `title=` props in JSX. Each match is a violation of the "no raw `title=` for tooltips" rule.

Severity guidance:
- Hardcoded hex → **High** (violates Stratum Compliance Round 2 CR)
- Tailwind utility bypass → **Medium** (compliance drift)
- Raw `title=` → **Medium**
- Inline non-token styles → **High**

**Output per finding:** include exact line content for fast remediation.

### 5.7 Type safety review

**Checks:**
1. **`any` usage.** Grep for `: any` and `as any` in `src/`. Each occurrence:
   - Justify if intentional (e.g., third-party type gap)
   - Recommend specific type if not
2. **`unknown` vs `any`.** Where `unknown` would be safer than `any`, recommend.
3. **`as` assertions.** Type assertions can hide bugs. Audit for excess.
4. **Missing return types on exported functions.** Already a Phase A concern, but log uncovered cases here.
5. **Zod coverage on tRPC inputs.** Every `input(z....)` should be present on every tRPC procedure. Flag any procedure without Zod input validation.
6. **Loose generic constraints.** Generic functions with `<T>` instead of `<T extends Constraint>` where a constraint would help.
7. **Discriminated unions vs optional fields.** Patterns where multiple optional fields could be modeled as a discriminated union for safety.
8. **`@ts-ignore` and `@ts-expect-error`.** Each occurrence — is the suppression still necessary?
9. **Implicit `any` from JSON parsing.** `JSON.parse(...)` returns `any`. Wrap in Zod schemas for runtime + type safety.
10. **Prisma type usage.** Are generated Prisma types imported consistently from `@prisma/client`? Or are types being manually re-declared?

**Output per finding:** as defined in section 4.

### 5.8 Test coverage review

**Checks:**
1. **Coverage report.** Run `vitest --coverage` if not configured, configure it. Capture overall % and per-module %.
2. **Critical paths without tests.** Even at low coverage overall, these MUST have tests:
   - Capture parsing (three-tier: chrono+compromise, Claude Haiku fallback, raw fallback)
   - Orphan recovery (`reattachOrphanData`)
   - Token encryption / decryption helpers
   - Soft-delete cascade behavior
   - File conversion (markdown / docx import, PDF / markdown export)
   - Drive sync logic
   - Capture parser tier selection logic
   - Recurrence rule expansion (when 6a ships)
3. **Slow tests.** Tests > 1 second flagged for review.
4. **Flaky tests.** Run the suite 5 times. Any tests that fail intermittently flagged.
5. **Test parallelization.** Vitest config — are tests running in parallel where safe?
6. **Snapshot test rot.** Snapshot tests that haven't been updated in months may be hiding regressions.
7. **E2E coverage.** If Playwright or similar is in use, audit critical user journeys.

**Output per finding:** as defined in section 4.

### 5.9 Security review

**Checks:**
1. **Auth boundary on every tRPC procedure.** Every mutation and query should check `ctx.user` (or equivalent) and scope DB queries by `user_id`. Audit each router. Any procedure that touches user data without `user_id` filtering is **Critical**.
2. **Admin gate enforcement.** Every `admin` router procedure and `/admin` route should check `isAdmin(ctx.user)`. Audit all admin endpoints.
3. **Input sanitization.** User-generated content rendering paths:
   - TipTap editor output sanitization
   - Markdown rendering (gray-matter + marked) — are HTML entities escaped where needed?
   - User-provided URLs in note embeds — validated?
4. **Token redaction in logs.** Audit Pino config — `redact` should cover: `access_token`, `refresh_token`, `*_encrypted`, `password`, `clerk_token`, `email` (in some contexts). Test by triggering a token-heavy code path and inspecting logs.
5. **Rate limiting.** All public-facing endpoints (anything not behind tRPC + Clerk auth):
   - `/api/email/inbound` (Resend webhook) — has secret verification, but should also rate-limit by source
   - `/api/convert/import` — explicit 10/min documented
   - `/api/convert/export` (PDF) — explicit 5/min documented
   - `/api/help/chat` (streaming Anthropic) — should be rate-limited; cost-bearing
   - `/api/calendar/sync` (when 6a ships) — 1/30s documented
   - Audit each public endpoint for rate limit
6. **CORS / CSP headers.** Audit Next.js middleware and config:
   - CSP should restrict script sources
   - CORS should be tight (specific origins, not `*`)
   - `frame-ancestors` should prevent clickjacking
7. **File upload validation.** R2 attachment uploads:
   - Size limit enforced server-side (not just client-side)
   - MIME type validated by content sniffing, not just by header
   - Filename sanitization (no path traversal)
   - Generated filenames use UUIDs, not user input
8. **SQL injection.** Prisma ORM prevents most SQL injection. Audit any raw queries (`$queryRaw`, `$executeRaw`):
   - Each should use `Prisma.sql` template literals, not string concatenation
9. **XSS in rendered content.** TipTap output, note rendering, person notes — verify no `dangerouslySetInnerHTML` without sanitization.
10. **Authorization on attachments.** Signed URLs — verify they include user-scoped path and expire appropriately. Audit URL generation logic.
11. **Encryption key handling.** `ENCRYPTION_KEY` should:
    - Be exactly 32 bytes
    - Not be logged anywhere
    - Have a documented rotation strategy (even if "no rotation in v1, manual key change requires re-encryption migration")
12. **Webhook signature verification.** Clerk webhooks — `CLERK_WEBHOOK_SECRET`. Resend webhook — verify signature. Audit any other webhook receivers.
13. **Session and CSRF.** Clerk handles sessions. Verify any non-Clerk-protected mutations have CSRF protection or are tRPC-only (which has implicit protection via the auth context).

**Severity guidance:** Auth boundary failures = Critical. Token leakage in logs = Critical. Missing rate limit on cost-bearing endpoint = High. CSP gaps = Medium-High depending on what's exposed.

**Output per finding:** as defined in section 4.

### 5.10 Background job health

**Checks:**
1. **Job registration audit.** All jobs in `src/core/jobs/index.ts` should be registered with pg-boss. Compare to documented list:
   - `drive-sync-notes` (hourly)
   - `drive-sync-tables` (hourly)
   - `drive-sync-attachments` (hourly)
   - `import-cleanup` (daily 06:00 UTC)
   - `session-cleanup` (daily 03:00 UTC) — **stub, flagged separately**
   - `trash-retention` (daily 04:00 UTC)
   - `attachment-cleanup` (daily 05:00 UTC)
2. **`session-cleanup` stub.** Confirm it's still a stub. Document what the handler should do (clean up expired sessions in `Session` model? Clean up Clerk-orphaned local sessions?). Recommend implementation in Phase B.
3. **Job failure rates.** Query pg-boss tables (`pgboss.archive`, `pgboss.job`) for failure stats over the last 30 days per job. Flag any with > 5% failure rate.
4. **Job duration trends.** Average and p95 duration per job. Flag any trending upward.
5. **Retry logic.** Each job's retry policy. Failed jobs that retry indefinitely vs ones that should give up.
6. **Schedule conflicts.** Multiple jobs at the same UTC minute can stress the worker. Calendar sync (Wave 6a) should land at 02:30 UTC to avoid conflict.
7. **Idempotency.** Each job should be safely re-runnable. Audit by reading each handler — would running twice cause issues? Document non-idempotent jobs.
8. **Token refresh in sync jobs.** Drive sync (and Calendar sync once 6a ships) refresh tokens. Failure handling: does the job set a "disconnected" flag on token failure, or does it crash?
9. **Cancellation handling.** If a user disconnects Google Drive mid-job, what happens? Audit graceful degradation.
10. **Logging volume.** Sync jobs should log start, end, and stats — not per-row events. Audit log volume per job.

**Output per finding:** as defined in section 4.

### 5.11 Logging and observability

**Checks:**
1. **Pino redact config.** Should include token fields, encrypted columns, raw external emails, password fields. Audit the config object.
2. **Log levels.** `info`, `warn`, `error` use should be appropriate. `debug` should be used for things developers want during debugging, not in production logs.
3. **Request context.** Every log line during a request should include: user_id (if authenticated), request ID, route. Audit middleware.
4. **Error logs.** Every `catch` block — does the log include the error stack and meaningful context?
5. **Useful debugging info.** Sync job logs should include: how many rows processed, how long, any errors. Capture parser logs should include: tier used, confidence, AI cost.
6. **Log volume.** Estimate logs per day at current usage. Flag if log volume is high (>10MB/day) — may need sampling for non-critical levels.
7. **Health endpoint.** `/api/health` should expose: DB connectivity, R2 connectivity, pg-boss queue depth, last successful sync per integration. Audit.
8. **AI cost logging.** AICallLog rows — verify every Anthropic call writes one. Audit `/usage` page data accuracy.
9. **Audit log coverage.** Every meaningful entity change writes to AuditLog. Spot-check several mutations to verify.
10. **Structured logging.** Pino logs should be structured (JSON), not free-text. Audit any `console.log`-style logs that snuck in.

**Output per finding:** as defined in section 4.

### 5.12 Schema health

**Checks:**
1. **Unused columns.** For each model in `schema.prisma`, grep the codebase for column references. Columns with zero references are candidates for removal.
2. **Redundant indexes.** Postgres query:
   ```sql
   SELECT indexrelid::regclass, idx_scan, idx_tup_read
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   ORDER BY idx_scan ASC;
   ```
   Indexes with `idx_scan = 0` since last stats reset are unused (or never queried in production).
3. **Missing indexes.** For common WHERE clauses in tRPC procedures, verify covering indexes exist. Cross-check section 5.3.
4. **FK integrity.** Run a SQL audit to find orphaned rows (rows whose FK target no longer exists). Soft-deletes complicate this — document any inconsistencies.
5. **Migration cleanliness.** Check `_prisma_migrations` table for failed migrations. Document any `applied_steps_count != 1`.
6. **Soft-delete consistency.** Every content table should have `deleted_at`. Audit by listing all models and checking for `deleted_at`.
7. **`reattachOrphanData()` table list.** Compare actual `user_id` tables against the list in `reattachOrphanData()`. Document any mismatches.
8. **Cascade delete semantics.** Audit all FK relations. Each `onDelete: Cascade` should be intentional. `onDelete: SetNull` for cross-module linkage. `onDelete: Restrict` rarely appropriate. Document anything unusual.
9. **Schema comments.** The schema should document non-obvious columns and tables. Audit for missing comments on important tables.
10. **Column type consistency.** `String` vs `Text` (Postgres `TEXT` always — Prisma defaults). `DateTime @db.Date` vs `@db.Timestamptz` — use the right one.
11. **`@db.Uuid` consistency.** Every UUID column should have `@db.Uuid` (efficient binary storage in Postgres). Flag any UUID columns without it.
12. **JSON column overuse.** JSON columns are convenient but unindexable. If a JSON field is queried, recommend extracting to a column.

**Output per finding:** as defined in section 4.

---

## 6. Phase B report structure

Save as: `audit-reports/atlas-audit-{YYYY-MM-DD}.md`

```markdown
# Atlas Code Audit — {YYYY-MM-DD}

## Executive Summary

- **Overall health:** [Healthy / Healthy with concerns / Significant debt / Critical issues]
- **Critical findings:** [count]
- **High findings:** [count]
- **Medium findings:** [count]
- **Low findings:** [count]
- **Info findings:** [count]
- **Top 3 priorities:** [bulleted, with section references]
- **Phase A applied:** [count of commits, link to PR]

## Phase A summary

[Summary of mechanical fixes applied: dependency bumps, dead code removed, formatting. Link to PR or commit range.]

## Findings by category

### 1. Code organization and refactor

[Findings, each formatted per section 4 of the audit prompt]

### 2. Speed optimization

[Findings...]

### 3. Query patterns

[Findings...]

### 4. Dependency analysis

[Findings...]

### 5. Library updates

[Findings — including the table of major version updates available, with migration effort estimates]

### 6. Stratum compliance

[Findings — each with file:line and exact line content]

### 7. Type safety

[Findings...]

### 8. Test coverage

[Findings, plus a coverage table per module]

### 9. Security

[Findings — Critical and High up top]

### 10. Background jobs

[Findings, plus job health summary table]

### 11. Logging and observability

[Findings...]

### 12. Schema health

[Findings, plus index usage table and orphan row counts]

## Cross-cutting observations

[Patterns observed across multiple categories — e.g., "soft-delete handling is implemented inconsistently across 4 modules" with category cross-references.]

## Suggested next steps

For each significant finding cluster, a brief paragraph proposing a follow-up prompt the user could draft:

- "Database query optimization wave" — addresses findings 3.1 through 3.7
- "Type safety hardening CR" — addresses findings 7.1 through 7.5
- "Stratum compliance Round 3" — addresses findings 6.1 through 6.4
- etc.

Estimated effort and risk per next-step prompt.

## Methodology notes

- Tools used (npm audit, depcheck, ts-prune, etc.)
- Coverage tool config
- Database queries run for stats
- Anything skipped or abbreviated, with reasons
```

---

## 7. Rules of engagement

### 7.1 The boundary between Phase A and Phase B is hard

If a fix would alter behavior — even subtly — it goes in Phase B. Examples:

- Removing what looks like dead code but might be referenced via dynamic import → Phase B
- "Fixing" an N+1 query → Phase B (changes query semantics)
- Renaming a variable for clarity → Phase B (touches semantics, even if cosmetically)
- Updating a major dependency version → Phase B
- Adding an index → Phase B (schema change)
- Changing log level on an existing log statement → Phase B

When in doubt, choose Phase B. The user reviews and decides.

### 7.2 Each Phase A commit must be revertable

Small, focused commits. If something breaks, the user must be able to revert that one commit without losing other audit work.

### 7.3 The report is a deliverable, not a wishlist

Findings must be actionable. Each finding should have:
- A concrete location (or "cross-cutting" with examples)
- A concrete recommendation
- A defensible severity assignment
- An honest effort estimate

Don't pad the report with low-value findings. If a category has only minor observations, the section can be short.

### 7.4 Severity calibration

Be calibrated, not alarmist:
- Critical: rare. Reserved for real risks (data integrity, active security holes, broken core functionality).
- High: things that should be fixed in the next planning cycle.
- Medium: meaningful improvements with clear payoff.
- Low: polish.
- Info: observations, not action items.

If the report has 50 Critical findings, the calibration is wrong. Recalibrate.

### 7.5 Don't audit for the sake of audit volume

A short, focused report with 30 high-quality findings is more valuable than a 200-page report with 200 findings of mixed quality. Quality over volume.

### 7.6 Acknowledge limits

Some checks require runtime data (job failure rates, query stats, log volume). If production data isn't accessible, document what wasn't checked and recommend the user provide access or grant the audit re-run.

Honest gaps are better than fabricated findings.

### 7.7 No fabricated findings

If you can't observe something, say so. Do not invent issues. Do not speculate about hypothetical problems and present them as findings. If a check produced no findings, the section says "No findings" — that's a valid outcome.

### 7.8 The session-cleanup stub is its own finding

It's already known to be a stub. Phase B should:
- Document that it's a stub (cite the README and the codebase comment)
- Recommend the implementation: clean up `Session` rows where `expires_at < NOW()` (or whatever the actual session model is)
- Flag any cascading concerns
- Severity: Medium (no active harm, but data accumulates)

### 7.9 Don't try to be too clever

Stick to checks the prompt enumerates. If a deeper observation surfaces during the audit, document it as a Cross-cutting finding rather than expanding scope mid-audit.

---

## 8. What is NOT in this audit

- **Feature work.** No new features get suggested. The audit is about the code that exists.
- **Schema migrations.** Any migration is a Phase B finding, never executed during the audit.
- **Behavior changes.** Bug fixes are findings. Don't fix.
- **Test additions.** Missing tests are findings. Don't add.
- **Architectural rewrites.** Recommendations for major restructuring belong in a separate planning conversation. The audit might flag a need; it doesn't draft the rewrite.
- **Performance benchmarking.** If real benchmarks aren't easily run, the audit is qualitative. Don't fabricate numbers.
- **Code review of feature waves not yet shipped.** Wave 4c, 5a-i, 5a-ii, 6a are drafted but not built. They're not in the audit scope.

---

## 9. Recommended sequence

1. **Set up audit environment.** Create `audit-reports/` directory. Initial commit on a new branch (`chore/audit-{YYYY-MM-DD}`).
2. **Phase A — dependency hygiene.**
   - `npm audit` (apply patch+minor fixes, run tests after each)
   - `npm outdated` (apply patch updates, run tests)
   - High-value minor updates (one batch per package, tests after each)
3. **Phase A — code hygiene.**
   - Unused imports cleanup
   - Dead export removal (with usage scan)
   - Console statement cleanup
   - Prettier pass
   - Return type annotations on exports
4. **Phase B — category audits.** Work through sections 5.1 to 5.12 in order. Some categories require code reading; others require running tools (npm, depcheck, ts-prune, vitest, prisma queries). Batch the tool runs.
5. **Phase B — synthesize cross-cutting observations.**
6. **Phase B — write executive summary and next-step recommendations.** Last step; informed by the full body of findings.
7. **Final review.** Read the complete report end-to-end. Recalibrate severities if needed. Cut low-value findings.
8. **Submit PR.** Branch contains Phase A commits + the audit report file. Description summarizes what was done.

---

## 10. Final note

The goal of this audit isn't to fix everything. It's to give the user a clear picture of where the codebase is so they can make informed decisions about what to prioritize next.

A good audit:
- Tells the user what they don't know
- Confirms what they suspect
- Identifies the highest-leverage improvements
- Doesn't pretend to know more than it does

Be thorough. Be honest. Be calibrated.

Begin with section 9, step 1.
