# Atlas CR — Stratum Compliance Pass and CI Hardening

## Read this entire CR before taking any action.

---

## 1. Overview

A previous Stratum compliance CR fixed five files (top-bar, top-bar-wired, theme-switcher, inbox-welcome-banner, note-list-view) to correct broken token references, theme-correctness issues, and missing focus-ring patterns. That CR was authored before Wave 4 Refinement shipped, so it didn't cover the new components introduced by Refinement — Notes editor enhancements (BubbleMenu, slash menu, block handles, attachment dialog), Tables grid (rendering, column headers, footer row, empty states), and error handling components.

Wave 4 Refinement has not been audited for Stratum compliance. Given the same patterns of issues that necessitated the original Stratum CR (invalid Tailwind classes shipping silently, undefined token references, ad-hoc focus styling), there's high probability that Refinement introduced similar issues without anyone noticing.

This CR completes the Stratum compliance work systematically. It:

1. **Applies the original Stratum CR's fixes** to the current codebase (the original CR was authored against pre-Refinement state; some target files may have changed)
2. **Audits all Wave 4 Refinement components** for the same classes of issues the Stratum CR caught
3. **Addresses the items the Stratum CR explicitly deferred** (module switcher footer, Trash tooltip, unused token palettes)
4. **Adds CI tooling** to prevent invalid Tailwind classes and undefined token references from shipping in the future
5. **Runs an amnesty pass** fixing whatever pre-existing violations the new CI tooling surfaces
6. **Resolves the getting-started guide question** raised by the Stratum CR's banner cleanup

This is preparation for F&F production. Visual debt that's invisible during early use becomes painful at the moment users start trusting the product daily.

**The work:**

1. **Apply original Stratum CR fixes** — verify each fix is in place; apply to current code where the file has changed
2. **Audit Wave 4 Refinement components** — BubbleMenu, slash menu, block handles, table grid components, error toast
3. **Module switcher footer cleanup** — Trash properly grouped with Media via correct divider treatment
4. **Trash tooltip consistency** — keyboard shortcut shown in tooltip like other rail items
5. **Token palette cleanup** — remove unused viz/calendar palettes from tokens.css
6. **CI tooling** — `eslint-plugin-tailwindcss` strict, CSS variable reference validation, amnesty commit
7. **Getting-started resolution** — confirm whether `/welcome` exists; add entry point if yes, remove route if no
8. **Focus-ring consistency** — broader audit across all interactive components

**Pre-requisites:**

- Wave 4 Refinement is shipped and stable
- Original Stratum compliance CR has shipped (the 5-file PR with topbar, theme switcher, banner, notes empty state)
- Stratum design system tokens (`tokens.css`, `tailwind.config.ts`) exist and are the canonical source of truth

**Estimated scope:** 4-5 days of focused work.

**Severity:** Medium-high. Visual polish before F&F users see Atlas. Not blocking but worth doing carefully.

---

## 2. The diagnostic principle

This CR is mostly audit-and-fix, not new component work. For each section below, the agent should:

1. **Search the codebase** for the patterns described
2. **Document findings** (what was found where) before fixing
3. **Apply fixes** consistently using the canonical Stratum tokens
4. **Verify visually** that fixes don't introduce regressions

If the audit surfaces patterns I didn't anticipate, document them and ask before applying broad changes.

---

## 3. Detailed deliverables

### 3.1 Apply original Stratum CR fixes to current codebase

The original Stratum CR fixed five files. Wave 4 Refinement shipped after that CR was authored, so some target files may have been substantially modified. For each of the five Stratum fixes, verify the fix is applied or apply it to current code.

#### 3.1.1 The five fixes to verify

For each file below, check current state and apply the corresponding fix if not present:

**`src/components/layout/top-bar.tsx`:**
- Search placeholder: "Search or jump to…" (was "Search Atlas")
- Max-width: `max-w-[var(--top-bar-search-max-w)]` (was magic number `556px`)
- Search icon size: `14` (was `12`)
- Padding: `px-2.5` (was `px-2`)

**`src/components/shell/top-bar-wired.tsx`:**
- Capture button text color: `text-text-on-accent` (was `text-white`)
- Hover state: `hover:bg-accent-primary-hover` (was `hover:bg-accent-primary/90`)

**`src/components/theme-switcher.tsx`:**
- Segment height: `h-7` (was the invalid `h-22`)
- Padding: `px-2.5` (was `px-2`)
- Icon size: `14` (was `12`)
- Focus ring: `focus-visible:focus-ring` added
- Removed `gap-px` (parent's `p-0.5` handles inset)

**`src/components/tasks/inbox-welcome-banner.tsx`:**
- All `accent-brand*` references → `accent-primary*` (the brand variants don't exist as defined tokens)
- `text-white` → `text-text-on-accent`
- `focus-visible:outline outline-2` → `focus-visible:focus-ring`
- "View the getting started guide" link removed (handled in 3.7)
- Unused `Link` import removed

**`src/components/notes/note-list-view.tsx`:**
- Title size: `text-md` (was `text-base`)
- Search input: `focus-visible:focus-ring` added
- "+ New note" button: heights match search input (`h-7`)
- Empty state: removed competing "Create your first note" link; informational hint pointing at header CTA
- Empty state width: `max-width: var(--empty-state-max)`

#### 3.1.2 Handling files that have changed

If a file has been substantially reworked during Wave 4 Refinement (most likely `note-list-view.tsx` given the editor enhancements), apply the *spirit* of the Stratum fix to current code. The principle is: same tokens, same theme-correctness, same focus patterns. The exact line numbers and surrounding context may differ.

If a fix can't be applied because the targeted code no longer exists (e.g., the "Create your first note" link was already removed during Refinement), note that in the CR's documentation comments and move on.

### 3.2 Audit Wave 4 Refinement components for Stratum compliance

Wave 4 Refinement introduced new components that haven't been audited against Stratum tokens. Apply the same patterns the original Stratum CR caught.

#### 3.2.1 What to audit

For each component listed below, verify:

- All color references use defined tokens (no `text-white` on accent surfaces; use `text-text-on-accent`)
- All Tailwind classes correspond to actual definitions (no `h-22` situations)
- All focus-visible styling uses `focus-visible:focus-ring` (no ad-hoc `outline` definitions)
- All hover states use designed hover hues (`hover:bg-accent-primary-hover`, not `hover:bg-accent-primary/90`)
- All sizes use Stratum tokens or sensible scale values (not magic numbers)
- No references to undefined token names (no `accent-brand`, no other phantom tokens)

#### 3.2.2 Components to audit

**Notes editor (Wave 4 Refinement Phase 4):**

- `editor-bubble-menu.tsx` (floating toolbar)
- `editor-slash-menu.tsx` (slash command menu)
- `editor-block-handle.tsx` (per-block hover affordance)
- `editor-block-menu.tsx` (block menu when handle clicked)
- `note-editor.tsx` (verify wrapper styling)

The BubbleMenu specifically — verify:
- Toolbar background uses `bg-surface-raised` or similar defined token
- Button colors use theme-aware tokens
- Active state (e.g., button highlighted when text is bold) uses defined accent tokens
- Toolbar shadow uses `shadow-1` or `shadow-2` (Stratum elevation tokens)

**Tables grid (Wave 4 Refinement Phase 5):**

- `table-grid.tsx` (the grid container)
- `table-cell.tsx` (cell rendering for idle/selected/editing states)
- `table-column-header.tsx` (column header layout)
- `table-add-column-button.tsx` (the + button at right)
- `table-footer-row.tsx` (sticky aggregations row)
- `table-empty-state.tsx` (empty state message)

The cell component specifically — verify:
- Cell border colors use `border-border-subtle` for inactive, `border-border-focus` for selected
- Selected cell background uses defined surface token, not arbitrary opacity
- Type-specific edit components (date picker, select dropdown) inherit theme correctly

**Error handling components:**

- `error-toast.tsx` (the friendly error display)
- Any centralized error display surface introduced by Refinement

Verify error toasts use semantic tokens (`bg-surface-danger`, `text-text-on-danger` or equivalent) rather than hardcoded reds.

#### 3.2.3 Audit method

Two passes:

**Pass 1: Automated grep.** Search the new component files for these patterns:
```
text-white
accent-brand
hover:bg-.*\/9[0-9]
focus-visible:outline (without focus-ring)
h-2[1-9]  (other invalid heights like h-22)
w-1[3-9]  (similar invalid widths)
text-base  (in places where text-md or other Stratum size is correct)
```

Each hit is a candidate violation. Triage and fix.

**Pass 2: Visual inspection in light mode.** Wave 4 Refinement was likely developed primarily in dark mode (the default). Switch to light mode and visually inspect every Wave 4 Refinement surface:
- Notes editor with floating toolbar visible
- Notes editor with slash menu open
- Notes editor with block handle hovering
- Tables grid with various cell states
- Tables empty state
- Error toasts (trigger one to see)

Anything that looks wrong in light mode (white text on white background, illegible contrast, missing borders, etc.) is a Stratum compliance failure to fix.

### 3.3 Module switcher footer cleanup

The Stratum CR explicitly deferred this: "Trash visually orphaned from Media in the footer rail."

#### 3.3.1 Current state

Looking at the module rail:

```
[Tasks]
[Calendar]
[People]
[Notes]
[Journals]
[Vault]   (placeholder)

  ─────       ← divider

[Media]
[Trash]      ← visually orphaned per Stratum CR
```

The divider above Media correctly groups it as "system tools" separate from primary modules. But Trash sits below Media without a proper grouping treatment.

#### 3.3.2 Fix

Group Media and Trash together as system tools with consistent visual treatment:

```
[Tasks]
[Calendar]
[People]
[Notes]
[Journals]
[Vault]

  ─────       ← divider (no change)

[Media]      ← grouped together
[Trash]      ← visually consistent with Media
```

Specifically:
- Both Media and Trash share the same icon style (consistent stroke width, similar visual weight)
- Both have the same hover state treatment
- No additional divider between them — they're a single group below the divider
- Spacing between them matches spacing between primary module items

If there's currently a subtle styling difference (e.g., Trash has a different opacity or color), normalize it.

### 3.4 Trash tooltip consistency

The Stratum CR also deferred: "Tooltip shortcut consistency on Trash rail item."

#### 3.4.1 Current state

Other rail items show their keyboard shortcut on hover:
- Tasks: "Tasks (⌘1)"
- Calendar: "Calendar (⌘2)"
- ...

But Trash doesn't show its shortcut, OR shows the shortcut inconsistently.

#### 3.4.2 Fix

Trash gets the same tooltip pattern as other rail items:
- Tooltip shows on hover after standard delay
- Format: "Trash (⌘9)" or whatever shortcut Trash currently has
- Same tooltip component / styling as other rail items

If Trash doesn't currently have a keyboard shortcut, this CR doesn't add one — the question is just tooltip consistency. If keyboard shortcuts are missing for any rail items (Trash or others), document as a separate observation; don't expand scope here.

### 3.5 Token palette cleanup

The Stratum CR mentioned: "Audit unused viz/calendar palettes in `tokens.css`."

#### 3.5.1 What to audit

`tokens.css` likely contains color palettes that were defined in early development but aren't actually used by any component. Common culprits:

- Visualization palettes (chart colors that no chart component references)
- Calendar-specific tokens (defined for the future Wave 5 Calendar work but not yet used)
- Status/severity palettes that may be unused
- Brand palette variants (especially if `accent-brand` was a previous name and tokens still exist)

#### 3.5.2 Audit method

For each token palette in `tokens.css`:

1. Grep the codebase for any reference to that palette's class names or CSS variables
2. If no references found, mark as candidate for removal
3. Verify the candidates aren't referenced in tailwind.config.ts mapping (where Tailwind class names are mapped to CSS variables)
4. Remove confirmed-unused tokens

#### 3.5.3 Conservative deletion

Don't delete tokens that are clearly intended for future use (e.g., calendar tokens, even if Wave 5 hasn't shipped, might be intentionally pre-defined). Use judgment:

- **Definitely remove:** tokens with old naming (e.g., `accent-brand`) that have been renamed in current code
- **Definitely remove:** tokens defined but never referenced and not part of a clear future feature
- **Keep:** tokens for known-upcoming features (calendar, journal) even if currently unreferenced
- **Ask the user:** anything ambiguous

Document what was removed and why in the commit message.

### 3.6 CI tooling

The original Stratum CR exposed that invalid Tailwind classes (`h-22`) and undefined token references (`accent-brand`) shipped to production silently. CI tooling should prevent this class of bug.

#### 3.6.1 Tailwind class validation

Add `eslint-plugin-tailwindcss` to the project with strict configuration:

```javascript
// .eslintrc.js
{
  plugins: ['tailwindcss'],
  rules: {
    'tailwindcss/no-custom-classname': 'error',  // Warn on undefined classes
    'tailwindcss/classnames-order': 'warn',      // Optional but useful
    'tailwindcss/no-contradicting-classname': 'error',
  },
  settings: {
    tailwindcss: {
      config: 'tailwind.config.ts',
    }
  }
}
```

The `no-custom-classname` rule with `error` level will fail CI if any component references a class not defined in `tailwind.config.ts`. This catches `h-22` situations.

If the project uses dynamic class names in some places (e.g., `cn()` helpers), configure the plugin to recognize the helper:

```javascript
settings: {
  tailwindcss: {
    callees: ['cn', 'clsx', 'classnames'],
  }
}
```

#### 3.6.2 CSS variable reference validation

Tailwind class validation catches undefined Tailwind classes but doesn't catch references to undefined CSS variables. For tokens used directly in inline styles or arbitrary values (`text-[var(--my-token)]`), a separate check is needed.

Add a small build-time script:

```typescript
// scripts/validate-token-references.ts
// 1. Parse tokens.css to extract all defined CSS variables
// 2. Grep all component files for var(--anything) references
// 3. Verify each reference resolves to a defined variable
// 4. Exit with error if undefined references found
```

Run this script as part of CI before build. Configure to fail on undefined references.

#### 3.6.3 Amnesty commit

When the new tooling is enabled, it will likely surface pre-existing violations the Stratum CR didn't catch (and perhaps some that Wave 4 Refinement introduced).

Run the new tools, capture all violations, and fix them in a single commit titled "stratum compliance: amnesty pass." This commit should:

- List every violation found
- Apply consistent fixes (same patterns as original Stratum CR — undefined tokens renamed to canonical equivalents, `text-white` to `text-text-on-accent`, etc.)
- Verify visually that fixes don't break anything

After the amnesty commit, CI is strict from that point forward.

#### 3.6.4 Documentation

Add a brief note to the project's contributing docs (or create one):

```markdown
## Stratum Compliance

This project uses the Stratum design system. CI enforces:
- All Tailwind classes must be defined in `tailwind.config.ts`
- All CSS variable references must resolve to definitions in `tokens.css`
- Theme-correct colors only (no hardcoded `text-white` on accent fills; use `text-text-on-accent`)
- Focus indicators via `focus-visible:focus-ring` (uses `--ring-focus`)

If CI fails on Stratum compliance, see `tokens.css` and `tailwind.config.ts` for available tokens. When in doubt, search existing components for similar patterns.
```

### 3.7 Getting-started link resolution

The original Stratum CR removed the "View the getting started guide" link from the welcome banner with the rationale "one banner, one CTA." This left an unanswered question: does `/welcome` route exist with content, or was the link vestigial?

#### 3.7.1 Investigation

Check the current codebase:
- Does `/welcome` route exist? Look in the routes / pages directory.
- If yes, does it have meaningful content, or is it a stub/placeholder?
- Are there other entry points to it elsewhere in the app?

#### 3.7.2 Resolution paths

**Path A: `/welcome` route exists with content.**

The Stratum CR removed its only entry point. This CR adds a discreet entry point so the guide remains discoverable:

- Add a "?" icon to the topbar (right side, near the user menu)
- Click opens a small dropdown with: "Getting started" (links to /welcome), "Keyboard shortcuts" (link to a shortcut reference if exists), "Send feedback" (placeholder for future)
- Style the icon subtly — `text-text-tertiary` with hover `text-text-secondary`

This restores discoverability without putting weight on the welcome banner.

**Path B: `/welcome` route is a stub or doesn't exist.**

The link was vestigial. Document this and remove the route stub if present:

- Delete the `/welcome` route file if it's a stub
- No new entry points to add
- Note in the CR documentation: "Welcome guide content not yet built; deferred to future work"

**Path C: `/welcome` route doesn't exist but should.**

This CR isn't the place to write welcome content. Document as future work and leave alone.

#### 3.7.3 Decision

Run the investigation in section 3.7.1 first. Apply whichever path matches reality. Don't speculate.

### 3.8 Broader focus-ring consistency audit

The original Stratum CR fixed several places to use `focus-visible:focus-ring` instead of ad-hoc `outline` definitions. There are likely other components throughout the app that still use the old pattern.

#### 3.8.1 Audit method

Grep for these patterns:

```
focus-visible:outline
focus:outline (without focus-ring)
focus-visible:ring (without using the focus-ring shorthand)
focus:ring
```

Each hit is a candidate. Triage:
- If the component uses `focus-visible:outline-2 outline-accent-...`, replace with `focus-visible:focus-ring`
- If the component uses `focus:ring-...` (ring without focus-visible), replace with `focus-visible:focus-ring`
- If the component has unique focus styling for a deliberate reason, leave it alone (rare)

#### 3.8.2 Verify all interactive elements have focus indicators

Tab through the entire app — every page, every interactive surface. Verify:

- Every button shows a focus ring
- Every input shows a focus ring
- Every link shows a focus ring
- Every keyboard-navigable element (table cells, list items, etc.) shows a focus ring
- Focus rings are consistent in color, thickness, and offset

If any element is missing a focus indicator entirely, add `focus-visible:focus-ring` to it.

#### 3.8.3 Don't expand scope

This audit is for focus-ring consistency only. Don't expand to:
- General keyboard navigation improvements (separate concern)
- Tab order corrections (separate concern)
- Skip-link patterns (separate concern)

If the audit surfaces deeper accessibility issues, document them as observations for a future accessibility-focused CR. Don't fix them here.

---

## 4. tRPC procedures

No new procedures. This is purely a frontend / tooling CR.

---

## 5. Schema changes

None. Pure frontend / tooling work.

---

## 6. File changes (overview)

```
/atlas
  /src
    /components
      /layout/top-bar.tsx                 (verify Stratum CR fix applied)
      /shell/top-bar-wired.tsx            (verify Stratum CR fix applied)
      /theme-switcher.tsx                 (verify Stratum CR fix applied)
      /tasks/inbox-welcome-banner.tsx     (verify Stratum CR fix applied)
      /notes/note-list-view.tsx           (verify Stratum CR fix or apply spirit)
      
      /notes/editor-bubble-menu.tsx       (audit, fix violations)
      /notes/editor-slash-menu.tsx        (audit, fix violations)
      /notes/editor-block-handle.tsx      (audit, fix violations)
      /notes/editor-block-menu.tsx        (audit, fix violations)
      /notes/note-editor.tsx              (audit wrapper styling)
      
      /tables/table-grid.tsx              (audit, fix violations)
      /tables/table-cell.tsx              (audit, fix violations)
      /tables/table-column-header.tsx     (audit, fix violations)
      /tables/table-add-column-button.tsx (audit, fix violations)
      /tables/table-footer-row.tsx        (audit, fix violations)
      /tables/table-empty-state.tsx       (audit, fix violations)
      
      /errors/error-toast.tsx             (audit, fix violations)
      
      /shell/module-rail.tsx              (footer divider grouping; Trash tooltip)
      
      /shell/topbar-help-menu.tsx         (NEW if path A in 3.7; else N/A)
    
    /styles
      /tokens.css                         (remove unused palettes)
    
  /scripts
    /validate-token-references.ts          (NEW: CSS variable reference validator)
  
  .eslintrc.js                            (UPDATE: add tailwindcss plugin strict)
  
  /package.json                           (add eslint-plugin-tailwindcss dep)
```

Some files may not exist or may have different names — adapt to actual codebase.

---

## 7. Verification

### Stratum CR fixes applied
1. Topbar search placeholder reads "Search or jump to…"
2. Topbar search uses `var(--top-bar-search-max-w)` for max-width
3. Topbar search icon size is 14px
4. Capture button uses `text-text-on-accent` and `bg-accent-primary-hover`
5. Theme switcher segments are 28px tall (h-7), no giant cards
6. Theme switcher segments have focus-ring on tab
7. Welcome banner uses `accent-primary-muted` background (not `accent-brand-muted`)
8. Welcome banner CTA uses `text-text-on-accent`
9. Notes page header title is `text-md`
10. Notes empty state has informational hint, no competing CTA

### Wave 4 Refinement components audit
11. Editor BubbleMenu uses defined Stratum tokens; tested in both themes
12. Editor slash menu uses defined Stratum tokens; tested in both themes
13. Editor block handle and block menu use defined Stratum tokens
14. Tables grid uses `border-border-subtle` for cell borders, theme-appropriate
15. Table cells in selected state use defined accent tokens, not arbitrary
16. Table column headers use Stratum sizing scale (no magic numbers)
17. Table footer row sticks to bottom, uses theme-appropriate background
18. Error toasts use semantic tokens (`bg-surface-danger` or equivalent)
19. Visual inspection in light mode reveals no white-on-white or contrast issues
20. All Wave 4 Refinement components pass automated grep for problem patterns

### Module switcher footer
21. Trash visually grouped with Media (consistent styling, no orphaning)
22. Single divider between primary modules and system tools section
23. No additional divider between Media and Trash

### Trash tooltip
24. Hover Trash → tooltip shows "Trash (⌘9)" or current shortcut
25. Tooltip styling matches other rail item tooltips
26. Tooltip delay matches other rail items

### Token palette cleanup
27. tokens.css has no unreferenced tokens (audit confirms)
28. `accent-brand*` tokens removed entirely (renamed to `accent-primary*` previously)
29. Future-feature tokens (calendar, journal) preserved if intended for upcoming work
30. Removed tokens documented in commit message

### CI tooling
31. `eslint-plugin-tailwindcss` installed and configured strict
32. CI fails when invalid Tailwind class is introduced (test by adding deliberately bad class, expect CI failure)
33. CSS variable reference validator script exists and runs in CI
34. CI fails when undefined CSS variable is referenced (test by adding bad var())
35. Amnesty commit landed; pre-existing violations fixed
36. Contributing docs reference Stratum compliance requirements

### Getting-started resolution
37. Investigation completed: documented whether `/welcome` exists and has content
38. Path A applied: help menu added to topbar; OR
39. Path B applied: stub route removed, no entry points added; OR
40. Path C applied: documented as future work, no changes

### Focus-ring consistency
41. Tab through every page → every interactive element shows focus ring
42. No `focus-visible:outline` or `focus:outline` patterns remaining (use focus-ring shorthand)
43. Focus rings are consistent in color, thickness, and offset across components

### Cross-functional
44. No regressions in any Wave 4a, 4b, or Wave 4 Refinement functionality
45. Light mode and dark mode both visually correct across all surfaces
46. Build passes with new CI tooling enabled

When all 46 verification steps pass, this CR is complete.

---

## 8. Rules of engagement

### 8.1 Audit before fixing

Several sections (3.2, 3.5, 3.8) require finding violations before fixing them. Don't skip the audit step. Document what was found, then fix systematically. This both catches more issues and creates a record of what changed.

### 8.2 Apply consistent token patterns

When fixing a violation, use the same canonical Stratum token the original CR used:
- Hardcoded white text on accent → `text-text-on-accent`
- Opacity-stacked hover → `accent-primary-hover` or designed hover variant
- Ad-hoc focus outline → `focus-visible:focus-ring`
- Magic-number heights → `h-7`, `h-8`, etc. from Stratum scale

Don't invent new patterns when canonical ones exist.

### 8.3 Visual inspection in both themes

Wave 4 Refinement was likely developed primarily in dark mode. Many Stratum violations only manifest in light mode (white-on-white text, illegible contrast, etc.). After every fix, visually verify in both themes.

### 8.4 Keep amnesty commit focused

The amnesty commit fixes pre-existing violations the new CI tooling surfaces. Don't bundle other changes into it. The commit should be atomic: enable strict tooling + fix all violations the tooling exposes, in one PR.

### 8.5 No new components or features

This CR is audit, fix, and tooling. Do not add new components, new features, or new behaviors. If you find yourself wanting to "improve" something beyond Stratum compliance, stop. Note as a separate concern.

The exception: section 3.7 Path A may add a small `topbar-help-menu.tsx` component if `/welcome` route exists. That's a discreet 30-line component, not a feature.

### 8.6 Calendar and Journal tokens are NOT removed

Even if calendar/journal-specific tokens are currently unreferenced (because Wave 5 and Wave 7 haven't shipped), they're intended for upcoming features. Don't remove them as part of the unused-token cleanup.

If unsure whether a token is intended for future use vs. truly orphaned, ask before removing.

### 8.7 CI strictness is the goal, not the obstacle

The amnesty commit might surface a substantial number of pre-existing violations. That's expected — and the whole point. Don't reduce strictness to make the amnesty smaller. Fix what's surfaced, then move forward with strict CI catching everything new.

If the violation count is unexpectedly large (>50 violations), pause and discuss before applying broad fixes. There may be an architectural pattern that needs rethinking.

---

## 9. Recommended Build Sequence

**Phase 1: Apply original Stratum CR fixes (1 day)**

1. Verify each of the 5 Stratum CR fixes is in current code
2. Apply spirit of fix to any file that's been reworked since
3. Visual inspection in both themes

**Phase 2: Audit Wave 4 Refinement components (1-2 days)**

4. Automated grep for problem patterns across new component files
5. Document findings
6. Apply fixes consistently
7. Visual inspection of every Refinement surface in both themes

**Phase 3: Module rail and Trash tooltip (0.5 day)**

8. Footer divider grouping fix
9. Trash tooltip consistency

**Phase 4: Token palette cleanup (0.5 day)**

10. Audit tokens.css for unreferenced tokens
11. Conservative deletion (preserve future-feature tokens)
12. Document removals

**Phase 5: CI tooling and amnesty (1-1.5 days)**

13. Install eslint-plugin-tailwindcss with strict config
14. Write CSS variable reference validation script
15. Wire into CI
16. Run tools against current codebase
17. Apply amnesty fixes to surfaced violations
18. Verify CI fails on deliberately introduced bad code
19. Update contributing docs

**Phase 6: Getting-started resolution (0.5 day)**

20. Investigate `/welcome` route status
21. Apply path A, B, or C based on findings

**Phase 7: Focus-ring consistency audit (0.5 day)**

22. Grep for ad-hoc focus styling
23. Replace with `focus-visible:focus-ring`
24. Tab-test every page

**Phase 8: Verification (0.5 day)**

25. All 46 verification steps

---

## 10. What is NOT in this CR

**Wave 4c territory:**
- Task templates
- Tags on notes  
- Better Inbox processing UX
- Quick capture purpose detection

**Phase 2 territory:**
- General keyboard navigation improvements
- Skip-link patterns
- Comprehensive accessibility audit
- WCAG conformance work
- Screen reader optimization

**Future infrastructure:**
- Type-safe token system (e.g., generating TypeScript types from CSS variables)
- Visual regression testing
- Component documentation / Storybook

If you find yourself building any of these, stop.

---

## 11. Final note

The original Stratum CR was a small, focused fix with great diagnostic quality. This CR completes the work systematically across a larger surface and adds tooling to prevent the same class of bugs going forward.

The discipline matters more than the specific fixes. Strict CI for Tailwind classes and CSS variables means that next time someone introduces an `h-22` situation, they find out at commit time, not when a user reports the visual bug weeks later. That changes the development culture in a small but compounding way.

Approaching F&F production, this kind of foundation work pays back over and over. Visual debt that's invisible during early use becomes painful once users trust the product daily. Better to address it now while the surface area is still small.

Begin with section 9, Phase 1.
