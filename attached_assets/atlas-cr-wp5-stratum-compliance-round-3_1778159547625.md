# Replit Agent Prompt — Atlas CR: Stratum Compliance Round 3 (Audit WP5)

## Read this entire document before taking any action.

---

## 1. Overview

Tier-2 audit remediation. Closes six Medium / Low Stratum compliance findings. Effort M, Risk Low.

**Source:** `audit-reports/atlas-audit-2026-05-07.md` Work Package 5.

This is the third Stratum compliance round (after the original PR and the Round 2 CR's CI guardrails). The Round 2 CI guardrails caught most regressions, but the audit surfaced a cluster at the **edges of the design system** — components and surfaces less central to the design language where compliance has slipped.

**Findings addressed:**
- **SC-1** — 47+ raw `title=` attributes on interactive elements (should be `<Hint>`)
- **SC-2** — Hex color palette duplicated in note editor block + bubble menus
- **SC-3** — Inline hex `#d97706` in `project-add-form.tsx`
- **SC-4** — Admin orphan detail page uses raw `bg-[#111]` and `border-white/20`
- **SC-5** — Context management uses raw Tailwind palette classes (`bg-red-500`, etc.)
- **SC-6** — Request access form uses `text-red-500` / `border-red-500` for validation

**Estimated scope:** 4-5 days.

---

## 2. Stack constraints (do not deviate)

- Stratum design tokens from `src/styles/tokens.css` are the source of color truth
- `<Hint>` component from `src/components/ui/hint.tsx` is the only sanctioned tooltip
- Tailwind 3.4 (do not upgrade — Tier 3 dependency surgery)
- TypeScript strict
- No major version dependency upgrades
- No schema changes
- Visual changes must preserve existing color relationships (e.g., a "danger" red stays red, just via a token now)

---

## 3. Detailed deliverables

### 3.1 SC-1 — `title=` → `<Hint>` migration

#### 3.1.1 Inventory

The audit lists 10 representative locations from 47+ total. Run a fresh inventory:

```bash
grep -rn 'title="' src/components/ src/app/ | grep -v __tests__ | grep -v '\.md:'
```

Filter to interactive elements only (button, anchor, icon-button-style spans). Exclude:
- `<input title=...>` (HTML semantic, not a tooltip)
- Raw HTML `<title>` tag in document head
- Tests and stories

Categorize the inventory:
- **Group A: Icon buttons in task UI** (audit listed 9+ in `task-list`, `task-inspector`, `task-row-quick-actions`, `worklog-entry`, etc.)
- **Group B: Folder and project actions** (`folder-detail-view`, `project-*`)
- **Group C: Capture and inbox** (`someday-perspective`, `waiting-for-perspective`)
- **Group D: Media filters** (`media-filters`)
- **Group E: Anywhere else found in the fresh grep**

#### 3.1.2 Migration pattern

For each `title="X"` on an interactive element:

**Before:**
```tsx
<button onClick={...} title="Edit">
  <Pencil className="h-4 w-4" />
</button>
```

**After:**
```tsx
<Hint label="Edit">
  <button onClick={...}>
    <Pencil className="h-4 w-4" />
  </button>
</Hint>
```

The Hint component handles delay, positioning, theming, and accessibility — the native `title` attribute does none of these on touch devices.

#### 3.1.3 Edge cases

**Conditional title text:**
```tsx
title={isOpen ? "Collapse" : "Expand"}
```
Becomes:
```tsx
<Hint label={isOpen ? "Collapse" : "Expand"}>
```

**Title on a wrapping `div` for a non-interactive surface:**
- If the element is genuinely non-interactive, the `title` is providing decorative info, not a tooltip
- These are rare; evaluate case-by-case
- Most should still migrate to `<Hint>` unless they're a stylistic choice (e.g., `<img title=...>` for accessibility-as-fallback)

**Disabled buttons with explanation:**
```tsx
<button disabled title="No items selected">
```
The `<Hint>` should still wrap; the disabled button should not block the tooltip.

#### 3.1.4 Verification per file

After migrating a file, verify visually that hover tooltips appear in the live app — `<Hint>` and native `title` look superficially similar, so a regression where the wrap is wrong (e.g., wrapping a non-interactive parent) won't show until the user hovers.

### 3.2 SC-2 — Note editor hex palette extraction

#### 3.2.1 Current state

`src/components/notes/editor-block-menu.tsx:31-36` and `src/components/notes/editor-bubble-menu.tsx:99-116` both define hardcoded hex palettes for highlight and text colors:

```ts
const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green",  value: "#bbf7d0" },
  { label: "Blue",   value: "#bfdbfe" },
  { label: "Pink",   value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Purple", value: "#e9d5ff" },
]
```

#### 3.2.2 Extract to shared module

Create `src/core/notes/colors.ts`:

```ts
export type NoteHighlightColor = {
  label: string
  value: string
  cssVar: string
}

export const NOTE_HIGHLIGHT_COLORS: NoteHighlightColor[] = [
  { label: "Yellow", value: "#fef08a", cssVar: "--note-highlight-yellow" },
  { label: "Green",  value: "#bbf7d0", cssVar: "--note-highlight-green"  },
  { label: "Blue",   value: "#bfdbfe", cssVar: "--note-highlight-blue"   },
  { label: "Pink",   value: "#fbcfe8", cssVar: "--note-highlight-pink"   },
  { label: "Orange", value: "#fed7aa", cssVar: "--note-highlight-orange" },
  { label: "Purple", value: "#e9d5ff", cssVar: "--note-highlight-purple" },
]

// Same shape for text color palette — extract from editor-bubble-menu.tsx
export const NOTE_TEXT_COLORS: NoteHighlightColor[] = [
  // ... extract from current implementation
]
```

#### 3.2.3 Add CSS variables to tokens

In `src/styles/tokens.css`, add the highlight color variables:

```css
:root {
  /* ... existing tokens */
  --note-highlight-yellow: #fef08a;
  --note-highlight-green:  #bbf7d0;
  --note-highlight-blue:   #bfdbfe;
  --note-highlight-pink:   #fbcfe8;
  --note-highlight-orange: #fed7aa;
  --note-highlight-purple: #e9d5ff;
  
  /* Text colors */
  --note-text-red:    /* ... */;
  /* ... etc */
}

[data-theme="dark"] {
  /* Override for dark mode if appropriate; otherwise inherit */
}
```

The hex value still lives somewhere — but now in `tokens.css` (the design surface) rather than scattered across components.

#### 3.2.4 Update consumers

`editor-block-menu.tsx` and `editor-bubble-menu.tsx`:
- Import `NOTE_HIGHLIGHT_COLORS` from `src/core/notes/colors.ts`
- Render `style={{ backgroundColor: \`var(${color.cssVar})\` }}` (or use the hex directly via `color.value` if TipTap requires literal colors for storage)

#### 3.2.5 Storage compatibility note

TipTap stores highlight colors in document JSON. If the document was saved with a literal hex (`#fef08a`), it remains valid — the migration doesn't break existing notes. New highlights inserted after this CR can use either the literal hex or the CSS var.

For consistency, prefer `var(--note-highlight-yellow)` in stored output IF the rest of TipTap's pipeline handles CSS variables correctly. If it doesn't, store the hex but reference the constant.

Document the decision in `src/core/notes/colors.ts` comments.

### 3.3 SC-3 — `project-add-form.tsx` inline hex

`src/components/tasks/project-add-form.tsx:119`:

**Before:**
```tsx
style={{ backgroundColor: c === "amber" ? "#d97706" : c }}
```

**After:** Replace the `#d97706` with a Stratum token reference. Two paths:

**Option 1 — Use existing Stratum amber token if one exists:**
```tsx
style={{ backgroundColor: c === "amber" ? "var(--accent-amber)" : c }}
```

**Option 2 — Map the entire color palette through Stratum:**
Refactor the `c` variable to be a Stratum token name throughout the form, eliminating the special-case for "amber".

Pick Option 1 for minimal scope. Option 2 is a larger refactor that could happen later.

If `--accent-amber` doesn't exist in `tokens.css`, add it (mapped to `#d97706` or the Stratum-canonical amber).

### 3.4 SC-4 — Admin orphan detail page raw hex backgrounds

`src/app/admin/orphans/[id]/orphan-detail-client.tsx:39, 87`:

**Before:**
```tsx
<div className="bg-[#111] border-white/20 ...">
```

**After:**
```tsx
<div className="bg-surface-overlay border-border-subtle ...">
```

Verify the Stratum token names match the existing palette in `tokens.css`. If `bg-surface-overlay` and `border-border-subtle` don't exist as Tailwind utilities, check `tailwind.config.ts` for the mapping or define them appropriately.

The visual outcome should be identical — admin pages aren't re-themed by this CR, just made compliant.

### 3.5 SC-5 — Context management raw Tailwind palette

`src/components/tasks/context-management.tsx:34-46` defines color options as raw Tailwind palette:

**Before:**
```ts
const COLOR_OPTIONS = [
  { value: "red",    cls: "bg-red-500" },
  { value: "orange", cls: "bg-orange-500" },
  // ... 8 colors
]
```

**After:** Two options:

**Option 1 — Map to Stratum `viz-*` tokens** (preferred):

If Stratum has visualization color tokens (`--viz-red`, `--viz-orange`, etc.), use them:

```ts
const COLOR_OPTIONS = [
  { value: "red",    cls: "bg-viz-red" },
  { value: "orange", cls: "bg-viz-orange" },
  // ...
]
```

This ensures the color palette is theme-aware (auto-inverts in light/dark).

**Option 2 — Define a dedicated context color palette:**

If Stratum doesn't have viz tokens yet, add a `context-*` palette section to `tokens.css` and map through Tailwind config:

```css
/* tokens.css */
:root {
  --context-red:    #ef4444;
  --context-orange: #f97316;
  /* ... */
}
```

```ts
// tailwind.config.ts — extend colors:
context: {
  red: 'var(--context-red)',
  orange: 'var(--context-orange)',
  // ...
}
```

Then:
```ts
const COLOR_OPTIONS = [
  { value: "red", cls: "bg-context-red" },
  // ...
]
```

Pick whichever option fits Atlas's existing Stratum architecture. Document the choice in the PR description.

### 3.6 SC-6 — Request access form validation colors

`src/components/homepage/request-access-form.tsx:98, 103, 130, 135, 161`:

**Before:**
```tsx
<input className={cn("...", error && "border-red-500")} />
<p className="text-red-500 text-sm">{error}</p>
```

**After:**
```tsx
<input className={cn("...", error && "border-border-error")} />
<p className="text-accent-danger text-sm">{error}</p>
```

Both `border-border-error` and `text-accent-danger` should already exist as Stratum tokens; if not, define them.

### 3.7 Add lint guardrails for next time

The Stratum Compliance Round 2 CR introduced CI guardrails. Verify they're catching the new patterns this CR fixes:

#### 3.7.1 ESLint custom rule (or grep-based CI check)

Ensure CI fails on:
- Raw `title=` on JSX elements that are buttons or have onClick (custom AST rule, or grep + manual review)
- Hardcoded hex colors in `.tsx` files outside `tokens.css`
- Raw Tailwind palette classes (`bg-red-*`, `text-blue-*`) outside an allowlist
- Inline `style={{ color: '#...' }}` patterns

If the existing guardrails miss any of these, extend them in this CR. The point of the round is closing the holes, not just fixing the symptoms.

#### 3.7.2 Allowlist for legitimate uses

Some files may need exceptions (e.g., `src/styles/tokens.css` itself contains hex; the `markdown` package may use color literals in syntax highlighting). Maintain an explicit allowlist in the lint config.

---

## 4. Verification

### SC-1 verification
1. Fresh `grep` of `src/components/` and `src/app/` for `title="` returns only acceptable cases (HTML `<title>`, `<input title=>`, etc.)
2. Audit's listed 10+ representative locations all use `<Hint>` instead of `title=`
3. Manual hover test in live app confirms tooltips appear consistently
4. No interactive button has a raw `title=` attribute

### SC-2 verification
5. `src/core/notes/colors.ts` exists and exports `NOTE_HIGHLIGHT_COLORS` and `NOTE_TEXT_COLORS`
6. `src/styles/tokens.css` includes `--note-highlight-*` and `--note-text-*` CSS variables
7. `editor-block-menu.tsx` imports the constant; no inline hex remains in the file
8. `editor-bubble-menu.tsx` imports the constant; no inline hex remains in the file
9. Manual test: highlight colors in note editor render correctly
10. Existing notes saved with literal hex colors still render correctly (storage compatibility preserved)

### SC-3 verification
11. `project-add-form.tsx` line 119 no longer contains `#d97706`
12. Color picker in project add form renders identically
13. `--accent-amber` exists in `tokens.css` (added if missing)

### SC-4 verification
14. `orphan-detail-client.tsx` lines 39, 87 use Stratum surface and border tokens
15. Admin orphan detail page renders identically in dark mode

### SC-5 verification
16. `context-management.tsx` color options use Stratum tokens (viz-* or context-*)
17. Context creation/edit UI shows colors correctly
18. Decision (viz tokens vs new context palette) documented in PR

### SC-6 verification
19. `request-access-form.tsx` validation error states use `border-border-error` and `text-accent-danger`
20. Form validation error visually identical
21. `text-red-500`, `border-red-500` no longer appear in this file

### Cross-cutting
22. `npm run lint` passes
23. `npm run typecheck` passes
24. `npm test` passes (no test regressions; existing failures unchanged unless WP4 has shipped first)
25. CI guardrails extended where needed to catch the patterns this CR fixed
26. Visual regression check in live app — sample of affected pages reviewed
27. PR description documents the Option chosen for SC-5 (viz-* vs context-*)

When all 27 verification steps pass, WP5 is complete.

---

## 5. Rules of engagement

### 5.1 Don't change colors, just their source

The user-visible color values must not change. A red that's `#ef4444` today should still render as `#ef4444` after this CR — just sourced from a token instead of a literal.

If a color is genuinely wrong (e.g., the audit found inconsistent reds across pages and the "correct" red is debatable), that's a separate design conversation. Document in PR; don't decide unilaterally.

### 5.2 The Hint wrap goes around the interactive element

A common mistake: wrapping the icon (or label) inside a button instead of wrapping the button itself. The wrap order is:

```tsx
✅ <Hint label="Edit"><button><Icon /></button></Hint>
❌ <button><Hint label="Edit"><Icon /></Hint></button>
```

The Hint needs to anchor on the interactive element to handle focus and disabled states correctly.

### 5.3 Round-trip safety for stored data

The note highlight color CR (SC-2) touches a color value that gets stored in TipTap document JSON. Existing notes have literal hex saved. The migration must keep those existing notes rendering correctly.

The simplest path: continue storing literal hex, source the literal from the constant. This is what the constant export shape allows.

### 5.4 Stratum tokens may need additions

If a color use case requires a token that doesn't exist (`--accent-amber`, context viz palette, note highlight palette), add it to `tokens.css` rather than working around with a literal. The token additions are part of this CR.

If a token addition feels controversial (e.g., adding 8 viz colors that don't have a clear precedent in Stratum), pause and document the decision in the PR before committing the token names.

### 5.5 Don't migrate `title=` on inputs

`<input title="Help text">` is a semantic HTML attribute providing browser-level help, not a tooltip. Leave those alone. Same for `<title>` in document head.

If unsure whether a `title=` is interactive-tooltip or HTML-semantic, check whether the element has an `onClick` handler or is a `<button>` / `<a>`. If yes, migrate; if no, evaluate case-by-case.

### 5.6 The lint extension is the load-bearing fix

Migrating today's violations is the visible work. Extending the lint guardrails to catch tomorrow's violations is the structural fix. Both belong in this CR; the audit explicitly framed Round 2's CI guardrails as needing reinforcement.

---

## 6. What is NOT in this CR

- **Re-theming** any module (don't change color values, just sources)
- **Tailwind 4 upgrade** (Tier 3 dependency surgery)
- **Refactoring `tokens.css` structure** (additions only)
- **Adding light mode** if Atlas is dark-only today
- **Changing TipTap document structure or migration** (round-trip safety preserves existing notes)
- **`<Hint>` API improvements** (use as-is; don't redesign the component)
- **Adding new Stratum tokens unrelated to the audit findings** (focus)
- **Migrating `title=` in test files or stories** (those are isolated)

---

## 7. Recommended sequence

1. Start with smallest finding (SC-3: single file, single line)
2. SC-6: small, contained, validation paths
3. SC-4: admin pages, low risk
4. SC-2: note editor — touches a stored format, slightly higher care
5. SC-5: context palette — design decision needed first (viz-* vs new palette)
6. SC-1: largest scope, do last so the patterns are clear from earlier work
7. Lint guardrails extension — confirm all earlier fixes wouldn't reappear
8. Manual visual regression check across affected pages

Each finding can ship as a separate commit. SC-1 may warrant multiple commits (one per component group).

---

## 8. Final note

Stratum compliance is not about color preferences. It's about every color in Atlas having a single source of truth so future theming, accessibility audits, and visual refreshes don't require sweeping component edits. The token surface is the contract; this CR makes the contract honest again.

Begin with section 3.3 (SC-3, smallest first).
