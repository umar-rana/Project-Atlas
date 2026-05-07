# Replit Agent Prompt — Atlas CR: Replace expr-eval (Audit WP2)

## Read this entire document before taking any action.

---

## 1. Overview

Tier-1 audit remediation. Closes the only High-severity dependency finding (H-DEP-1). Effort M, Risk Medium.

**Source:** `audit-reports/atlas-audit-2026-05-07.md` Work Package 2.

**Finding addressed:** **H-DEP-1** — `expr-eval` is flagged by `npm audit` as high severity, no upstream fix is available, and the package is unmaintained. It must be replaced.

**Where it's used:** Tables formula column type (Wave 4c). The formula evaluator parses expressions like `{Quantity} * {UnitPrice}` and resolves them at query time.

**Risk: Medium** because formula columns are user-facing; behavior must be preserved exactly. Tests carry the burden of correctness.

**Estimated scope:** 3-5 days.

---

## 2. Stack constraints (do not deviate)

- Existing formula tests in `src/server/routers/__tests__/tables-formula.test.ts` are the contract — they pass before this CR, they pass after, no exceptions
- TypeScript strict, Prisma against Neon Postgres
- No major version dependency upgrades elsewhere in this CR
- No schema changes
- The user-facing formula syntax does not change. Only the implementation underneath changes.

---

## 3. Replacement strategy

### 3.1 Two replacement options

**Option A — `mathjs`** (actively maintained, MIT, ~250KB)
- Pros: well-tested, permissive license, supports the full operator + function set Atlas exposes, clear migration path
- Cons: bundle size larger than `expr-eval`; tree-shakable but care needed in import strategy
- Recommended unless bundle size is a binding constraint

**Option B — Narrow inline evaluator** (custom code, no dependency)
- Pros: zero dependency, smallest bundle, full control
- Cons: writing a parser is harder than it looks; security implications (eval-style execution) need care
- Recommended only if Option A bundle size proves prohibitive

#### 3.1.1 Recommendation: Option A first

Try `mathjs` first. If bundle analyzer shows the import added more than ~80KB to the relevant chunk, fall back to Option B. Document the decision in code comments and the CR PR description.

### 3.2 Scope of formula features used by Atlas

The Wave 4c formula spec defined a curated set:

**Operators:** `+`, `-`, `*`, `/`, `%`, `(`, `)`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`

**Functions:** `IF`, `CONCAT`, `ROUND`, `ABS`, `MIN`, `MAX`, `DAYS_BETWEEN`, `NOW`, `LEN`, `UPPER`, `LOWER`

**References:** `{ColumnName}` resolved to row values at evaluation time

**Return types:** `number`, `text`, `date`, `boolean`

This is the contract. The replacement must support all of it. Anything else `expr-eval` happens to support but Atlas doesn't expose is irrelevant.

---

## 4. Detailed deliverables

### 4.1 Inventory call sites

Step 1: `grep -r 'expr-eval' src/` to identify every call site. Expected locations from audit:
- `src/core/tables/formula.ts` (or wherever the evaluator lives)
- Possibly tests in `src/server/routers/__tests__/tables-formula.test.ts`

Document the inventory in the CR description before changing anything.

### 4.2 Build the new evaluator

In `src/core/tables/formula.ts` (rename existing file to `formula-legacy.ts` if convenient for diff review, or work in-place):

#### 4.2.1 With Option A (mathjs)

```ts
import { create, all, MathJsInstance } from 'mathjs'

// Limit to a tree-shaken safe instance — exclude eval, parse, etc.
const math = create(all, {
  // ... safe config
})

// Restrict the function set to Atlas's allowed list.
const ALLOWED_FUNCTIONS = new Set([
  'if', 'concat', 'round', 'abs', 'min', 'max',
  'daysbetween', 'now', 'len', 'upper', 'lower',
])

// Custom function implementations — Atlas's IF, CONCAT, etc.
math.import({
  IF: (cond: any, then: any, els: any) => (cond ? then : els),
  CONCAT: (...args: any[]) => args.map(String).join(''),
  DAYS_BETWEEN: (a: Date, b: Date) => differenceInDays(a, b),
  // ... etc
}, { override: true })

export function evaluateFormula(
  expression: string,
  rowCells: Record<string, unknown>,
  returnType: 'number' | 'text' | 'date' | 'boolean'
): { value: unknown; error?: string } {
  // Pre-process {ColumnName} → values
  // Parse and evaluate via mathjs
  // Coerce return type
  // Catch errors and return { error }
}
```

Restrict the mathjs instance to a safe subset. Disable `eval`, `parse` (for arbitrary string parsing), and any function that could escape sandbox.

#### 4.2.2 With Option B (inline evaluator)

If pursued, the parser uses a recursive-descent approach:
- Tokenizer for numbers, strings, identifiers, operators
- Parser building an AST
- Evaluator walking the AST
- Each function in `ALLOWED_FUNCTIONS` is a registered handler

Reference an existing small parser library structure (e.g., parsimmon, peggy) for inspiration but write the implementation directly — pulling in another parser library defeats the purpose of removing `expr-eval`.

### 4.3 Preserve the public function signature

The exported `evaluateFormula(expression, rowCells, returnType)` signature must not change. Every caller continues to work without modification.

### 4.4 Test parity

Run `src/server/routers/__tests__/tables-formula.test.ts` before and after:
- All tests passing → migration successful
- Any test failure → fix the new evaluator until tests pass

If tests are missing for any operator or function in section 3.2, **add them in this CR** before swapping evaluators. The tests are the contract; without comprehensive coverage, the migration is unsafe.

Suggested test cases to verify:

| Category | Cases |
|---|---|
| Arithmetic | `2 + 3`, `10 / 4`, `7 % 3`, parens precedence |
| Comparison | `5 > 3`, `'a' == 'a'`, `5 != 3` |
| Logical | `true && false`, `!true`, `(x > 0) || (y > 0)` |
| IF | `IF(true, 1, 2)`, `IF({col} > 0, 'pos', 'neg')` |
| String | `CONCAT('a', 'b')`, `LEN('hello')`, `UPPER('a')`, `LOWER('B')` |
| Math | `ROUND(1.555, 2)`, `ABS(-5)`, `MIN(1,2,3)`, `MAX(...)` |
| Date | `DAYS_BETWEEN({start}, {end})`, `NOW()` |
| Column refs | `{Quantity} * {UnitPrice}` |
| Errors | division by zero, missing column, type mismatch |

### 4.5 Remove `expr-eval` from `package.json`

```bash
npm uninstall expr-eval
```

Confirm `package-lock.json` no longer contains the package. Run `npm audit` — the H-DEP-1 advisory should be gone.

### 4.6 Bundle size check

Run `ANALYZE=true npm run build` before and after. Document the size delta in the CR PR description:
- Before (with `expr-eval`)
- After (with mathjs OR inline)
- Delta

If mathjs adds >80KB to the relevant client chunk, consider Option B fallback.

### 4.7 Audit log breadcrumbs

When formula evaluation throws, log via Pino at `warn` level with the expression (truncated to 200 chars), the column name, and the error message. Useful for debugging post-migration regressions.

```ts
log.warn({
  formula_eval_error: true,
  table_id: tableId,
  column_id: columnId,
  expression: expression.slice(0, 200),
  error: err.message,
}, 'Formula evaluation failed')
```

---

## 5. Verification

1. `expr-eval` no longer appears in `package.json` or `package-lock.json`
2. `grep -r 'expr-eval' src/` returns zero results
3. `npm audit` no longer reports H-DEP-1
4. New evaluator at `src/core/tables/formula.ts` exports `evaluateFormula` with unchanged signature
5. Replacement library (mathjs OR inline) chosen and decision documented in code comment
6. All operators from section 3.2 work: `+`, `-`, `*`, `/`, `%`, `(`, `)`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`
7. All functions from section 3.2 work: `IF`, `CONCAT`, `ROUND`, `ABS`, `MIN`, `MAX`, `DAYS_BETWEEN`, `NOW`, `LEN`, `UPPER`, `LOWER`
8. `{ColumnName}` references resolve correctly
9. Return type coercion works for `number`, `text`, `date`, `boolean`
10. Errors return `{ error }` object, not throw — formula cells display `#ERROR`
11. Comprehensive test coverage in `tables-formula.test.ts` covers section 4.4 cases
12. All formula tests pass: `npx vitest run tables-formula.test.ts`
13. Full test suite passes (existing failures from TC-1 unchanged)
14. Bundle size delta documented (before/after via bundle analyzer)
15. Pino warn-level log on evaluation errors with truncated expression context
16. Manual test: open a formula column in the live app, verify computed values render correctly
17. Manual test: introduce a formula error, verify cell displays `#ERROR` with hover hint
18. `npm run typecheck` passes

When all 18 verification steps pass, WP2 is complete.

---

## 6. Rules of engagement

### 6.1 Tests are the contract

Do not change formula behavior. If `expr-eval` and the replacement disagree on edge cases (operator precedence, null handling, integer vs float division), the audit-pre-existing test cases define correct behavior. Add tests that lock in the current behavior before swapping evaluators.

If a behavioral change is genuinely required (e.g., the new library has a stricter type check that surfaces a latent bug), document it in the CR description and surface as a separate decision.

### 6.2 The mathjs instance must be restricted

Out of the box, mathjs is a calculator with `eval` and string-to-AST capabilities — overkill and a security surface. Configure the instance to disable:
- `eval()` function
- `parse()` function (for arbitrary string input)
- Any function not in Atlas's allowed list

Document the restriction config in code comments.

### 6.3 No clever caching

The current evaluator runs at query time per row. Don't introduce evaluation caching as part of this CR — that's a separate performance discussion. Keep the migration scope narrow.

### 6.4 Behavior preservation > code elegance

If preserving exact behavior requires a slightly awkward shim (e.g., a wrapper around `mathjs.IF` to match `expr-eval`'s null-handling), prefer the shim over a refactor. Migration commits should be reviewable and revertable.

---

## 7. What is NOT in this CR

- **Adding new formula functions** — the function set is locked at the Wave 4c definition
- **Cross-row formula references** — out of scope (footer aggregations handle that)
- **Cross-table formula references** — relations deferred indefinitely
- **Caching evaluation results** — separate discussion
- **Refactoring formula UI or schema** — touch only the evaluator implementation
- **Migrating other dependencies in this CR** — focused scope

---

## 8. Recommended sequence

1. Inventory all `expr-eval` call sites with `grep`
2. Audit `tables-formula.test.ts` coverage; add tests where gaps exist (commit before swap)
3. Run tests against current `expr-eval` implementation; capture baseline
4. Implement Option A (mathjs) replacement with restricted config
5. Run tests; iterate until parity
6. Bundle size check; if mathjs is acceptable, proceed; else fall back to Option B
7. Add error-path Pino logging
8. Manual test in live app (formula column display, error case)
9. Remove `expr-eval` from `package.json` and lockfile
10. Final `npm audit` check; H-DEP-1 should be gone
11. PR with bundle size delta and migration notes in description

---

## 9. Final note

This is a focused dependency surgery. The risk lives in behavioral parity — a formula that quietly returns a different value after migration is worse than a formula that throws (the throw at least surfaces the regression). Test coverage is the moat.

Begin with section 4.1 (inventory).
