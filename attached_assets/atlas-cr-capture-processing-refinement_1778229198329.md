# Atlas CR — Capture Processing Refinement

## Read this entire CR before taking any action.

---

## 1. Overview

The capture processing flow shipped with the GTD Inbox CR but isn't actually delivering on its promise. Real use surfaces three connected problems:

1. **Parser proposals are thin** — for all captures, `parser_proposal` contains only `{tags, title}`. The richer fields the GTD Inbox CR specified (proposed_disposition, context_id, due_date, estimated_minutes, etc.) are never populated. Even when raw text obviously suggests a context (e.g., "Call dentist" → Calls context), the proposal is empty.

2. **Disposition forms don't pre-fill** — when the user selects Task disposition during processing, the form opens essentially empty. Title field is blank, context is blank, dates are blank, estimated time is blank. User has to manually re-enter information they already typed once. This makes processing slower than typing tasks directly, defeating the entire GTD discipline this flow was designed to enable.

3. **Save fails with opaque 500 error** — clicking "Create Task" after manually filling everything in fails with a generic "Something went wrong on our end. Please try again." toast. The actual server error is in the database layer (logged at `level: 50` from `module: db`) but the user sees nothing actionable. Multiple `processToTask` mutations fail this way.

These aren't separate bugs — they're symptomatic of the GTD Inbox CR shipping with the parser scope unchanged from Wave 3c. The CR specified a richer parser proposal shape but the parser was never extended to produce it. The forms read from `parser_proposal`, but the proposal contains nothing useful, so forms appear empty.

This CR fixes all three issues with a diagnostic-first approach. Phase 1 reproduces the failure and identifies the exact root cause from server logs. Phase 2 onward fixes what's actually broken.

**The work:**

1. **Diagnostic phase** — reproduce the save failure, capture full server-side exception, identify root cause
2. **Parser enrichment (Tier 1)** — local NLP detects more proposal fields: disposition, context mapping, due date, basic estimated time
3. **Parser enrichment (Tier 2 AI)** — Claude Haiku produces structured proposals matching the GTD Inbox CR's specified shape when local confidence is low
4. **Form pre-fill** — every disposition form reads from `parser_proposal` and populates fields; falls back to `raw_text` for title when proposal lacks one
5. **Save error root cause fix** — whatever's causing the 500 error gets fixed at source
6. **Error surfacing improvement** — server errors during processing produce specific, actionable messages (not generic "something went wrong")
7. **Backfill existing captures** — re-run enrichment on existing `proposed`-state captures so they get the richer proposal shape

**Pre-requisites:**

- GTD Inbox CR shipped (Capture lifecycle exists, processing mode UI exists)
- Wave 4 Refinement shipped (error handling standards established)
- Wave 3c parser pipeline exists (chrono-node, compromise.js, AI fallback)
- AI infrastructure works (Claude Haiku via existing client)
- Database access for diagnostic queries

**Estimated scope:** 1.5-2 weeks of focused work.

**Severity:** High. Currently the GTD processing flow is worse than typing tasks directly. F&F users hitting this would lose trust in the system. Should ship before any new features.

---

## 2. The diagnostic principle

Several issues in this CR have surface symptoms with deeper root causes. Phase 1 establishes ground truth before any code changes:

- Reproduce the save failure with controlled inputs
- Capture the full server-side exception from logs
- Verify parser proposal contents match what the form reads
- Document findings before applying fixes

If the actual root cause differs from what's hypothesized below, fix the actual cause and document the deviation. Don't patch symptoms.

---

## 3. Detailed deliverables

### 3.1 Diagnostic phase

#### 3.1.1 Reproduce the failure

Sign in as the demo user. Navigate to `/captures` (or wherever the processing flow lives). Open processing mode. Pick the "Call dentist about cleaning appointment" capture (or any in `proposed` state).

Click **T** for Task disposition. Form opens.

Note exactly:
- Which fields pre-fill from `parser_proposal` (likely just title and tags, possibly nothing)
- Which fields are empty
- What the user has to manually enter

Fill out the form: title, project (Inbox), context (Calls), due date, estimated time (15), tag (health). Click **Create Task**.

Observe:
- Frontend toast: "Something went wrong on our end..."
- Browser dev tools, Network tab: failing `capture.processToTask` request returns 500
- Browser console: any client-side errors logged

#### 3.1.2 Capture the server-side exception

Access Replit's logs. Filter to `level: 50` entries from the last hour. Look for entries from `module: db` or `module: trpc` that correspond timestamp-wise to the failed mutation.

The Pino JSON entry will have:
- `err` or `error` field with the exception
- Stack trace
- Likely a Prisma error code (`P2002`, `P2003`, `P2025`, etc.)
- Possibly a specific field name that triggered the error

Capture the full structured log entry. Document it.

#### 3.1.3 Categorize the root cause

Based on the captured exception, identify which of these likely root causes applies (or document a different one):

**A. Foreign key violation (P2003)** — the request references a context_id, tag_id, or project_id that doesn't exist for this user. Could be stale IDs from a different session, or IDs from the parser proposal that were never saved.

**B. Unique constraint violation (P2002)** — something the request tries to insert duplicates an existing record. Possibly the capture-to-task transition fires twice and the second insert fails.

**C. Required field null** — the Task model has non-null constraints the form/API doesn't satisfy. E.g., status defaults missing, or position not set.

**D. Transaction logic broken** — the multi-step save (create Task + update Capture state + create audit log) is wrapped in a transaction with bad logic. One step fails, the entire transaction rolls back, the error message obscures which step.

**E. Capture state transition issue** — the capture is being marked `processed` before the resulting Task is fully created, or vice versa, leaving inconsistent state.

**F. Something else** — document what was actually found.

#### 3.1.4 Verify parser proposal contents

Run this query against the demo user's captures:

```sql
SELECT 
  id, 
  raw_text, 
  state, 
  parser_proposal,
  created_at
FROM "Capture" 
WHERE user_id = (SELECT id FROM "User" WHERE email = 'umar.rana@devsinc.com')
  AND state = 'proposed'
ORDER BY created_at DESC
LIMIT 20;
```

For each capture, document:
- Does `parser_proposal` exist?
- What fields does it contain? (Just `{tags, title}`? Or more?)
- Does it have `proposed_disposition`?
- Does it have `proposed_attributes` with context_id, due_date, etc.?

This confirms or refutes the hypothesis that the parser is producing thin proposals.

#### 3.1.5 Document findings

Before proceeding to Phase 2, produce a brief findings document (could be a comment in the PR description):

- Root cause of the 500 save error: [A/B/C/D/E/F + specific exception]
- Parser proposal contents: [structure observed]
- Form pre-fill behavior: [which fields populate, which don't]

This grounds the rest of the CR in actual reality, not assumed reality.

### 3.2 Parser enrichment (Tier 1 local NLP)

The Wave 3c parser uses chrono-node (date parsing) and compromise.js (NLP entity extraction). Currently it produces minimal output. This phase extends it to populate the full proposal shape.

#### 3.2.1 Target proposal shape

Per the GTD Inbox CR section 2.3, every Capture's `parser_proposal` should be:

```typescript
{
  proposed_disposition: 'task' | 'note' | 'reference' | 'unclear',
  proposed_title: string,
  proposed_body: string | null,
  proposed_attributes: {
    project_id?: string,
    context_id?: string,
    tags?: string[],
    due_date?: string,  // ISO 8601
    defer_date?: string,
    purpose?: string,  // For Note disposition
    estimated_minutes?: number,
  },
  confidence: number,  // 0-1, overall confidence in proposal
}
```

Whatever Tier 1 can determine, populate. Whatever it can't, omit (the field is absent rather than null).

#### 3.2.2 Disposition heuristics

Run simple pattern matching against the raw text to suggest disposition:

**Task indicators (verb-led, action-oriented):**
- Starts with action verbs: call, email, buy, schedule, review, send, finish, draft, write, update, fix, check, ask, follow up, etc.
- Contains imperative phrasing
- Contains a date reference (chrono-node finds one)

**Note indicators (reference-oriented):**
- Starts with: "idea:", "thought:", "remember", "note:", "fyi"
- Contains reference patterns: "the X is good for Y", "I learned that..."
- No action verb, no date, longer than typical task length (>15 words)

**Reference indicators (informational):**
- Article/URL references: "Article worth reading:", "https://...", URLs
- Quoted material
- Fact statements without action

**Unclear:**
- Doesn't match any pattern strongly
- Very short (<3 words)

The implementation can be a simple keyword/pattern map plus length heuristics. Don't try to be too clever in Tier 1 — when uncertain, mark `unclear` and let Tier 2 AI decide.

#### 3.2.3 Context mapping

Given the user's existing GTD contexts (Calls, Email, Computer, Office, Errands, Home, Meetings, Reading, Waiting, Anywhere — typical), map text patterns to context IDs:

**Mapping rules (configurable):**

```typescript
const contextHints = [
  { keywords: ['call', 'phone', 'ring', 'dial'], context_name: 'Calls' },
  { keywords: ['email', 'send to', 'reply to', 'write to'], context_name: 'Email' },
  { keywords: ['code', 'program', 'debug', 'compile', 'commit'], context_name: 'Computer' },
  { keywords: ['meeting', 'discuss', 'sync'], context_name: 'Meetings' },
  { keywords: ['buy', 'purchase', 'shop', 'pickup', 'errand'], context_name: 'Errands' },
  { keywords: ['read', 'review', 'study'], context_name: 'Reading' },
  { keywords: ['waiting for', 'awaiting', 'follow up with'], context_name: 'Waiting' },
  // ... etc
]
```

For a given text, find the first keyword match and look up the user's matching context by name. If found, set `proposed_attributes.context_id`.

If the user has renamed contexts (e.g., uses "Phone" instead of "Calls"), the mapping won't match. That's acceptable — they can manually pick. The mapping uses common GTD context names as defaults.

If multiple keywords match, use the first one. Don't try to rank or be clever — keep this simple.

#### 3.2.4 Date detection (already exists, ensure used)

chrono-node should already be running and finding dates. Verify:
- Phrases like "tomorrow", "next Tuesday", "in three days", "May 15" should produce a parseable date
- The detected date populates `proposed_attributes.due_date`
- Time-bearing phrases ("at 3pm tomorrow") populate the time component

If chrono-node is running but the result isn't being stored in `parser_proposal`, that's a wiring fix — connect the existing detection to the proposal output.

#### 3.2.5 Estimated time hints

Simple heuristics for common phrases:

```typescript
const timeHints = [
  { pattern: /quick (call|email|review)/i, minutes: 15 },
  { pattern: /(call|phone) /i, minutes: 15 },
  { pattern: /(brief|short) (meeting|sync)/i, minutes: 30 },
  { pattern: /(meeting|sync)/i, minutes: 60 },
  { pattern: /(review|read) (article|doc|document)/i, minutes: 30 },
  // etc.
]
```

For each pattern that matches, set `proposed_attributes.estimated_minutes`. First match wins.

This is intentionally conservative. The user can always adjust. The point is to provide a reasonable starting value, not be precisely right.

#### 3.2.6 Tags

The existing parser already detects tags from `#tag` syntax. Continue this. Set `proposed_attributes.tags` to the detected tag names.

For Tier 1, don't try to suggest tags from semantic content (that's Tier 2's job). Only the explicit `#` syntax produces tag suggestions in Tier 1.

#### 3.2.7 Confidence scoring

Compute overall confidence as a function of:
- How many fields were populated (more = higher confidence)
- How specific the text was (clear action verb + clear date = high confidence; vague text = low confidence)
- Whether disposition could be determined

Range 0-1. Below the user's `ai_confidence_threshold` (default 0.70) triggers Tier 2 AI enrichment.

### 3.3 Parser enrichment (Tier 2 AI)

When Tier 1 confidence is below the user's threshold, Tier 2 calls Claude Haiku to produce a richer structured proposal.

#### 3.3.1 Prompt structure

```typescript
const prompt = `
You are helping a user process their inbox in a GTD productivity system.
Given a raw capture, produce a structured proposal for what it should become.

Available contexts: ${userContextNames.join(', ')}
Available projects: ${userProjectNames.slice(0, 20).join(', ')}
Existing tags: ${userTagNames.slice(0, 30).join(', ')}

Raw capture: """${rawText}"""

Tier 1 already detected: ${JSON.stringify(tier1Proposal)}

Produce a JSON object matching this schema:
{
  "proposed_disposition": "task" | "note" | "reference" | "unclear",
  "proposed_title": string,
  "proposed_body": string | null,
  "proposed_attributes": {
    "context_name": string | null,  // Match to user's contexts
    "project_name": string | null,  // Match to user's projects
    "tags": string[],  // Existing tags only
    "due_date": "YYYY-MM-DD" | null,
    "defer_date": "YYYY-MM-DD" | null,
    "purpose": "Meeting Note" | "Project Brief" | "Reading Note" | "Note" | null,
    "estimated_minutes": number | null
  },
  "confidence": number  // 0-1
}

Rules:
- Refine the title from the raw text — make it concise and action-oriented for tasks, descriptive for notes
- For task disposition, populate context_name if obvious (Call → Calls, Buy → Errands)
- Don't invent project names; only suggest projects from the list provided
- Don't invent tags; only suggest tags from the list provided
- Conservative confidence: 0.9 if very clear, 0.7 if somewhat clear, 0.5 if uncertain
`
```

#### 3.3.2 Response handling

Claude returns JSON. Parse it. Resolve names to IDs:
- `context_name` → look up in user's contexts; if found, set `context_id` in proposed_attributes
- `project_name` → look up in user's projects; if found, set `project_id`
- `tags` → look up in user's tags; only include matches (don't auto-create)

If resolution fails (Claude suggested a context the user doesn't have), drop that field. Don't surface "context not found" errors to the user.

Store the resolved structured proposal in `parser_proposal`.

#### 3.3.3 Cost tracking

This is the same Claude Haiku call pattern Wave 3c already uses. Existing cost tracking in `AICallLog` continues to apply. The CR shouldn't significantly increase AI spend — captures still hit Tier 2 only when local confidence is low, and Tier 1 will now confidently handle more cases (because it produces richer output, more captures will exceed the threshold).

#### 3.3.4 Failure handling

If Claude call fails or returns malformed JSON:
- Tier 3 fallback: use Tier 1's proposal as-is
- Don't block the capture from proceeding
- Log the failure to AICallLog with success=false
- Capture state stays `proposed` with whatever Tier 1 produced

### 3.4 Form pre-fill from parser_proposal

For every disposition form in the processing mode, read from `parser_proposal` and populate fields.

#### 3.4.1 Task form

Pre-fill from `parser_proposal.proposed_attributes`:
- Title ← `proposed_title` (fall back to first 80 chars of `raw_text` if missing)
- Project ← `project_id` (or "Inbox" if not present)
- Context ← `context_id`
- Tags ← `tags`
- Due date ← `due_date`
- Defer date ← `defer_date`
- Estimated time ← `estimated_minutes`
- Notes/body ← `proposed_body` if present, otherwise empty

Every field is editable. The pre-fill is a starting point, not a commitment.

#### 3.4.2 Note form

- Title ← `proposed_title` (fall back to first 80 chars of `raw_text`)
- Body ← `proposed_body` if present, otherwise `raw_text` itself becomes body
- Purpose ← `proposed_attributes.purpose` (default to "Note")
- Folder ← null (user picks)
- Project ← `proposed_attributes.project_id`

#### 3.4.3 Project form

- Name ← `proposed_title`
- Type ← null (user picks: Project / Goal / Area)
- Folder ← null

Project is a structurally different disposition (creating a new project vs. attaching to one), so less pre-fill applies.

#### 3.4.4 Someday form

- Title ← `proposed_title` (fall back to `raw_text`)
- Tags ← `tags`
- Review date ← null (user picks)

#### 3.4.5 Waiting For form

- Title ← `proposed_title` (fall back to `raw_text`)
- Delegated to ← null (user enters; Tier 2 AI might suggest a person hint, but unreliable)
- Follow up date ← `due_date` if present

#### 3.4.6 2-minute Did it form

- Title ← `proposed_title` (fall back to `raw_text`)
- Other attributes from proposal — even though task is being marked complete, the resulting Task should have the proposed context/tag/project for proper categorization

#### 3.4.7 Always have a title

The title field must NEVER be empty in any disposition form. The fallback chain:

1. `parser_proposal.proposed_title` if set
2. First H1-like prefix in raw_text (e.g., if raw starts with "# Some title\n...")
3. First 80 chars of raw_text

The user already typed the text once. The form should never ask them to type it again.

#### 3.4.8 Visual indication of pre-filled vs. user-edited

Optional but valuable: pre-filled fields could have a subtle visual indicator showing "this came from the parser" vs. "this was edited by you." On commit, parser-suggested fields that the user didn't edit get logged as accepted; fields the user edited get logged as overridden. This data informs whether the parser is helpful (high acceptance rate) or misleading (high override rate).

If implementation effort is meaningful, defer this — but it's a useful feedback loop for tuning parser heuristics.

### 3.5 Save error root cause fix

Apply the fix specific to the root cause identified in Phase 1. Common scenarios:

**If foreign key violation:**
- Validate context/tag/project IDs exist for this user before save
- If a referenced ID doesn't exist (e.g., parser suggested a stale ID), surface a friendly message and let the user re-pick

**If unique constraint violation:**
- Check for existing capture-to-task linkage before save
- Make the transition idempotent — if a Task already exists for this capture, don't create another

**If required field null:**
- Provide defaults at API layer for fields the form doesn't send
- Or update the form to require those fields before save

**If transaction logic broken:**
- Audit the transaction wrapper
- Ensure all multi-step operations are inside the transaction
- Ensure error in any step rolls back cleanly with a useful error message

**If state transition issue:**
- Make the transition atomic — capture's `state` and `processed_to_*` fields, plus the new entity's existence, all change in one transaction or none of them do

Whatever the root cause, the fix should:
1. Address the underlying issue
2. Add a regression test (Playwright e2e for the processing flow)
3. Verify by manually running the processing flow end-to-end without errors

### 3.6 Error surfacing improvement

#### 3.6.1 Specific error messages

When server-side errors occur during processing, surface specific messages instead of "Something went wrong":

| Server error | User-facing message |
|---|---|
| Foreign key violation on context | "The selected context isn't valid. Please pick another." |
| Foreign key violation on project | "The selected project isn't valid. Please pick another." |
| Foreign key violation on tag | "One of the selected tags isn't valid. Please re-select." |
| Required field missing | "[Field name] is required." |
| Unique constraint | "This capture has already been processed." |
| Database connection lost | "Couldn't save — please check your connection." |
| Generic internal error | "Couldn't save right now. Please try again, and if it keeps happening, contact support." (with request ID for diagnosis) |

#### 3.6.2 Server-side error logging continues

These friendly messages are user-facing. Server-side, the actual exception continues to log to Pino at level 50 with full context (user_id, request payload, stack trace) for ongoing diagnostic capability.

#### 3.6.3 Error envelope

The TRPCError shape used for these errors:

```typescript
throw new TRPCError({
  code: 'BAD_REQUEST', // or appropriate code
  message: 'The selected context isn't valid. Please pick another.',
  cause: originalError, // logged server-side, not surfaced
})
```

The frontend's centralized error handler (per Wave 4 Refinement) reads `message` and shows it as toast.

#### 3.6.4 No more JSON parse errors

Verify that any save failure produces a properly-shaped TRPCError, not a 500 with HTML body. The frontend should never have to handle "Unexpected token 'I'..." parse errors. If anywhere in the save path can throw an unwrapped exception, wrap it.

### 3.7 Backfill existing captures

After parser enrichment is deployed, existing captures in `proposed` state still have the old thin proposals. Re-run enrichment on them so they get the new richer shape.

#### 3.7.1 Backfill job

Add a one-time job (or migration script):

```typescript
async function backfillCaptureProposals(): Promise<BackfillReport> {
  const captures = await prisma.capture.findMany({
    where: { state: 'proposed' }
  })
  
  let processed = 0
  let errors = 0
  
  for (const capture of captures) {
    try {
      const newProposal = await runEnrichment(capture)
      await prisma.capture.update({
        where: { id: capture.id },
        data: { parser_proposal: newProposal }
      })
      processed++
    } catch (error) {
      errors++
      // log but continue
    }
  }
  
  return { processed, errors }
}
```

Run once after deployment. Logs the report for review.

#### 3.7.2 Cost consideration

Re-enriching all existing captures means running each through the parser again. Tier 2 AI cost applies for low-confidence ones. For ~50 demo captures, this is trivial cost. For larger user bases later, batch and rate-limit appropriately.

### 3.8 Verification with real usage

After all fixes apply, manually use the processing flow end-to-end:

1. Capture: "Call dentist about cleaning appointment tomorrow at 3pm"
2. Process: should pre-fill Task disposition with title, Calls context, tomorrow at 3pm due date, ~15 min estimated
3. Adjust if needed, save → succeeds
4. Capture: "Idea: weekly team lunch could improve morale"
5. Process: should suggest Note disposition, with title and body pre-filled
6. Save → succeeds
7. Capture: "Buy birthday gift for Hassan"
8. Process: should pre-fill Task with Errands context
9. Save → succeeds

If any of these fail or produce empty pre-fills, diagnose further before declaring done.

---

## 4. tRPC procedures

No new procedures. Existing `capture.processToTask`, `capture.processToNote`, etc., have their internal logic fixed.

The tRPC error responses become more specific (per 3.6) but the procedure signatures are unchanged.

---

## 5. Schema changes

No schema changes required. The existing `Capture.parser_proposal` JSON field can hold the richer shape without migration. Existing captures continue to work; backfill upgrades their proposals.

---

## 6. File changes

```
/atlas
  /src
    /core
      /capture
        service.ts                      (UPDATED: fix any state transition / save issues)
        parser/
          tier1.ts                      (UPDATED: produce richer proposals)
          tier2-ai.ts                   (UPDATED: structured AI prompts and resolution)
          context-mapper.ts             (NEW: keyword → context resolution)
          time-hints.ts                 (NEW: estimated minutes heuristics)
          disposition-detector.ts       (NEW: disposition heuristics)
          confidence.ts                 (UPDATED: holistic confidence scoring)
        backfill.ts                     (NEW: backfill existing captures)
    /server
      /routers
        capture.ts                      (UPDATED: better error envelopes)
    /components
      /capture
        processing-mode.tsx             (verify reads from parser_proposal)
        disposition-task-form.tsx       (UPDATED: pre-fill from proposal)
        disposition-note-form.tsx       (UPDATED)
        disposition-project-form.tsx    (UPDATED)
        disposition-someday-form.tsx    (UPDATED)
        disposition-waiting-for-form.tsx (UPDATED)
        disposition-two-min-form.tsx    (UPDATED)
        disposition-trash-form.tsx      (verify; minimal pre-fill needed)
  /prisma
    /scripts
      backfill-capture-proposals.ts     (NEW: one-time backfill runner)
```

The exact file paths may differ. Adapt to actual project structure.

---

## 7. Verification

### Diagnostic phase
1. Reproduced the save failure with controlled inputs
2. Captured the full server-side exception from logs
3. Categorized root cause (A/B/C/D/E/F)
4. Verified parser proposal contents on existing captures
5. Documented findings in PR description

### Parser Tier 1 enrichment
6. New capture with action verb (e.g., "Call mom") → proposal includes `proposed_disposition: 'task'`
7. Capture with date phrase (e.g., "tomorrow at 3pm") → proposal includes `due_date`
8. Capture starting with "Idea:" → proposal includes `proposed_disposition: 'note'`
9. Capture with explicit `#tag` → proposal includes that tag
10. Capture with "buy" or "purchase" → context_id resolves to Errands
11. Capture with "call" or "phone" → context_id resolves to Calls
12. Capture with "email" → context_id resolves to Email
13. Capture with "meeting" → context_id resolves to Meetings
14. Capture with "quick call" → estimated_minutes set to 15
15. Capture with "meeting" but no qualifier → estimated_minutes set to 60
16. Confidence score populated on every proposal
17. Vague captures (e.g., "thing about stuff") get `proposed_disposition: 'unclear'`

### Parser Tier 2 AI enrichment
18. Low-confidence Tier 1 result triggers Tier 2 AI call
19. AI proposal returns valid JSON matching expected schema
20. Context names resolve to user's actual context IDs
21. Project names resolve to user's actual project IDs (only existing projects)
22. Tags resolve to user's actual tags (only existing tags, no auto-creation)
23. AI failure or malformed JSON → falls back to Tier 1 proposal gracefully
24. AICallLog records the AI call with cost

### Form pre-fill — Task
25. Open processing mode, select Task disposition
26. Title pre-fills from `proposed_title`
27. If `proposed_title` missing, falls back to first 80 chars of `raw_text`
28. Title is NEVER empty
29. Project pre-fills from `project_id` (Inbox if not set)
30. Context pre-fills from `context_id`
31. Due date pre-fills from `due_date`
32. Defer date pre-fills from `defer_date`
33. Estimated time pre-fills from `estimated_minutes`
34. Tags pre-fill from `tags`
35. Notes/body field pre-fills from `proposed_body` if present
36. All fields editable (pre-fill is starting point, not commitment)

### Form pre-fill — other dispositions
37. Note form pre-fills title, body (raw_text if no proposed_body), purpose
38. Project form pre-fills name from proposed_title
39. Someday form pre-fills title and tags
40. Waiting For form pre-fills title and follow-up date
41. 2-minute form pre-fills with proposed attributes for the resulting Task
42. Trash form just shows confirmation (no fields)

### Save error fixes
43. Save Task disposition with valid form → succeeds (no 500)
44. Foreign key error on context → friendly message: "The selected context isn't valid. Please pick another."
45. Foreign key error on project → similar friendly message
46. Required field missing → specific field name in error message
47. Already-processed capture → "This capture has already been processed."
48. Connection error → "Couldn't save — please check your connection."
49. Server-side errors continue to log to Pino at level 50 with full context

### Error envelope
50. All save failures produce TRPCError responses (not HTML 500 pages)
51. Frontend never sees JSON parse errors
52. Toast shows specific message, not "Something went wrong on our end"

### Backfill
53. Backfill job runs once on deployment
54. All existing `proposed`-state captures get re-enriched
55. Backfill report logs counts (processed, errors)
56. Existing captures now have richer parser_proposal shape
57. Re-running backfill is idempotent (already-rich captures don't get cost re-applied)

### End-to-end usage
58. Capture "Call dentist about cleaning appointment tomorrow at 3pm" → processes to Task with Calls context, tomorrow at 3pm, ~15 min estimated, all pre-filled
59. Capture "Idea: weekly team lunch could improve morale" → suggests Note disposition with title and body pre-filled
60. Capture "Buy birthday gift for Hassan" → pre-fills Task with Errands context
61. Capture "Email Sarah about the proposal" → pre-fills Task with Email context
62. Capture "Schedule annual health check-up" → pre-fills Task with health tag
63. Process all 8 captures from demo user without manual data entry beyond confirmation
64. Average processing time per capture < 10 seconds with new pre-fill

### No regressions
65. All Wave 4a, 4b, 4c, GTD Inbox, File Conversion functionality unchanged
66. Other tRPC procedures unaffected
67. Existing tasks, notes, projects display correctly
68. Tasks, notes, projects created from captures appear in their respective lists
69. Captures' processed_to_id correctly references the new entity

When all 69 verification steps pass, this CR is complete.

---

## 8. Rules of engagement

### 8.1 Diagnostic before fix

Phase 1 is mandatory. Don't apply hypothetical fixes — confirm the root cause from server logs first. The hypothesis list (3.1.3) is plausible but not authoritative. The actual exception tells the truth.

If the diagnosed root cause differs from any hypothesis, document it and adjust the fix accordingly.

### 8.2 Parser proposals are hints, never authority

Parser produces `parser_proposal`. Forms pre-fill from it. User edits and confirms. The pipeline is: parser proposes → user decides → entity created.

Never auto-process captures based on parser confidence alone. Even at 95% confidence, the user makes the final call. This is the GTD discipline the CR is meant to enable.

### 8.3 Tier 2 AI enhances, doesn't replace Tier 1

Tier 1 always runs (synchronously). Tier 2 only triggers when Tier 1 confidence is below user threshold. Don't make Tier 2 mandatory or always-on — it adds latency and cost.

When Tier 2 runs, it ENHANCES Tier 1's proposal (filling in fields Tier 1 couldn't determine), not replacing it wholesale.

### 8.4 Title fallback is unconditional

The user already typed the text. The form must never make them re-type. If `proposed_title` is empty, fall back to `raw_text` truncated. The "Title is empty" state is impossible.

### 8.5 Don't auto-create tags or contexts

If parser suggests a tag or context that doesn't exist for this user, drop the suggestion. Never auto-create tags/contexts during processing. Tag/context creation requires explicit user intent.

### 8.6 Errors are specific or fall through to a safe generic

The list in 3.6.1 covers common cases. For uncovered cases, fall through to: "Couldn't save right now. Please try again, and if it keeps happening, contact support." with a request ID. Don't show "Something went wrong on our end..."  — that message is too generic to be actionable.

### 8.7 Backfill is one-shot

Run once. After that, new captures use the new parser automatically. Re-running is wasteful. If for some reason backfill needs to re-run (bug fix, parser improvement), it should detect already-enriched proposals and skip them.

### 8.8 No parser changes outside Tier 1 / Tier 2 scope

This CR is about getting the existing capture parser to produce the right output shape. It's not about reworking the parser architecture, adding new tiers, or changing the AI client.

If you find yourself wanting to refactor the parser pipeline, stop. That's a separate concern.

### 8.9 Capture state machine is sacred

The state transitions (`raw` → `proposed` → `processed`) are GTD-foundational. Don't add new states. Don't skip states. Don't allow processed captures to revert.

If save fails, the capture stays `proposed`. The user retries.

---

## 9. Recommended Build Sequence

**Phase 1: Diagnostic (1 day)**

1. Reproduce save failure with controlled inputs
2. Capture full server-side exception from logs
3. Verify parser proposal contents on existing captures
4. Document findings; identify root cause category
5. Verify form pre-fill code paths read from `parser_proposal`

**Phase 2: Parser Tier 1 enrichment (3-4 days)**

6. Implement disposition detector (heuristic-based)
7. Implement context mapper (keyword → user's contexts)
8. Implement time hints (regex → estimated minutes)
9. Wire chrono-node date detection into proposed_attributes
10. Implement confidence scorer
11. Update parser pipeline to produce full proposal shape
12. Test with sample captures; verify rich proposals

**Phase 3: Parser Tier 2 AI enrichment (2-3 days)**

13. Update Tier 2 prompt to request structured proposal JSON
14. Implement name → ID resolution for context, project, tags
15. Handle AI failures gracefully
16. Verify cost tracking continues
17. Test with low-confidence captures; verify AI enhancement

**Phase 4: Form pre-fill (2-3 days)**

18. Update Task disposition form to read from parser_proposal
19. Implement title fallback chain
20. Update Note, Project, Someday, Waiting For, 2-min forms
21. Verify all fields pre-fill correctly per disposition

**Phase 5: Save error fix (1-2 days)**

22. Apply fix specific to root cause from Phase 1
23. Update tRPC error envelopes (TRPCError, not HTML 500)
24. Map common errors to specific friendly messages
25. Add Playwright regression test for processing flow

**Phase 6: Backfill (1 day)**

26. Implement backfill script
27. Run on deployment; review report
28. Verify all existing captures have richer proposals

**Phase 7: End-to-end verification (1 day)**

29. Process 8+ demo captures end-to-end
30. Measure average processing time
31. All 69 verification steps

---

## 10. What is NOT in this CR

**Future enhancements (deferred):**
- Visual indicators for parser-suggested vs. user-edited fields (mentioned but optional)
- Parser feedback loop (track acceptance/override rates to tune heuristics)
- Multi-language parsing support
- Per-user custom keyword mappings (e.g., user defines "WhatsApp" → Calls context)
- Parser proposes new tags semantically (currently only `#` syntax)
- Parser proposes person hints for Waiting For (would require People resolution)

**Wave 4c+ territory:**
- Better Inbox processing UX beyond what's already shipped (this CR fixes; doesn't add features)
- Bulk-processing of similar captures with shared disposition

**Permanently excluded:**
- Auto-processing without user confirmation
- Skipping the proposed → processed user step
- Tier 4 fallback beyond AI

If you find yourself building any of these, stop.

---

## 11. Final note

The GTD Inbox CR shipped the user-facing structure of capture-first processing — the capture lifecycle, the processing mode UI, the dispositions, the perspectives. What it didn't ship was the parser actually producing the rich proposals the structure was designed to surface.

This CR closes that gap. After it ships, the processing flow delivers on its promise: most captures pre-fill enough that the user just confirms (or makes one small adjustment), and the GTD discipline of dump-everything-then-process becomes genuinely faster than typing structured tasks directly.

The save error fix is small but important. F&F users seeing "Something went wrong on our end..." three times in a row would conclude Atlas is broken and stop using it. Specific, actionable error messages turn an opaque failure into a recoverable interaction.

Phase 1 is mandatory because the cost of patching the wrong root cause is rebuilding the same fix later. One day of careful diagnosis prevents three days of misguided implementation.

Begin with section 9, Phase 1.
