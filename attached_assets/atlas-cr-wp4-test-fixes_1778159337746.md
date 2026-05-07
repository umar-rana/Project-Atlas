# Replit Agent Prompt — Atlas CR: Fix Pre-Existing Test Failures (Audit WP4)

## Read this entire document before taking any action.

---

## 1. Overview

Tier-1 audit remediation. Closes one High-severity finding (TC-1). Effort M, Risk Low.

**Source:** `audit-reports/atlas-audit-2026-05-07.md` Work Package 4.

**Finding addressed:** **TC-1** — 33 tests across 4 test files fail on every run. These are pre-existing failures, not caused by Phase A audit work. They block coverage measurement and create noise that obscures real regressions.

**The four files:**

| File | Tests | Cause |
|---|---|---|
| `src/components/tasks/__tests__/task-list.test.tsx` | drag-related | jsdom does not implement `DataTransfer` for drag events |
| `src/components/tasks/__tests__/task-inspector.test.tsx` | mutation-related | tRPC mock setup missing for `tasks.update` |
| Capture service test file 1 | AI mock import | Import resolution issue |
| Capture service test file 2 | AI mock import | Same as above |

**Goal:** Move test suite from **318 passing / 33 failing** to **351 passing / 0 failing**.

**Out of scope for this CR:**
- Adding new tests (TC-2, TC-3, TC-4 — tests for uncovered routers, job handlers, additional E2E flows)
- Coverage tooling setup (TC-6 — runs after TC-1 closes)
- Test parallelization improvements (TC-5 — already acceptable)

**Estimated scope:** 2-3 days.

---

## 2. Stack constraints (do not deviate)

- Vitest 2.1.9 (do not upgrade — that's Tier 3 dependency surgery)
- React Testing Library
- jsdom test environment
- Existing Vitest config in `vitest.config.ts` is the baseline; modifications must be minimal and additive
- No major version dependency upgrades
- No schema changes
- No CI changes
- **No "fixing the underlying bug while we're here"** — if a test exposes a real bug, document it in PR description and file a separate ticket. This CR fixes the test infrastructure, not the application.

---

## 3. Detailed deliverables

### 3.1 Inventory the failures

Step 1: Run the test suite and capture exact failure output:

```bash
npx vitest run --reporter=verbose 2>&1 | tee /tmp/test-baseline.log
```

Document in the CR description:
- Total tests: X
- Passing: 318 (expected)
- Failing: 33 (expected)
- Skipped: Y (if any)
- Per-file breakdown of failure reasons

This baseline is the contract. After the fixes, the same command must show 351 passing, 0 failing.

### 3.2 Fix #1 — `task-list.test.tsx` (DataTransfer polyfill)

#### 3.2.1 Root cause

jsdom (Vitest's default DOM environment) doesn't implement `DataTransfer`. The drag-and-drop tests construct `DragEvent` instances or simulate native drag events, both of which depend on `DataTransfer` being available.

#### 3.2.2 Fix

Add a polyfill in the Vitest setup file. Locate the existing setup file (likely `src/test/setup.ts` or `vitest.setup.ts`). If absent, create one and reference it from `vitest.config.ts`'s `setupFiles`.

```ts
// vitest.setup.ts
import '@testing-library/jest-dom'

// jsdom does not implement DataTransfer; polyfill for drag-and-drop tests
class DataTransferPolyfill {
  data: Record<string, string> = {}
  types: string[] = []
  
  setData(format: string, data: string) {
    this.data[format] = data
    if (!this.types.includes(format)) this.types.push(format)
  }
  
  getData(format: string): string {
    return this.data[format] || ''
  }
  
  clearData() {
    this.data = {}
    this.types = []
  }
  
  // Add other methods if tests use them
  setDragImage = () => {}
  effectAllowed: 'all' | 'move' | 'copy' = 'all'
  dropEffect: 'move' | 'copy' | 'none' = 'move'
}

if (typeof DataTransfer === 'undefined') {
  // @ts-ignore
  global.DataTransfer = DataTransferPolyfill
}
```

#### 3.2.3 Verify

```bash
npx vitest run task-list.test.tsx
```

All previously-failing drag tests should pass. If a different drag-related failure remains (e.g., the test relies on a method the polyfill doesn't implement), extend the polyfill — don't replace the polyfill with a no-op.

### 3.3 Fix #2 — `task-inspector.test.tsx` (tRPC mock for `tasks.update`)

#### 3.3.1 Root cause

The test file mocks the tRPC client but the mock object is missing `tasks.update`. When the test renders a component that calls `trpc.tasks.update.useMutation(...)`, it fails because the path doesn't exist on the mock.

#### 3.3.2 Fix

Locate the tRPC mock setup in the test file (or a shared mock file). Extend the mock to include `tasks.update`:

```ts
const mockTrpc = {
  tasks: {
    list: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }) },
    update: { useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }) },
    // ... other procedures the test uses
  },
  // ... other routers
}
```

If the test file uses a shared mock factory in `src/test/trpc-mock.ts` or similar, add `tasks.update` there so other tests benefit.

#### 3.3.3 Verify

```bash
npx vitest run task-inspector.test.tsx
```

All previously-failing inspector tests should pass.

### 3.4 Fix #3 — Capture service tests (AI mock import resolution)

#### 3.4.1 Root cause

Two capture service test files have broken AI mock imports — likely a path that no longer resolves after a refactor moved `src/core/ai/index.ts` or its mock helper.

#### 3.4.2 Diagnostic

Run the failing tests with verbose output to see the exact import error:

```bash
npx vitest run capture --reporter=verbose
```

Common causes:
- Mock helper moved from `src/test/mocks/anthropic.ts` to `src/core/ai/__mocks__/index.ts` (or similar)
- `vi.mock()` path stale
- Anthropic SDK version bump changed import shape (per Phase A bumps)

#### 3.4.3 Fix

Find and update the import paths. If the mock helper was deleted or renamed, restore an equivalent. The mock should:
- Stub `callAI()` from `src/core/ai/index.ts`
- Return a deterministic test fixture (e.g., `{ task_title: 'Test', confidence: 0.9 }`)
- Track call counts for assertion

#### 3.4.4 Verify

```bash
npx vitest run capture
```

All previously-failing capture tests should pass.

### 3.5 Final verification

After all four fixes:

```bash
npx vitest run --reporter=verbose 2>&1 | tee /tmp/test-after.log
```

Expected output: **351 passing, 0 failing.**

If any test is still failing, the fix is incomplete — investigate before merging.

### 3.6 Coverage tooling (TC-6 unblock)

With tests passing, run:

```bash
npx vitest run --coverage
```

This generates a coverage report. The audit's TC-6 finding becomes addressable in a future CR — for this CR, just verify the command runs without errors and surfaces a coverage report. Don't act on the coverage data here.

If `vitest --coverage` requires a config addition, add it minimally:

```ts
// vitest.config.ts
test: {
  coverage: {
    reporter: ['text', 'html'],
    exclude: ['node_modules/', 'dist/', '.next/', 'e2e/'],
  },
}
```

---

## 4. Verification

1. Baseline test output captured: 318 passing, 33 failing, documented in PR description
2. Vitest setup file (`vitest.setup.ts` or equivalent) includes DataTransfer polyfill
3. Polyfill referenced from `vitest.config.ts` `setupFiles`
4. `npx vitest run task-list.test.tsx` passes (all drag tests green)
5. tRPC mock includes `tasks.update` (and any other previously-missing procedures surfaced by failures)
6. `npx vitest run task-inspector.test.tsx` passes
7. Capture service AI mock import paths corrected
8. `npx vitest run capture` passes
9. Full suite: `npx vitest run` shows **351 passing, 0 failing**
10. `npx vitest run --coverage` runs without configuration errors and produces an HTML report
11. Coverage config in `vitest.config.ts` excludes irrelevant directories
12. PR description includes before/after test counts
13. PR description documents any tests that exposed real bugs (filed as separate tickets)
14. `npm run typecheck` still passes

When all 14 verification steps pass, WP4 is complete.

---

## 5. Rules of engagement

### 5.1 Don't fix bugs the tests expose — file them

If during the test fix, a test reveals a real application bug (not just an infrastructure issue), the bug fix does NOT belong in this CR. Document it in the PR description with steps to reproduce, file a separate ticket, and move on.

This CR is about test infrastructure. Mixing in feature/bug work expands scope and hides the test fixes from review.

### 5.2 Polyfills should be focused

The DataTransfer polyfill should implement only what tests actually use. If tests later need new DataTransfer methods, extend the polyfill at that point. Don't add unused stubs preemptively.

### 5.3 Mock surface area

When extending tRPC mocks, add only the procedures the failing tests need plus any obvious siblings (e.g., if `tasks.update` is added, `tasks.create` and `tasks.delete` are usually adjacent — check whether other tests need them).

If a shared mock factory exists, prefer extending it. If multiple test files maintain duplicated mocks, that's a refactor candidate flagged in PR description but **not** fixed here.

### 5.4 Don't upgrade Vitest

The audit Tier 3 dependency surgery covers Vitest v3/v4. Doing it here mixes concerns. Stay on Vitest 2.1.9.

### 5.5 If a test is genuinely broken (not flaky, but conceptually wrong)

Document in PR. Don't delete the test. Don't `.skip` it. The audit's framing is "pre-existing failures" — they should be fixable. If something is truly unfixable in this scope, raise it before deciding.

---

## 6. What is NOT in this CR

- **New tests** for uncovered routers (TC-2 — separate sprint)
- **New tests** for job handlers (TC-3 — separate sprint)
- **Additional E2E coverage** (TC-4 — separate sprint)
- **Vitest version upgrade** (Tier 3 dependency surgery)
- **Application bug fixes** revealed by tests (file separate tickets)
- **Refactoring duplicated mock setup** (note in PR, address separately)
- **Acting on the coverage report** — generate it; don't act on it here

---

## 7. Recommended sequence

1. Capture baseline test output
2. Fix #1 (DataTransfer polyfill) — smallest, builds confidence
3. Fix #2 (tRPC mock) — straightforward
4. Fix #3 (capture AI mocks) — investigate, then fix
5. Run full suite; confirm 351 passing
6. Add coverage config if missing
7. Run with coverage; verify report generates
8. Document baseline → final in PR description

Each fix is independently shippable. If one is unexpectedly hard, the others can ship without blocking.

---

## 8. Final note

This CR is the unlocker. With tests green, every subsequent CR (WP1, WP2, WP3, etc.) gets a real signal from the test suite. Without this fix, "did my change break something?" is unanswerable.

Begin with section 3.1 (inventory the failures).
