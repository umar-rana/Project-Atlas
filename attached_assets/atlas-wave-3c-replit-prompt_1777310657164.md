# Replit Agent Prompt — Wave 3c: Tasks Module (Capture Intelligence)

## Read this entire prompt before taking any action.

---

## 1. Wave 3c Overview

Wave 3a shipped GTD core. Wave 3b added Forecast, Review, Completed, folders, and sequential project filtering. Tasks is now genuinely usable; this wave makes it intelligent — but in a deliberately local-first way that minimizes dependence on external AI APIs.

**Wave 3c adds three intelligence features to capture, layered as a hybrid pipeline:**

- **Email-to-inbox** — send an email to a dedicated address, it becomes an Inbox item
- **Local-first capture parsing** — the bulk of parsing work happens locally with zero cost (chrono-node for dates, regex for references, compromise.js for entity extraction, keyword matching for urgency)
- **AI fallback for hard cases** — only when local parsing can't structure the input, fall back to Claude Haiku for the remaining 20-30% of captures

By end of Wave 3c, capture becomes magic AND most captures cost zero in API calls. Type "Buy groceries tomorrow" and chrono + regex handle it locally. Type "the thing Ahmed mentioned about Q2 expansion that needs follow-up next week" and AI fills in what local parsing can't infer.

This architectural choice reduces AI dependency by an estimated 70-80% compared to a pure-AI approach, while keeping quality acceptable through a clean layered fallback.

---

## 2. Pre-requisites

Before starting Wave 3c:

- Wave 3a and 3b complete
- Atlas in real daily use for at least 2-3 weeks of GTD
- Resend account configured with `atlas.insightive.io` domain verified for transactional and inbound parsing
- Wave 1's AI abstraction layer functional with Claude (Haiku tier configured)
- AICallLog logging working

---

## 3. Stack additions

| Layer | Technology | Notes |
|---|---|---|
| Email inbound | **Resend Inbound Parsing** | Domain configured; needs route setup |
| Date parsing | **chrono-node** | Robust JS NLP date library, fast, zero cost |
| Entity extraction | **compromise** | Lightweight (~250KB) JS NLP for NER and POS tagging, zero cost |
| Email parsing | **mailparser** | Standard library for RFC 2822 email parsing |

**Critical architectural note:** AI is the *last resort* in this wave's parsing pipeline, not the default. The vast majority of captures should be fully parsed locally. AI runs only on captures that local parsing can't structure cleanly.

---

## 4. Wave 3c Deliverables

### 4.1 Schema additions

```prisma
model EmailCapture {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  from_email        String
  from_name         String?
  to_email          String
  subject           String
  
  body_text         String?
  body_html         String?
  
  resend_email_id   String?
  received_at       DateTime  @db.Timestamptz
  
  status            String    @default("pending")  // pending | processed | failed | discarded
  processing_error  String?
  
  created_task_id   String?   @db.Uuid
  attachment_ids    String[]  @db.Uuid
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  
  @@index([user_id, status, received_at])
  @@index([resend_email_id])
}

model CaptureParseLog {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  source            String    // "modal" | "quick_add" | "email" | "api"
  raw_text          String
  
  // Parsing tier used
  parse_tier        String    // "local_only" | "local_plus_ai" | "ai_fallback"
  local_confidence  Decimal?  @db.Decimal(3, 2)  // 0.00-1.00, how confident local parsing was
  
  // Extracted fields
  parsed_title      String?
  parsed_due_date   DateTime? @db.Timestamptz
  parsed_defer_date DateTime? @db.Timestamptz
  parsed_project_hint  String?
  parsed_project_id    String?  @db.Uuid
  parsed_contexts   String[]
  parsed_tags       String[]
  parsed_person_refs String[]
  parsed_flagged    Boolean?
  
  // AI metadata (only populated if AI was called)
  ai_called         Boolean   @default(false)
  model_used        String?
  input_tokens      Int?
  output_tokens     Int?
  estimated_cost_usd Decimal? @db.Decimal(10, 6)
  duration_ms       Int
  
  task_id           String?   @db.Uuid
  user_accepted     Boolean?
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  
  @@index([user_id, created_at])
  @@index([parse_tier, created_at])  // For monitoring AI usage rate
}
```

The `parse_tier` field tracks which path each capture took. After a few weeks of use, you can query: "What % of captures are going to AI fallback?" to validate the local-first strategy is working.

**Additionally**, add a field to the User table for the user's adjustable confidence threshold:

```prisma
// Add to User model:
ai_confidence_threshold  Decimal  @default(0.70) @db.Decimal(3, 2)
```

This lets users tune the local-vs-AI balance from the strategy dashboard.

Migrate the schema.

### 4.2 The hybrid parsing pipeline

This is the architectural heart of Wave 3c. Build it in `core/capture/parser/`:

```
core/capture/parser/
  index.ts              # Main entry point — orchestrates the pipeline
  tier-1-local.ts       # Local-only parsing (the workhorse)
  tier-2-ai.ts          # AI fallback (called only when needed)
  confidence.ts         # Decides whether Tier 1 was good enough or Tier 2 needed
  types.ts              # ParsedCapture interface, ConfidenceScore type
  fallback.ts           # Hard-fallback when even AI fails
```

**Pipeline flow:**

```
1. Receive raw text
2. Run Tier 1 (local) parsing
3. Compute local confidence score
4. If confidence >= 0.7: DONE, use Tier 1 result
5. If confidence < 0.7 AND user has AI enabled AND under cost limit:
   - Run Tier 2 (AI), pass Tier 1 results as hints
   - Use AI result, augmented by Tier 1
6. If confidence < 0.7 AND AI unavailable:
   - Use Tier 1 result as-is, mark as low-confidence
   - Show subtle indicator in capture toast: "Captured (basic parse)"
7. Save CaptureParseLog with parse_tier, confidence, and metadata
```

**Confidence scoring:**

Tier 1 is "confident" when it has extracted enough structured data:

```typescript
interface LocalParseConfidence {
  score: number  // 0.0 to 1.0
  signals: {
    has_clear_title: boolean         // Title is non-empty after metadata stripped
    has_date_or_no_date_implied: boolean  // Either chrono found a date, or no date words present
    has_clear_action_verb: boolean   // compromise found a verb at start
    references_resolved: boolean     // All #tags and @people resolved cleanly
    no_ambiguous_pronouns: boolean   // No "it", "this thing", "that one" without antecedent
    text_short_enough: boolean       // Under ~100 chars (long captures = ambiguity)
  }
}
```

Confidence is high (≥0.7) when most signals are positive. Low when the input is ambiguous, long, or has unresolved references.

Examples:
- "Buy groceries tomorrow" → confidence 0.95 (clear, all signals positive)
- "Call Ahmed about Q2 #urgent" → confidence 0.85 (clear action, has tag, person ref will resolve when People ships)
- "the thing we discussed last week needs follow-up" → confidence 0.30 (vague, ambiguous "thing", "we", "last week" relative)
- "review proposal end of next month" → confidence 0.75 (chrono handles "end of next month", action clear)

### 4.3 Tier 1: local parsing (the workhorse)

Build this first; it must handle the majority of captures with zero AI cost.

**Components:**

**A. Date extraction (chrono-node):**

```typescript
import * as chrono from 'chrono-node'

function extractDates(text: string, userTimezone: string): {
  due_date?: Date
  defer_date?: Date
  remaining_text: string  // text with date references removed
}
```

chrono handles:
- Specific: "March 15", "next Tuesday", "Friday"
- Relative: "tomorrow", "in 3 weeks", "next month", "in 2 days"
- Times: "at 2pm", "Friday at 9am"
- Combinations: "next Tuesday afternoon", "tomorrow morning"
- Common abbreviations: "EOD" (end of day), "EOW" (end of week), "EOM" (end of month)
- Quarters: "end of Q2", "next quarter" — use quarter helper logic
- Defer hints: "after [date]" implies defer; "before [date]" implies due

Default time-of-day:
- Date with no time and "due" implied → 23:59 (end of day) in user's timezone
- Date with "morning" → 9am
- Date with "afternoon" → 2pm
- Date with "evening" → 6pm
- "EOD" → 5pm (working day end)
- "EOW" → Friday 5pm

**B. Reference extraction (regex):**

Already exists from Wave 3a's reference parser. Reuse it:
- `#tag` → tag suggestions
- `@person` → person mentions (resolve when People ships in Wave 6)
- `[[entity]]` → entity links
- `>>project` → project notation (custom Atlas syntax)
- `~~context` → context notation (custom Atlas syntax)

**C. Entity extraction (compromise.js):**

```typescript
import nlp from 'compromise'

function extractEntities(text: string): {
  person_names: string[]      // "Ahmed", "John Smith"
  organizations: string[]     // "Devsinc", "TGC"
  action_verbs: string[]      // "call", "review", "send"
  noun_phrases: string[]      // "Q2 partnership", "design proposal"
}
```

compromise can identify proper nouns, verbs, organizations even without explicit `@` markers. This is useful for:
- Detecting that "Ahmed" mentioned in flowing text is likely a person (suggest tagging as such)
- Identifying potential project names ("Q2 partnership" might be a project)
- Finding the action verb (typically the first verb is the task action)

**D. Urgency detection (keyword list):**

```typescript
const URGENCY_KEYWORDS = [
  'urgent', 'asap', 'critical', 'priority', 'important',
  'immediately', 'right away', 'today', 'now',
  '!!!', 'rush', 'emergency', 'high priority'
]

function detectUrgency(text: string): boolean
```

Match case-insensitively. If found, suggest `flagged = true`.

**E. Title cleanup:**

After all the above extraction, the remaining text is the "candidate title." Clean it:
- Strip leading/trailing whitespace
- Strip leading articles ("a", "the") that don't contribute to action
- Capitalize first letter
- Truncate to 200 chars if longer (keep full original in notes)
- Strip trailing punctuation except `?` (questions are valid task titles)

**F. Project hint matching (fuzzy):**

For phrases that look like project references but aren't formal `>>` syntax:

```typescript
function inferProjectHint(text: string, existingProjects: Project[]): string | null
```

Use fuzzy string matching (Levenshtein distance or similar; libraries like `fuse.js` if needed) to match noun phrases against existing project names. Example: "update the Devsinc dashboard" → fuzzy match "Devsinc" against project list → if there's a "Devsinc Q2 Planning" project, suggest it as project_hint.

This is a *suggestion*, not auto-assignment. User accepts in Inbox processing.

### 4.4 Tier 2: AI fallback (rare path)

Only called when Tier 1 confidence < 0.7 AND user has AI enabled AND not over cost limit.

**Calling pattern:**

```typescript
async function parseTier2(
  rawText: string, 
  tier1Result: PartialParse,  // What Tier 1 already extracted
  userContext: { projects, contexts, tags, timezone }
): Promise<ParsedCapture>
```

**Critical optimization:** Pass Tier 1's results to AI as hints. Don't re-extract dates, tags, etc. — they're already done. AI only fills in what Tier 1 missed: ambiguous title, project inference, context suggestions, person resolution where compromise didn't catch it.

**Prompt structure (`/prompts/capture-parse/v1.ts`):**

```typescript
export const captureParsePromptV1 = {
  version: 'v1',
  system: `You are a task capture parser. You receive raw user text where most parsing has already been done locally. Fill in only what's ambiguous or missing. Return ONLY valid JSON, no other text.`,
  
  userTemplate: (input: {
    rawText: string
    tier1: PartialParse
    existingProjects: string[]
    existingContexts: string[]
    existingTags: string[]
    userTimezone: string
  }) => `Raw input: "${input.rawText}"

Already extracted (don't redo these):
- Title attempt: "${input.tier1.title}"
- Dates: ${JSON.stringify(input.tier1.dates)}
- Tags found: ${input.tier1.tags.join(', ')}
- People mentioned: ${input.tier1.people.join(', ')}

Existing projects: ${input.existingProjects.join(', ')}
Existing contexts: ${input.existingContexts.join(', ')}

Fill in the gaps. Return JSON:
{
  "refined_title": "cleaner title if Tier 1's was rough, or null if Tier 1's was fine",
  "project_hint": "best matching project name from list above, or null",
  "suggested_contexts": ["existing context names that fit"],
  "additional_tags": ["new tags to suggest beyond what Tier 1 found"],
  "additional_people": ["person names Tier 1 missed"],
  "is_flagged": boolean,
  "notes": "any context worth keeping in the task notes that wasn't part of the title"
}`
}
```

This prompt is *much shorter* than a from-scratch parsing prompt because Tier 1 already did the heavy lifting. Lower input tokens = lower cost.

**Cost guardrails (these are hard caps):**

```typescript
// In core/ai/limits.ts
export const captureParseLimits = {
  model: 'claude-haiku',  // ALWAYS Haiku, never escalate
  max_input_tokens: 2000,
  max_output_tokens: 500,
  max_calls_per_user_per_hour: 30,  // After 30 in an hour, fall back to Tier 1 only
  max_calls_per_user_per_day: 200,
  max_cost_per_user_per_day_usd: 1.00,  // Soft alert at $0.50
}
```

If any limit hit, fall back to Tier 1 only with a subtle indicator.

### 4.5 Hard fallback

If even AI fails (network down, Claude API errors out):

- Use Tier 1 results regardless of confidence
- Mark task as parsed via "fallback_only" 
- Show toast: "Captured (basic parse — AI unavailable)"
- Capture is NEVER lost. Worst case, the user gets a task with raw text as title and notes, no smart structuring.

### 4.6 Email-to-inbox endpoint

Configuration:

User receives `inbox+{user_id}@atlas.insightive.io` (with `+user_id` for forward-compatibility; for Phase 1 single-user, also accept `inbox@atlas.insightive.io`).

**Settings → Capture → "Email-to-inbox" section:**

- Display the dedicated address
- "Copy address" button
- Status indicator
- Recent emails list (last 10): from, subject, status, link to created task

**Inbound flow:**

1. User sends/forwards email to dedicated address
2. Resend's inbound parsing receives, POSTs to `/api/email/inbound` with signature
3. Webhook validates signature (Resend signs requests; reject 401 if invalid)
4. Webhook extracts user_id from recipient
5. Create EmailCapture record (status: pending)
6. Process email:
   - Subject → candidate title
   - Body (text version preferred) → notes
   - HTML body parsed if no plain-text version
   - Sender's email → matched against People (Wave 6) for `@person` linking
   - Attachments → uploaded to Object Storage, linked
7. Pipe combined text (subject + body) through hybrid parsing pipeline (Tier 1 → Tier 2 if needed)
8. Create Task in Inbox with parsed structure
9. Update EmailCapture (status: processed, created_task_id set)

**Edge cases:**

- HTML-only emails: extract text via mailparser
- Forwarded emails: detect "Fwd:" prefix, try to identify original sender from forwarded body if possible
- Auto-replies: detect via standard headers (`Auto-Submitted: auto-replied`, etc.) — discard if filter enabled
- Calendar invites: detect via Content-Type — discard if filter enabled (calendar items belong in Calendar)
- Marketing emails: hard to detect reliably; rely on user's blocklist
- Long emails: truncate combined text to 10000 chars for parsing; full content stays in EmailCapture
- Emails with attachments: process up to 10 per email; warn on more

**Filtering settings:**

In Settings → Capture → Email-to-inbox → Filtering:
- Auto-discard auto-replies (default: on)
- Auto-discard calendar invites (default: on)
- Auto-discard from senders matching pattern (text input, blocklist)

### 4.7 Capture orchestration

The capture service is the entry point for all capture sources (modal, quick-add, email, future API):

```typescript
// core/capture/service.ts
async function captureAndCreate(input: {
  raw_text: string
  source: 'modal' | 'quick_add' | 'email' | 'api'
  user_id: string
  attachments?: AttachmentRef[]
}): Promise<{ task: Task, parse_log: CaptureParseLog }>
```

**Flow:**

1. **Save raw immediately** — Task created in DB with `title = first 80 chars`, `notes = full text`, project_id null. This is the user-visible result of capture, returned in <500ms.
2. **Queue enrichment** — async job to run the hybrid parsing pipeline
3. **Enrich** — pipeline returns ParsedCapture
4. **Update task** — single Prisma update applying all parsed fields
5. **Update toast** — frontend receives update via TanStack Query refetch (or simpler: just show "Captured" immediately, don't try to show "Enriched" — keeps UX simpler)
6. **Log** — CaptureParseLog written

The async enrichment can use a simple in-process queue for Phase 1 (Promise queue). Wave 4 will introduce proper job runner infrastructure for scheduled tasks; capture enrichment can migrate to it then.

**Critical rule:** The user-facing capture handler returns AS SOON AS the raw task is saved. AI parsing happens after the response is sent. The user is not waiting on AI for any reason.

### 4.8 Inbox processing improvements

When AI parsing has run, Inbox tasks may have `parsed_project_hint`, `parsed_contexts`, etc.

When opening an Inbox task with hints:

```
[Task title — editable]

  💡 Suggestions:
  Project: Devsinc Q2          [Accept] [Different...] [Skip]
  Add context: deep-work       [Accept] [Skip]
  Add tag: #urgent             [Accept] [Skip]
```

Hints are visible suggestions, not auto-applied. User accepts what they want, the rest stays as suggestions or gets dismissed.

**Bulk processing (when multiple Inbox tasks suggest same project):**

"4 tasks suggested for Devsinc Q2. Accept all? [Yes] [Review individually]"

### 4.9 Capture review modal (optional deliberate flow)

For users who want to review parses before saving, Settings → AI → "Show parse review modal: when uncertain / always":

```
┌─────────────────────────────────────────────┐
│  Captured: Call Ahmed about Q2 partnership  │
│                                             │
│  Title:     [Call Ahmed about Q2 partnership]│
│  Due:       [Next Tuesday, 2:00 PM       ]  │
│  Project:   [Devsinc Q2          ▼]         │
│  Contexts:  [+ deep-work] [+ phone]         │
│  Tags:      [#urgent]                       │
│  Flagged:   ☑                               │
│  Notes:     [original captured text]        │
│                                             │
│  Parsed via: Local + AI (confidence: 0.65)  │
│                                             │
│  [Cancel]              [Save] [Save & New]  │
└─────────────────────────────────────────────┘
```

Default is toast-only mode (no modal); review modal is opt-in for users who want more control.

### 4.10 Quality and strategy monitoring

A dedicated dashboard at `Settings → AI → Capture intelligence` that surfaces both quality metrics AND architectural decision data. This isn't just monitoring — it's the surface where the user decides whether the hybrid strategy is working, whether to adjust thresholds, or whether to invest in alternatives.

**Layout: three sections.**

#### Section A: Strategy performance (the "is local-first working?" view)

```
+--------------------------------------------------------+
|  Capture parsing strategy                              |
|  --------------------------------                      |
|                                                        |
|  Local-first strategy: ✓ Working well                  |
|                                                        |
|  Last 30 days, 247 captures:                          |
|                                                        |
|  ████████████████░░░░░░  73% Local only (180)         |
|  ████░░░░░░░░░░░░░░░░░░  18% Local + AI fallback (44) |
|  ██░░░░░░░░░░░░░░░░░░░░   9% AI primary (23)          |
|                                                        |
|  Total AI cost: $0.04                                  |
|  Estimated cost if pure-AI: $0.21                      |
|  Savings: 81% ($0.17)                                  |
|                                                        |
|  [View detailed breakdown]                             |
+--------------------------------------------------------+
```

**Key metrics displayed:**

- **Strategy verdict** (top-line): One of three statuses based on local parse rate over last 30 days:
  - "Working well" (≥70%): green indicator
  - "Marginal" (50-69%): amber indicator with hint that Tier 1 might need tuning
  - "Underperforming" (<50%): red indicator with suggestion to review confidence threshold or report patterns

- **Distribution bar chart** showing percentage breakdown by parse tier:
  - Local only (Tier 1 confidence ≥0.7, AI not called)
  - Local + AI fallback (Tier 1 ran, confidence <0.7, AI called)
  - AI primary (rare cases where Tier 1 essentially failed; AI does most work)

- **Cost comparison:**
  - Actual cost (real AICallLog sum for capture parsing)
  - Estimated cost if pure-AI strategy (count × estimated per-call cost)
  - Savings amount and percentage

This data answers the architectural question: "Is the hybrid approach worth the engineering effort, or should I just use AI for everything?"

#### Section B: Quality metrics (the "are parses good?" view)

```
+--------------------------------------------------------+
|  Parse quality                                         |
|  ---------------                                       |
|                                                        |
|  Acceptance rate:        92%   ▲ up 3% vs last month   |
|  (% of parses you didn't override significantly)       |
|                                                        |
|  Average parse time:                                   |
|    Local only:           38ms  (instant)               |
|    With AI fallback:    1240ms (1.2s)                  |
|                                                        |
|  Most-overridden field: Project hint (12% override)    |
|  Best-performing field: Date (98% accepted)            |
|                                                        |
|  [View parses where you overrode AI]                   |
+--------------------------------------------------------+
```

**Key metrics:**

- **Acceptance rate**: % of captures where user didn't override the parse in inspector or Inbox processing. Trend arrow vs previous period.
- **Latency breakdown** by tier
- **Per-field accuracy**: which fields the parser gets right most/least often (helps identify which parts of the prompt or local logic to improve)
- **Link to "overrides" log**: cases where user changed AI's output substantially — high-value data for prompt iteration

#### Section C: Strategy adjustments (decision interface)

```
+--------------------------------------------------------+
|  Adjustments                                           |
|  -----------                                           |
|                                                        |
|  Confidence threshold for AI fallback                  |
|  Currently: 0.70 (default)                             |
|                                                        |
|  ░░░░░░░░░██░░░░░░░░  More local        More AI       |
|             0.5  0.7  0.9                             |
|                                                        |
|  Lowering threshold → more captures use AI             |
|  Raising threshold → more captures stay local          |
|                                                        |
|  Estimated impact of changes:                          |
|    At 0.5: ~85% local, $0.02/month estimated cost     |
|    At 0.7: ~73% local, $0.04/month (current)           |
|    At 0.9: ~55% local, $0.09/month                     |
|                                                        |
|  [Apply changes]                                       |
|                                                        |
|  AI fallback for hard cases:  [✓ Enabled]              |
|  Disabling means low-confidence captures stay local-   |
|  only (you'll see "basic parse" indicator).            |
+--------------------------------------------------------+
```

**What this enables:**

- The user can adjust the confidence threshold based on real data, not guess
- The estimated impact at different thresholds (computed from historical CaptureParseLog) lets the user see tradeoffs before committing
- A clean toggle to disable AI fallback entirely if the user wants pure-local mode

**The decision data this dashboard supports:**

This is the surface where Umar (or any user) makes informed decisions about:

1. **"Is local-first working for me?"** — Section A's verdict and distribution
2. **"Should I tune the threshold?"** — Section C's slider with estimated impact
3. **"Are my parses accurate enough?"** — Section B's acceptance rate
4. **"Should I disable AI entirely?"** — Section C's toggle
5. **"Should I invest in Phase 2's local LLM?"** — looking at AI cost trend over time; if cost is climbing, local LLM becomes more attractive
6. **"What aspect of parsing needs improvement?"** — Section B's per-field accuracy

#### Underlying data queries

The dashboard reads from `CaptureParseLog` with these aggregations (build as tRPC procedures):

```
captures.strategyStats({ range: '7d' | '30d' | '90d' | 'all' }) → {
  total_captures: number
  by_tier: { local_only, local_plus_ai, ai_primary }
  total_ai_cost_usd: number
  estimated_pure_ai_cost_usd: number  // count × avg_haiku_cost
  savings_usd: number
  savings_pct: number
}

captures.qualityStats({ range }) → {
  acceptance_rate: number
  acceptance_rate_change: number  // vs previous period
  avg_duration_local_ms: number
  avg_duration_ai_ms: number
  field_accuracy: {
    title: number
    due_date: number
    project_hint: number
    contexts: number
    tags: number
    flagged: number
  }
}

captures.thresholdImpact({ threshold: number }) → {
  // Replays last 30 days of captures with given threshold
  // Returns what % would have gone to AI vs stayed local
  // And estimated cost
  estimated_local_pct: number
  estimated_ai_calls: number
  estimated_cost_usd: number
}
```

The threshold impact query is interesting: it replays historical confidence scores against a hypothetical threshold to estimate what would have happened. This makes the slider in Section C show real estimates, not guesses.

#### Design notes for the dashboard

- Use Stratum's data viz palette for the bar chart
- Numeric trend indicators (▲ ▼) use accent-success/accent-danger
- Don't gamify — no "great job!" or streaks. This is informational, not motivational.
- Currency formatting: $0.00 for amounts < $1, $X.XX for amounts ≥ $1
- Update on view (refetch on visit; no real-time polling needed)
- Export option: "Download capture stats as CSV" for users who want to analyze externally

### 4.11 tRPC additions

```
captures.parseAndCreate({ raw_text, source }) → Task
captures.preview({ raw_text }) → ParsedCapture (for review modal)
captures.recentLogs({ limit }) → CaptureParseLog[]

// Strategy and quality monitoring
captures.strategyStats({ range }) → {
  total_captures, by_tier (local_only, local_plus_ai, ai_primary),
  total_ai_cost_usd, estimated_pure_ai_cost_usd,
  savings_usd, savings_pct, strategy_verdict ('working_well' | 'marginal' | 'underperforming')
}
captures.qualityStats({ range }) → {
  acceptance_rate, acceptance_rate_change,
  avg_duration_local_ms, avg_duration_ai_ms,
  field_accuracy (per-field accept rates)
}
captures.thresholdImpact({ threshold }) → {
  estimated_local_pct, estimated_ai_calls, estimated_cost_usd
}
captures.updateThreshold({ threshold }) → void  // adjusts confidence cutoff in user settings
captures.exportStats({ format: 'csv' }) → string  // CSV export of capture log

emails.list({ status?, limit }) → EmailCapture[]
emails.byId({ id }) → EmailCapture
emails.discardCapture({ id }) → void
```

### 4.12 Settings additions

**Settings → Capture:** Email-to-inbox display, copy button, recent emails, filtering options.

**Settings → AI → Capture parsing:**
- Master toggle (default: enabled)
- AI fallback for hard cases (default: enabled — disable to use Tier 1 only)
- Show parse review modal: never / when uncertain / always
- Allow auto-create tags: yes/no (default: no)
- Allow auto-link to projects: yes/no (default: no)
- Allow auto-link to people: yes/no (default: no)

### 4.13 Audit log additions

- `email_capture_received` (from, subject)
- `task_parsed_local_only` (no AI used)
- `task_parsed_with_ai` (AI fallback used)
- `task_user_overrode_parse` (user changed AI's suggestions)

---

## 5. File Structure (additions to Wave 3b)

```
/atlas
  /app
    /api
      /email
        /inbound/route.ts                  # Resend webhook receiver
  /core
    /capture
      service.ts                           # Orchestrates capture flow
      /parser
        index.ts                           # Pipeline orchestrator
        tier-1-local.ts                    # Local parsing
        tier-2-ai.ts                       # AI fallback
        confidence.ts                      # Confidence scoring
        types.ts
        fallback.ts                        # Hard fallback
      email-parser.ts                      # mailparser wrapper
      enrichment-queue.ts                  # Async enrichment
    /ai
      limits.ts                            # Cost/rate guardrails
  /prompts
    /capture-parse
      v1.ts
      index.ts
  /server
    /routers
      captures.ts
      emails.ts
  /components
    /tasks
      capture-review-modal.tsx
      inbox-processing-suggestions.tsx
```

---

## 6. Verification (Definition of Done)

**Local parsing — basic:**
1. Capture "Buy groceries tomorrow" → verify parsed entirely locally (parse_tier = "local_only" in log)
2. Task has title "Buy groceries", due tomorrow EOD
3. Cost for this capture: $0.00

**Local parsing — with metadata:**
4. Capture "Call Ahmed about Q2 partnership #urgent at 2pm Tuesday" → all parsed locally
5. Verify: title cleaned, due Tuesday 2pm, tag `#urgent`, person mention "Ahmed", flagged true
6. parse_tier = "local_only", cost $0.00

**AI fallback — vague capture:**
7. Capture "the thing we discussed last week about Sarah's proposal needs follow-up before Q2 ends"
8. Confidence below 0.7, AI fallback triggers
9. parse_tier = "local_plus_ai" or "ai_fallback"
10. Task created with reasonable title, person mention "Sarah", date end-of-Q2, project hint if matches

**AI fallback disabled:**
11. Settings → AI → disable AI fallback
12. Capture vague text from #7
13. parse_tier = "local_only" with low confidence
14. Toast: "Captured (basic parse)"
15. Task created with raw text as title; user can clean up manually

**Failure handling — no AI:**
16. Disconnect from internet
17. Capture: "Test during outage"
18. Task still created in Inbox immediately
19. parse_tier = "local_only"
20. No errors, capture is non-blocking

**Email-to-inbox:**
21. Settings → Capture → see dedicated email address
22. Send email to address with subject "Test capture from email"
23. Within 30 seconds, task appears in Inbox
24. EmailCapture record exists with status "processed"

**Email with attachment:**
25. Send email with PDF attachment
26. Task created, attachment in Object Storage, linked

**Email filtering:**
27. Enable auto-reply filter
28. Send email with "Auto-reply:" subject prefix
29. EmailCapture status: "discarded", no task created

**Date parsing comprehensive:**
30. "review proposal EOD Friday" → due Friday 5pm
31. "in 3 weeks" → due 3 weeks out, EOD
32. "next Monday morning" → due next Monday 9am
33. "before end of Q2" → due last day of Q2

**Inbox processing with hints:**
34. Capture multiple tasks with project hints
35. Open Inbox task → suggestion banner with [Accept]/[Different]/[Skip]
36. Accept → task moves to project
37. Multiple tasks suggesting same project → bulk accept option

**Cost monitoring:**
38. Make 20 captures (mix of simple and complex)
39. Settings → AI → Capture intelligence shows three sections: Strategy performance, Parse quality, Adjustments
40. Strategy section shows correct distribution by tier (local_only, local_plus_ai, ai_primary)
41. Cost comparison shows actual cost vs estimated pure-AI cost with savings %
42. Quality section shows acceptance rate, latency by tier, per-field accuracy
43. Adjustments section has confidence threshold slider with estimated impact
44. Recent parses log accessible

**Strategy adjustment:**
45. Move confidence threshold slider to 0.5 → see estimated impact update (more local, less AI cost)
46. Apply changes → User.ai_confidence_threshold updated in DB
47. Make 5 more captures with new threshold → verify they follow new threshold logic
48. Reset to 0.70 default → confirm reverted

**Performance:**
49. Local-only captures: capture-to-saved < 100ms (truly local)
50. AI fallback captures: capture-to-saved < 500ms (raw save), enriched < 2s
**Performance:**
49. Local-only captures: capture-to-saved < 100ms (truly local)
50. AI fallback captures: capture-to-saved < 500ms (raw save), enriched < 2s
51. No capture is ever lost
52. Cost guardrails enforced (artificial test: hit rate limit, verify fallback)

**Quality:**
53. Capture 30 varied real-world inputs
54. Subjective check: most parses are accurate
55. Local parse rate ≥ 70% (most captures don't need AI)
56. Acceptance rate ≥ 80% (user rarely overrides parses)
57. Audit log records all captures with correct parse tier
58. Total cost for 30 captures < $0.05

When all 58 steps pass, Wave 3c is complete.

---

## 7. Rules of Engagement

All previous rules apply. Adding for Wave 3c:

### 7.1 Local-first is non-negotiable

The architectural choice in this wave is that local parsing handles the bulk of work. If you find yourself routing every capture to AI, you've defeated the purpose.

The local parse rate should be 70%+ for typical use. If after a week of real use the rate is below 50%, the Tier 1 parser needs improvement (better confidence scoring, more sophisticated entity extraction) — not "give up and use AI."

### 7.2 Capture is sacred — never blocking

The Wave 3a rule about capture being instant compounds here. Even with AI added, the user-facing handler returns as soon as the raw task is saved. AI runs after. If you find yourself awaiting an AI call in the user-facing handler, you've got it wrong.

### 7.3 Cost discipline — Haiku only, hard caps

Capture parsing ALWAYS uses Haiku. Hard caps on rate and daily cost. Visible cost monitoring in Settings.

If you find yourself defaulting to Sonnet "for quality," stop. Tier 2's job is to fill in what Tier 1 missed, not to be sophisticated.

### 7.4 AI suggestions, not AI decisions

Default behavior: AI suggests, user accepts or overrides. Don't auto-create projects, don't auto-create tags, don't auto-link to people. Atlas surfaces what AI extracted as *suggestions* in Inbox processing.

### 7.5 chrono-node is sacred

Don't have AI do date parsing. chrono-node is faster, free, and handles 95% of cases. AI runs after chrono extracts dates; the AI prompt explicitly says dates are already extracted.

### 7.6 compromise.js is the entity-extraction workhorse

Don't have AI extract person names, organizations, or verbs when those are detectable patterns. compromise.js is local, fast, and good at this. AI fills in only what compromise can't catch (ambiguous references, contextual inference).

### 7.7 Resend webhook signature validation

`/api/email/inbound` MUST validate Resend's signature. Reject 401 on invalid signature. Without this, anyone can POST fake emails to create fake tasks.

### 7.8 Don't build recurring tasks

"Every Tuesday" → next Tuesday's date. Recurring tasks are Phase 2.

### 7.9 The Tier 1 → Tier 2 boundary is intentional

Tier 2 is the *escape valve* for hard cases, not a default path. The confidence score is the gate. If you find yourself lowering the confidence threshold to call AI more often, stop and improve Tier 1 instead.

---

## 8. Recommended Build Sequence

1. **Schema migration** — EmailCapture, CaptureParseLog, User.ai_confidence_threshold field
2. **chrono-node integration** — date parsing utility
3. **compromise.js integration** — entity extraction utility
4. **Tier 1 parser** — full local pipeline (dates, references, entities, urgency, title, project hints)
5. **Confidence scoring** — signal-based scoring of Tier 1 results
6. **Capture service refactor** — save-raw-then-enrich pattern
7. **Hard fallback** — when AI also fails, local-only result is used
8. **Tier 2 AI parser** — calls Claude Haiku with Tier 1 hints
9. **Pipeline orchestrator** — Tier 1 → confidence check → Tier 2 if needed
10. **Cost guardrails** — rate limits, daily caps, fallback triggers
11. **Inbox processing UI** — accept/reject suggestion banners
12. **Capture review modal** — optional deliberate flow
13. **Resend inbound webhook** — endpoint, signature validation
14. **Email parsing pipeline** — mailparser, attachment handling, filtering
15. **Strategy & quality dashboard** — three-section monitoring UI in Settings → AI
16. **Threshold adjustment** — slider with estimated impact, persists to user settings
17. **Stats CSV export** — for users who want to analyze data externally
18. **Settings updates** — capture and email preferences
19. **Audit log integration** — new action types
20. **Verification** — all 58 steps

---

## 9. Definition of Done

- [ ] EmailCapture and CaptureParseLog tables migrated
- [ ] User.ai_confidence_threshold field added
- [ ] Tier 1 (local) parser handles dates, references, entities, urgency, title cleanup, project hints
- [ ] Confidence scoring correctly identifies Tier 2 needs
- [ ] Tier 2 (AI) parser uses Tier 1 hints, runs only when needed
- [ ] Hard fallback ensures capture never fails
- [ ] Local parse rate ≥ 70% in typical use
- [ ] Capture latency < 500ms regardless of parsing path
- [ ] Resend inbound webhook receives emails, validates signatures
- [ ] EmailCapture records track all incoming emails
- [ ] Auto-reply, calendar invite filtering works
- [ ] Cost tracking and limits enforced
- [ ] Inbox processing shows suggestions for user accept/reject
- [ ] Strategy performance dashboard shows tier distribution and cost comparison
- [ ] Quality metrics dashboard shows acceptance rate and per-field accuracy
- [ ] Confidence threshold slider with estimated impact works
- [ ] Threshold adjustment persists to User.ai_confidence_threshold
- [ ] Stats CSV export works
- [ ] All 58 verification steps pass
- [ ] No regressions on Waves 3a/3b

---

## 10. What is NOT in Wave 3c

**Phase 2 candidates:**
- Local LLM via Transformers.js (replace Tier 2 AI fallback with browser-side model)
- Recurring tasks
- Smart inbox auto-routing (auto-file without user review)
- Browser extension capture
- iOS Shortcut for capture
- Voice capture
- Multi-language capture
- Smart context auto-detection from device location/time

**Wave 6 dependent (not built here):**
- Real `@person` resolution (Wave 6 fills in)
- Sender → contact creation suggestions

If you find yourself building any of these, stop.

---

## 11. Final note

Wave 3c's architectural choice — local-first with AI fallback — is the most important decision in this wave. It minimizes AI dependency for a foundational feature, keeps costs near-zero for typical use, and preserves capture functionality even when AI is unavailable.

The local parse rate is the long-term success metric. If it stays ≥70% and users rarely override parses, the architecture is working. If it drifts below 50%, Tier 1 needs improvement before reaching for more AI.

Begin with section 8, step 1.
