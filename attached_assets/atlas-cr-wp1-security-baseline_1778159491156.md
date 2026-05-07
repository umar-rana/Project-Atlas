# Replit Agent Prompt — Atlas CR: Security Baseline (Audit WP1)

## Read this entire document before taking any action.

---

## 1. Overview

Tier-1 audit remediation. Closes two High-severity findings (H-SEC-1, H-SEC-2) plus two supporting findings (M-SEC-3, L-SEC-5). Effort S, Risk Low.

**Source:** `audit-reports/atlas-audit-2026-05-07.md` Work Package 1.

**Findings addressed:**
- **H-SEC-1** — `/api/help/chat` has no rate limit, bypasses cost tracking, accepts unbounded message history
- **H-SEC-2** — Application has no global HTTP security headers
- **M-SEC-3** — Pino logger has no `redact` configuration
- **L-SEC-5** — Email inbound webhook signature check skipped silently when env var absent (acceptable in dev, dangerous in prod)

**Out of scope for this CR:**
- CSP with nonce-based `script-src` (separate dedicated security sprint)
- SVG sanitization (M-SEC-4 — separate CR)
- AI cost tracking refactor beyond `/api/help/chat` (the structural lint rule mentioned in audit cross-cutting observation #3)

**Estimated scope:** 1-2 days.

---

## 2. Stack constraints (do not deviate)

- Next.js 15 App Router, TypeScript strict, Pino logger
- Existing rate-limiter pattern in `src/app/api/convert/import/route.ts` is the reference
- Existing `callAI()` wrapper in `src/core/ai/index.ts` is the canonical AI call surface
- No major version dependency upgrades
- No schema changes
- No CI changes

---

## 3. Detailed deliverables

### 3.1 Rate limit on `/api/help/chat` (H-SEC-1)

#### 3.1.1 Per-user rate limit

Match the pattern in `src/app/api/convert/import/route.ts`:
- **20 requests per minute per user** (Clerk user_id keyed)
- Returns `429 Too Many Requests` with `Retry-After` header when exceeded
- Use the same in-memory `Map<string, { count; resetAt }>` approach for now (the audit's M-SEC-3 / SO-3 about Redis-backed rate limiting is a separate sprint)

The 20/min limit is suitable for human chat usage; an AI assistant is not a high-frequency endpoint.

#### 3.1.2 Message truncation

Before sending to Anthropic, truncate the `messages` array to **the last 20 turns**.

If a user sends a longer history (e.g., 50 turns), keep only the most recent 20. This prevents replay-style cost amplification where a long conversation pays the input-token cost on every turn.

Document the truncation behavior in a code comment at the trim point.

#### 3.1.3 Route through `callAI()`

The current implementation creates `new Anthropic()` directly. Replace with the canonical `callAI()` wrapper from `src/core/ai/index.ts`.

This ensures:
- Help chat calls write to `AICallLog`
- Help chat calls count against the per-user `ai_budget_usd` cap
- Help chat calls appear on the `/usage` spending chart
- A single point for future model routing changes

Choose the appropriate `task` string for the `TASK_MODEL_MAP` entry — likely `'help_chat'` mapping to Haiku by default.

**Note:** the streaming response shape must be preserved. If `callAI()` doesn't currently support streaming, extend it to do so — do not bypass it. The audit explicitly flagged this as a structural gap that must close.

#### 3.1.4 Audit log

Add an `AuditLog` entry for help chat usage at the end of each successful exchange:
- `action: 'help_chat_message'`
- `meta: { model, input_tokens, output_tokens, cost_usd }`

This is a low-volume signal but useful for spotting abuse patterns.

### 3.2 HTTP security headers (H-SEC-2)

In `next.config.mjs`, extend the `headers()` async function to apply three baseline headers to **all routes**:

```js
async headers() {
  const baseline = [
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
  
  return [
    {
      source: '/:path*',
      headers: baseline,
    },
    // ... preserve existing entries (e.g., Cache-Control on /api/*, CSP on /api/embed/gist)
  ];
}
```

#### 3.2.1 What's deliberately NOT included in this CR

- **`Strict-Transport-Security`** — needs deployment-level confirmation that all traffic is HTTPS-served. Add as a separate one-line PR after confirming.
- **`Content-Security-Policy`** with `script-src` — requires nonce-based middleware setup that touches the React rendering pipeline. Dedicated sprint.
- **`Permissions-Policy`** — useful but not in this baseline.

Document these omissions in a code comment so the next reader knows they're intentional, not forgotten.

### 3.3 Pino redact configuration (M-SEC-3)

In `src/core/logging/index.ts`, extend the Pino options object with a `redact` array:

```ts
const logger = pino({
  // ... existing options
  redact: {
    paths: [
      'access_token',
      'refresh_token',
      'token',
      'password',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.access_token',
      '*.refresh_token',
      '*.encrypted',
      '*_encrypted',
    ],
    censor: '[REDACTED]',
  },
});
```

The `*.encrypted` and `*_encrypted` wildcards cover the encrypted token columns from `GoogleDriveOAuthToken`, `GoogleCalendarOAuthToken`, and any future encrypted-blob storage.

#### 3.3.1 Verification helper

Add a small smoke test in `src/core/logging/__tests__/redact.test.ts`:

```ts
it('redacts known sensitive fields', () => {
  const buf = []
  const log = createTestLogger(buf)
  log.info({ access_token: 'abc', user_id: 'u1' })
  expect(buf[0]).toContain('[REDACTED]')
  expect(buf[0]).toContain('u1')
  expect(buf[0]).not.toContain('abc')
})
```

This verifies the redaction works end-to-end; without it, a future config change could silently regress.

### 3.4 Resend webhook secret enforcement (L-SEC-5)

In `src/app/api/email/inbound/route.ts`, replace the silent dev-mode skip with explicit env-aware behavior:

```ts
function verifySignature(payload, signature) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      log.error({}, 'RESEND_WEBHOOK_SECRET is required in production')
      throw new Error('RESEND_WEBHOOK_SECRET is required in production')
    }
    log.warn({}, 'RESEND_WEBHOOK_SECRET not set — skipping signature verification (development only)');
    return true;
  }
  
  // ... existing verification logic
}
```

The `throw` in production hard-fails the request rather than accepting unsigned input. This is the safe default.

---

## 4. Verification

1. `/api/help/chat` returns 429 after 20 requests in 60 seconds from the same authenticated user
2. 429 response includes `Retry-After` header
3. `messages` array is truncated to last 20 entries before Anthropic call
4. Code comment documents the truncation behavior
5. `/api/help/chat` calls go through `callAI()` from `src/core/ai/index.ts`
6. `AICallLog` rows written for each help chat call
7. Help chat usage counts against `ai_budget_usd` cap
8. Help chat usage appears on `/usage` page
9. Streaming response shape preserved (verify by manual test in Help Center UI)
10. `AuditLog` entries written: `help_chat_message` with model and token counts in meta
11. `next.config.mjs` `headers()` returns `X-Frame-Options: SAMEORIGIN` for `/`
12. Returns `X-Content-Type-Options: nosniff` for `/`
13. Returns `Referrer-Policy: strict-origin-when-cross-origin` for `/`
14. Existing CSP on `/api/embed/gist` still present
15. Existing Cache-Control on `/api/*` still present
16. Code comment documents intentional omissions (HSTS, CSP, Permissions-Policy)
17. Pino logger configured with `redact.paths` covering tokens, passwords, auth headers, and `*_encrypted` patterns
18. Pino redact uses `[REDACTED]` censor string
19. Smoke test `redact.test.ts` verifies tokens are redacted but other fields preserved
20. `RESEND_WEBHOOK_SECRET` missing in production → hard-fail with logged error
21. `RESEND_WEBHOOK_SECRET` missing in development → continues with warn-level log
22. `npm run typecheck` passes
23. `npm test` passes (existing failures unchanged; new redact test passes)

When all 23 verification steps pass, WP1 is complete.

---

## 5. Rules of engagement

### 5.1 The rate limiter is in-memory; that's intentional for now

The audit also flagged in-memory rate limiters as M-SEC / SO-3 because they don't survive process restarts. Moving rate state to Redis or a managed service is a separate sprint. For this CR, mirror the existing in-memory pattern.

Document in a code comment that the in-memory limiter is a known limitation tracked separately.

### 5.2 Don't bypass `callAI()` because streaming is hard

If `callAI()` doesn't support streaming, extend it. Do not work around it with a parallel direct `Anthropic` client. The whole point of WP1 is closing the structural gap where help chat costs were invisible to budgets and dashboards.

### 5.3 Header values are deliberate, not maximalist

`X-Frame-Options: SAMEORIGIN` (not `DENY`) — Atlas may need to embed itself in trusted iframes later (e.g., a Help Center widget shown in another Atlas surface).

`Referrer-Policy: strict-origin-when-cross-origin` (not `no-referrer`) — preserves analytics utility while protecting the path.

If a future product need requires looser headers, it gets discussed and documented; default tight.

### 5.4 Pino redact paths use Pino's path syntax

Pino path syntax supports nested keys (`req.headers.authorization`) and wildcard prefixes (`*.access_token`). Don't confuse this with regex. Test the redact behavior with the smoke test rather than reasoning about it from docs.

### 5.5 Email webhook hard-fail is correct in production

A misconfigured production environment that silently accepts unsigned webhooks is worse than a 500 error. The 500 surfaces immediately; the silent acceptance becomes a long-running security hole.

If the deployment runbook needs updating to ensure `RESEND_WEBHOOK_SECRET` is set, that's a runbook problem, not a code problem.

---

## 6. What is NOT in this CR

- **CSP `script-src` setup** — separate sprint, requires nonce middleware
- **Strict-Transport-Security** — separate one-line PR after deployment HTTPS confirmation
- **Permissions-Policy** — not in baseline scope
- **Redis-backed rate limiting** — separate sprint (audit SO-3)
- **SVG sanitization** — M-SEC-4, separate CR
- **AI cost tracking enforcement via lint rule or middleware** — structural improvement flagged in audit; separate CR
- **Refactoring `next.config.mjs` `headers()` for clarity** — keep changes minimal

---

## 7. Recommended sequence

1. Pino redact config + smoke test (smallest, builds confidence)
2. HTTP security headers in `next.config.mjs`
3. Resend webhook secret enforcement
4. Help chat rate limiter (modeled on existing pattern)
5. Help chat message truncation
6. Help chat routing through `callAI()` — extend `callAI()` for streaming if needed
7. Help chat AuditLog entries
8. Run full test suite, verify no regressions

Each step shippable independently. If `callAI()` streaming extension is non-trivial, ship steps 1-5 in one PR, step 6+7 in a follow-up.

---

## 8. Final note

This CR closes the immediate security gaps without taking on larger structural work. The audit cross-cutting observations (#2 on in-memory state, #3 on AI cost coverage gaps) are noted for future sprints — this CR addresses the symptoms, not the architectural patterns.

Begin with section 3.3 (Pino redact).
