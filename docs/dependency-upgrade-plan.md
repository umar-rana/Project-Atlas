# Dependency Upgrade Plan

**Last updated:** 2026-05-07  
**Source:** Atlas codebase audit `audit-reports/atlas-audit-2026-05-07.md` (findings L-DEP-6, M-DEP-3, M-DEP-4)

This document sequences the major-version upgrades that are planned but not yet applied. Each sprint is self-contained and should be merged before the next begins. No two major upgrades should be batched together.

---

## Summary table

| Package | Current | Target | Sprint | Risk |
|---|---|---|---|---|
| `vitest` | 2.1.9 | 4.x | Sprint 1 | Medium — test API changes |
| `prisma` / `@prisma/client` | 5.22.0 | 7.x | Sprint 2 | High — migration engine rewrite |
| `tailwindcss` | 3.4.19 | 4.x | Sprint 3 | High — config format changed |
| `next` | 15.5.x | 16.x | Sprint 4 | High — RSC / bundler changes |
| `zod` | 3.25.x | 4.x | Post-Sprint 4 | High — breaking API, wide surface area |
| `typescript` | 5.9.x | 6.x | Post-Sprint 4 | Medium — stricter defaults |
| `lucide-react` | 0.469.0 | 1.x | Post-Sprint 4 | Low — icon name changes |
| `pino` | 9.14.0 | 10.x | Post-Sprint 4 | Low — transport API changes |
| `sonner` | 1.7.4 | 2.x | Post-Sprint 4 | Low — breaking toast API |
| `@hookform/resolvers` | 3.10.0 | 5.x | Post-Sprint 4 | Low — must match react-hook-form major |

---

## Sprint 1 — Vitest 4

**Rationale:** Vitest 4 resolves the `esbuild <0.25` vulnerability (GHSA-67mh-4wv8-2f99). Dev toolchain only — no production impact.

**Steps:**
1. Read Vitest 3 and 4 migration guides; identify breaking changes in test APIs.
2. Update `vitest` to `^4.x` and `@vitejs/plugin-react` to a compatible version.
3. Fix any broken test helpers or `vi.*` API call sites.
4. Run `npm test` — all 318+ passing tests must still pass.
5. Confirm `npm audit --omit=dev` no longer reports the `esbuild` advisory.

**Risk notes:**
- Vitest 4 removed the `globals` option; explicit imports of `describe`, `it`, `expect` may be required.

> Note: The previous version of this plan had a Sprint 1 entry covering Storybook 10 (which would have resolved the `elliptic` advisory). Storybook has since been removed from the project; that advisory is no longer present.

---

## Sprint 2 — Prisma 7

**Rationale:** Prisma 7 rewrites the query engine in Rust and changes the migration API. It also improves type inference and query performance.

**Prerequisites:** Sprint 1 complete (tests must pass before touching the ORM).

**Steps:**
1. Read the Prisma 5 → 7 migration guide (note: Prisma 6 is a stepping stone — check if direct 5→7 is supported).
2. Update `prisma` and `@prisma/client` to `^7.x`.
3. Run `npx prisma generate` and fix any schema/type incompatibilities.
4. Audit all `db.$queryRaw` / `$executeRaw` call sites for API changes.
5. Run `npm run validate:migrations` and `npm test`.
6. Run a full integration test against a local Postgres instance.
7. Confirm the pg-boss job queue (`pg-boss@10.x`) remains compatible.

**Risk notes:**
- The `@prisma/client` generated types change shape in v7; `Prisma.XxxGetPayload` usages may need updating.
- The migration engine CLI commands may change; update any scripts in `scripts/`.

---

## Sprint 3 — Tailwind CSS 4

**Rationale:** Tailwind 4 uses a CSS-native engine, eliminating the PostCSS plugin and dramatically changing the config format. This resolves the bundled `postcss` vulnerability inherited from `next` (separate issue, but reduces noise).

**Prerequisites:** Sprint 2 complete.

**Steps:**
1. Read the Tailwind 4 migration guide; note that `tailwind.config.ts` is replaced by CSS `@theme` declarations.
2. Use the official codemod: `npx @tailwindcss/upgrade@next --force`.
3. Review and manually adjust any theme tokens not handled by the codemod.
4. Verify `tailwindcss-animate` has a compatible v4 release; replace or inline if not.
5. Verify `prettier-plugin-tailwindcss` has a v4-compatible release.
6. Run `npm run build` (production) and visually inspect all major views.
7. Run `npm test` and `npm run type-check`.

**Risk notes:**
- `eslint-plugin-tailwindcss` may not support v4 immediately; disable or update the ESLint rule if it errors.
- Arbitrary value syntax (`bg-[#hexcode]`) is unchanged, but JIT purge behavior differs.
- The `@apply` directive changes behavior in v4; audit all CSS files using it.

---

## Sprint 4 — Next.js 16

**Rationale:** Next.js 16 includes improved React Server Component support and performance improvements. It is the last major upgrade in the planned sequence.

**Prerequisites:** Sprint 3 complete (Tailwind 4 must be stable first; both affect build output).

**Steps:**
1. Read the Next.js 15 → 16 migration guide.
2. Update `next` to `^16.x` and `eslint-config-next` to match.
3. Review any changes to the `App Router` API, `server actions`, or `metadata` conventions.
4. Run `npm run build` (production) and validate the build output.
5. Run `npm run type-check` and `npm test`.
6. Update `@clerk/nextjs` if a Next.js 16-compatible version is required.
7. Smoke-test auth flows (sign-in, sign-out, session expiry).

**Risk notes:**
- `serverExternalPackages` in `next.config.mjs` may need review for v16 changes.
- `@next/bundle-analyzer` may need a compatible release.
- Next.js 16 may change how Turbopack is invoked; update `dev` script if needed.

---

## Post-Sprint 4 — Smaller majors

These upgrades have low coupling to each other and can be done in any order after Sprint 4 lands.

### Zod 4

- Read the Zod v4 migration guide (`https://zod.dev/v4`).
- Run the official codemod if available.
- Wide surface area: all tRPC routers use Zod schemas. Allocate a full regression pass.
- `zod-validation-error` must have a Zod v4 compatible release; check before upgrading.
- `@hookform/resolvers` v5 is required for Zod v4 integration; upgrade together.

### TypeScript 6

- Read the TypeScript 6 release notes for stricter defaults.
- Update `typescript` to `^6.x` and `@types/node`, `@types/react`, `@types/react-dom` to compatible versions.
- Run `npm run type-check`; resolve any new errors introduced by stricter checking.
- Review `tsconfig.json` for any deprecated options removed in v6.

### lucide-react 1.x

- Icon names changed significantly in the 0.x → 1.x transition.
- Run the official name-change codemod or diff the icon name registry.
- Visually inspect the icon rail and all icon button usages after upgrade.

### pino 10

- Transport API changes; verify `pino-pretty` (now in `devDependencies`) is still compatible.
- Update the logger in `src/core/logging/index.ts` if `transport` options change.

### sonner 2

- Toast API breaking changes; review all `toast()` call sites.
- Verify the `<Toaster>` provider props haven't changed.

---

## Inter-sprint risk notes

- **Do not batch sprints.** Each sprint must merge and stabilize (≥1 week in staging) before the next begins.
- **Lock the lockfile** between sprints: after each sprint, commit `package-lock.json` and verify Renovate does not auto-merge unplanned majors.
- **Database migrations** (Sprint 2) require coordination with the deployed environment. Apply `prisma migrate deploy` in production only after a successful staging run.
- **Tailwind 4 + Next.js 16 CSS output changes** may require a visual regression pass on all themes (light/dark).
- The test baseline must remain ≥ 318 passing tests throughout all sprints.
