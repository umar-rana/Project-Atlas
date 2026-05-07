# Replit Agent Prompt — Atlas CR: Dependency Surgery (Audit WP6)

## Read this entire document before taking any action.

---

## 1. Overview

Tier-3 audit remediation. Closes six Low-severity dependency findings plus housekeeping. Effort L, Risk Medium.

**Source:** `audit-reports/atlas-audit-2026-05-07.md` Work Package 6.

**Findings addressed:**
- **M-DEP-2** — Remove `drizzle-zod` (unused)
- **CO-5** — Move `pino-pretty` from `dependencies` to `devDependencies`
- **L-DEP-7** — Bump `@anthropic-ai/sdk` to ^0.95.0 (4 minor versions behind)
- **L-DEP-8** — Bump `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to 3.1044.0
- **L-DEP-5** — File issue with Replit for Object Storage SDK update (no code change)
- **L-DEP-6** — Plan major version upgrades (Vitest, Prisma, Tailwind, Next.js, Zod, TypeScript) — planning only, no upgrades applied
- **LU-1** — Add `renovate.json` for automated dependency updates

**Estimated scope:** 2-3 days for the active changes; the major version planning is documentation only.

---

## 2. Stack constraints (do not deviate)

- **No major version upgrades in this CR.** Major versions get planning, not application.
- Test suite must pass after every individual change (commit-then-test pattern)
- Lockfile must be regenerated cleanly with each `npm install`
- TypeScript strict
- No schema changes
- No CI workflow changes (CI stays untouched per audit ground rules)

---

## 3. Detailed deliverables

### 3.1 M-DEP-2 — Remove `drizzle-zod`

#### 3.1.1 Verify no usage

```bash
grep -r 'drizzle-zod' src/ tests/ scripts/
```

Expected: zero matches. The audit confirmed this.

If matches appear (e.g., a comment mentioning it, or a migration left over), evaluate:
- Comment-only references: safe to remove or leave (not blocking)
- Live imports: stop. Investigate before removing the package.

#### 3.1.2 Remove

```bash
npm uninstall drizzle-zod
```

Verify `package.json` and `package-lock.json` no longer mention the package.

#### 3.1.3 Test

```bash
npm run typecheck
npm test
```

Both should pass — there's no impact since the package was unused.

### 3.2 CO-5 — Move `pino-pretty` to `devDependencies`

#### 3.2.1 Migration

```bash
npm uninstall pino-pretty
npm install --save-dev pino-pretty
```

This relocates the entry from `dependencies` to `devDependencies` in `package.json`.

#### 3.2.2 Verify production build doesn't break

`pino-pretty` is used by the development logger transport (guarded by `NODE_ENV !== 'production'`). It's also already listed in `serverExternalPackages` in `next.config.mjs`, so the production build doesn't bundle it.

Test:
```bash
NODE_ENV=production npm run build
```

Build should succeed without `pino-pretty` errors.

If the build fails because of an unguarded import, add the env guard at the import site:

```ts
const transport = process.env.NODE_ENV === 'production'
  ? undefined
  : { target: 'pino-pretty', options: { /* ... */ } }
```

### 3.3 L-DEP-7 — Bump `@anthropic-ai/sdk`

```bash
npm install @anthropic-ai/sdk@^0.95.0
```

#### 3.3.1 Test thoroughly

The Anthropic SDK is used in:
- `src/core/ai/index.ts` (the `callAI()` wrapper)
- `src/app/api/help/chat/route.ts` (currently — until WP1 routes through `callAI()`)
- Capture parsing tier 2 (Claude Haiku fallback)

Test all three paths:
1. Open the Help Center, send a chat message, verify response
2. Submit a capture that exercises tier 2 parsing (a sentence vague enough that local parsing low-confidences)
3. Run capture parser tests: `npx vitest run capture`

If any test fails or behavior regresses, the bump is incompatible. Pin to the specific working version and document in PR.

### 3.4 L-DEP-8 — Bump AWS SDK packages

```bash
npm install @aws-sdk/client-s3@3.1044.0 @aws-sdk/s3-request-presigner@3.1044.0
```

#### 3.4.1 Test

The AWS SDK is used in:
- `src/core/r2/storage.ts` (or wherever R2 storage lives) for upload/get/delete operations
- Signed URL generation for attachments

Test:
1. Upload an attachment in the live app
2. View an attachment (verify signed URL works)
3. Delete an attachment
4. Run attachment-related router tests if they exist

If behavior regresses, pin and document.

### 3.5 L-DEP-5 — File upstream issue with Replit

#### 3.5.1 Action: file issue, no code change

The audit noted: "The Replit Object Storage SDK transitively depends on vulnerable versions of `@google-cloud/storage → teeny-request → @tootallnate/once`. No fix is available without an upstream SDK update."

**No code change required.** File a GitHub issue with Replit (or their support channel) requesting a `@replit/object-storage` SDK update that pulls in current `@google-cloud/storage` versions.

Document the issue link in PR description so it can be tracked.

#### 3.5.2 Verify continued operation

The advisory is for transitive dependencies in dev/build tooling, not in our runtime code paths. Verify by:

```bash
npm audit --omit=dev
```

If `@tootallnate/once` is flagged in production-only audit, escalate. If only in dev, document and move on.

### 3.6 L-DEP-6 — Major version upgrade planning

**No upgrades in this CR.** Document the planned upgrade order in `docs/dependency-upgrade-plan.md` (create the file if needed).

#### 3.6.1 Planned upgrade order

```markdown
# Atlas Dependency Major Version Upgrade Plan

Last updated: {YYYY-MM-DD}
Source: audit-reports/atlas-audit-2026-05-07.md (L-DEP-6)

## Sequence

Major upgrades batched in dependency order. Each is its own sprint.

### Sprint 1: Vitest 2 → 4
- **Why first:** Resolves esbuild vulnerability (M-DEP-4).
- **Effort:** M (test API changes are manageable).
- **Risk:** L — only test infrastructure affected.
- **Coordinated with:** Storybook 10 release (parallel sprint).

### Sprint 2: Prisma 5 → 7
- **Why next:** Query engine rewrite, breaking migration API.
- **Effort:** L.
- **Risk:** M-H — every router uses Prisma.
- **Pre-work:** Read Prisma 6 migration guide and Prisma 7 migration guide; the path is two majors.
- **Validation:** Run full test suite + manual smoke test of every module after upgrade.

### Sprint 3: Tailwind 3 → 4
- **Why third:** CSS-native engine, config format changed.
- **Effort:** M.
- **Risk:** M — Stratum compliance work (WP5) must be solid first or visual regressions multiply.
- **Pre-work:** Tailwind 4 migration guide; CI must catch hex regressions cleanly.

### Sprint 4: Next.js 15 → 16
- **Why last:** Highest blast radius; benefits from settled ecosystem (Prisma 7, Tailwind 4 working).
- **Effort:** L.
- **Risk:** M-H — App Router behavior changes possible.
- **Pre-work:** Next.js 16 migration guide; review all dynamic / streaming components.

### Smaller majors (slot opportunistically)

- **Zod 3 → 4** — slot before Prisma 7 if convenient, otherwise after. Used heavily across tRPC inputs.
- **TypeScript 5.9 → 6** — strictly opt-in; defer until Prisma 7 ships (Prisma drives TS support).
- **lucide-react 0.x → 1.x** — icon name changes; quick once started, slot anywhere.
- **@hookform/resolvers** — must match react-hook-form major; bundle with the form-related work.
- **pino 9 → 10** — transport API changes; minor scope, slot as a small individual sprint.
- **sonner 1 → 2** — toast API changes; slot as a small individual sprint.

## Per-sprint checklist

For each major upgrade:
- [ ] Read upstream migration guide
- [ ] Create `chore/upgrade-{name}-{version}` branch
- [ ] Apply upgrade
- [ ] Update consuming code per migration guide
- [ ] Run full test suite (must pass)
- [ ] Manual smoke test of affected modules
- [ ] Bundle size check (before/after)
- [ ] Document any behavioral changes in PR description
- [ ] Merge after review

## Risks and dependencies between sprints

- Vitest 4 ↔ Storybook 10: both need to land before either can resolve the esbuild vuln cleanly
- Prisma 7 → Zod 4: Prisma 7 may have stricter Zod expectations; do Zod 4 first
- Tailwind 4 ↔ Stratum compliance: WP5 should ship first
- Next.js 16 → React 20 (whenever it ships): Next.js may force a React major

This plan is a guide, not a contract. Reassess after each sprint based on actual integration friction.
```

The plan lives in the repo so future planning sessions don't relitigate the order.

### 3.7 LU-1 — Add `renovate.json`

#### 3.7.1 Configuration

Create `renovate.json` at repo root:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 6am on monday"],
  "timezone": "Asia/Karachi",
  "labels": ["dependencies"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch", "minor"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true,
      "automergeType": "branch"
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["dependencies", "major"]
    },
    {
      "matchPackageNames": ["next", "@prisma/client", "prisma", "tailwindcss", "vitest", "typescript", "react", "react-dom"],
      "automerge": false,
      "labels": ["dependencies", "high-impact"]
    }
  ],
  "vulnerabilityAlerts": {
    "labels": ["security", "dependencies"],
    "automerge": false
  }
}
```

Notes on the config:
- Patch + minor with stable versions (≥1.0.0): auto-merged after CI passes
- 0.x packages: never auto-merged (treated as breaking by semver convention)
- High-impact packages (Next, Prisma, Tailwind, Vitest, TS, React): never auto-merged
- Major versions: never auto-merged
- Vulnerability alerts: always require human review

The schedule batches updates into Monday morning PRs to avoid mid-week disruption.

#### 3.7.2 Bot installation

This requires Renovate to be installed on the repository (GitHub App or self-hosted). Document in PR description: "Renovate config added; activate via the GitHub App at https://github.com/apps/renovate."

If the team prefers Dependabot, swap for `.github/dependabot.yml`. Renovate has stronger configuration; Dependabot is GitHub-native. Either works.

---

## 4. Verification

### M-DEP-2 verification
1. `drizzle-zod` removed from `package.json`
2. `drizzle-zod` removed from `package-lock.json`
3. `grep -r 'drizzle-zod' src/ tests/` returns zero
4. `npm test` passes
5. `npm run typecheck` passes

### CO-5 verification
6. `pino-pretty` moved from `dependencies` to `devDependencies` in `package.json`
7. `NODE_ENV=production npm run build` succeeds
8. Development logger still produces formatted output (`npm run dev` and confirm logs)

### L-DEP-7 verification
9. `@anthropic-ai/sdk` at `^0.95.0` in `package.json`
10. Help Center chat works end-to-end
11. Capture tier 2 parsing works (test with a vague capture)
12. Capture tests pass

### L-DEP-8 verification
13. `@aws-sdk/client-s3` at `3.1044.0`
14. `@aws-sdk/s3-request-presigner` at `3.1044.0`
15. Attachment upload works in live app
16. Attachment view (signed URL) works
17. Attachment delete works

### L-DEP-5 verification
18. Issue filed with Replit; link documented in PR description
19. `npm audit --omit=dev` does not flag `@tootallnate/once` in production scope (verify or document)

### L-DEP-6 verification
20. `docs/dependency-upgrade-plan.md` exists with the documented sprint order
21. Plan documents per-sprint risks, effort, and pre-work
22. Plan is committed to the repo (not a transient document)

### LU-1 verification
23. `renovate.json` exists at repo root
24. Config validates against Renovate schema
25. PR description documents how to activate Renovate (GitHub App URL)

### Cross-cutting
26. `npm test` passes after every individual change (commit-then-test pattern)
27. `npm run typecheck` passes
28. PR description summarizes all changes with before/after dependency table
29. No regressions in any module touched by the SDK bumps (Help, Capture, Attachments)

When all 29 verification steps pass, WP6 is complete.

---

## 5. Rules of engagement

### 5.1 Commit per change, test after each

Each individual change in this CR is a separate commit:
1. `chore(deps): remove unused drizzle-zod`
2. `chore(deps): move pino-pretty to devDependencies`
3. `chore(deps): bump @anthropic-ai/sdk to 0.95`
4. `chore(deps): bump @aws-sdk/* to 3.1044.0`
5. `docs: add dependency upgrade plan`
6. `chore: add renovate.json`

Each commit's tests pass before moving to the next. If a bump breaks something, the broken commit is revertable without affecting earlier work.

### 5.2 No major version upgrades sneak in

It's tempting during dependency surgery to "just bump this small major while we're here." Don't. The plan in section 3.6 sequences majors deliberately. Bumping out-of-sequence is a separate decision.

If a transitive dep update brings in a major version of a sub-dependency (rare but possible), that's automatic and acceptable. Direct major bumps in `package.json` are not.

### 5.3 Dependency upgrade plan lives in the repo

The plan is a living document. Update it as sprints complete. Each major version upgrade sprint starts by reading the plan, ends by updating it. This keeps the institutional memory in code review history rather than in any one person's head.

### 5.4 Renovate config is conservative by default

The config auto-merges only patch + minor for stable (≥1.0.0) deps. The intent is to keep the noise down while still capturing security-significant updates. As trust in the tool grows, the config can relax.

If Renovate generates noisy or low-value PRs, tune via `packageRules` rather than disabling the tool.

### 5.5 The Replit issue is upstream-blocked

`L-DEP-5` is filed and waited on. Don't try to vendor the SDK or fork it — that creates a maintenance liability worse than the original issue. The vulnerability is in dev-tooling transitive deps, not runtime, so the urgency is low.

### 5.6 Production build verification matters for `pino-pretty`

`pino-pretty` in dependencies isn't a behavioral bug — it's a classification one. Production builds already exclude it via `serverExternalPackages`. The fix is correctness of intent. The verification step (`NODE_ENV=production npm run build`) confirms no regression.

---

## 6. What is NOT in this CR

- **Major version upgrades** (planned, not executed)
- **Storybook upgrade** (waits on Storybook 10)
- **Vitest 3/4 upgrade** (planned in section 3.6)
- **Refactoring code that uses the bumped SDKs** (only the bumps; behavior preserved)
- **Adding Dependabot** if Renovate is chosen
- **Lock file optimization** (e.g., `npm dedupe`)
- **License compliance audit** (separate concern, flagged but not addressed in this CR)
- **Vendoring or forking dependencies** (not warranted)

---

## 7. Recommended sequence

1. Remove `drizzle-zod` (smallest, lowest risk)
2. Move `pino-pretty` to devDependencies + verify prod build
3. Bump `@anthropic-ai/sdk` + test affected paths
4. Bump AWS SDK packages + test attachment flows
5. File Replit upstream issue
6. Write `docs/dependency-upgrade-plan.md`
7. Add `renovate.json`
8. Final test pass + PR description with summary table

Each step independently shippable. If a bump breaks something, the order before it is unaffected.

---

## 8. Final note

Dependency surgery is the least exciting category in the audit but the one that prevents the most future pain. A codebase that drifts out of date on minor updates eventually faces a step-function major upgrade that's expensive and risky. The work here keeps the surface honest.

Renovate is the structural fix; the manual bumps are the immediate fix. Both belong.

Begin with section 3.1 (`drizzle-zod` removal).
