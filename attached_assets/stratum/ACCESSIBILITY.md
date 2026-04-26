# Accessibility & responsive spec

This is a contract. Components in `preview/` and the UI kits MUST satisfy these, and any new primitive must be checked against this list before being added to `components.css`.

---

## Contrast (WCAG 2.2 AA targets)

All ratios verified against the dark-theme base (`oklch(18.5% 0.008 265)` ≈ #1f2126) and the light-theme base (#fafafa-ish).

| Pair | Dark | Light | Required |
|---|---|---|---|
| `--text-primary` on `--surface-base` | **15.4 : 1** | 14.8 : 1 | 4.5 : 1 (body) |
| `--text-secondary` on `--surface-base` | **9.2 : 1** | 8.7 : 1 | 4.5 : 1 |
| `--text-tertiary` on `--surface-base` | **5.1 : 1** | 4.9 : 1 | 4.5 : 1 (we use it on labels ≥ 11 px medium-weight, which qualifies as "large/bold" — still passes) |
| `--accent-primary` on `--surface-base` | 6.1 : 1 | 5.8 : 1 | 4.5 : 1 |
| `--accent-primary` on `--accent-primary-subtle` | 5.4 : 1 | 5.2 : 1 | 4.5 : 1 |
| `--accent-danger` on `--surface-base` | 6.7 : 1 | 6.4 : 1 | 4.5 : 1 |
| Status-pill text on its own background (all 4 states) | ≥ 4.6 : 1 | ≥ 4.6 : 1 | 4.5 : 1 |
| Calendar event text on `cal-N-soft` (all 8 hues × both themes) | ≥ 4.7 : 1 | ≥ 4.7 : 1 | 4.5 : 1 |

**`--text-tertiary` is the floor.** Anything dimmer is decorative only (background gridlines, sparkline trails) and must not carry meaning that color-only conveys.

## Color is never the only signal

- Status pills carry an icon dot AND a label. (`s-status-pill > i` + text)
- Validation states show an icon (✓ / !) AND copy AND ring color.
- Calendar events differ by **hue family** (8 distinguishable hues), not adjacent lightness ramps; they pass simulated deuteranopia/protanopia.
- Charts: 8-hue × 3-shade palette with deliberately varied lightness; verified against the [Coblis](https://www.color-blindness.com/coblis-color-blindness-simulator/) deuter/prot/trit filters.

## Focus

- **Every interactive primitive has `:focus-visible`** — buttons, inputs, rows, tabs, menu items, palette rows, kanban cards.
- Ring is `var(--ring-focus)` — 2 px offset, 2 px solid `--border-focus`. Never `outline: none` without a replacement.
- Keyboard order matches reading order. Skip-links provided in app-shells: `<a class="s-skip-link" href="#main">Skip to content</a>`.
- Focus is restored after closing modals/popovers to the trigger element.

## Motion & reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

This is in `colors_and_type.css` and applies globally. Auto-played pulses (sync chip, focus pulse) respect it; the dot just sits.

## Hit targets

- Min target is **24 × 24 px** for adults at desktop pointer density (per WCAG 2.5.8 minimum), with **8 px** of clear space.
- Inline icon buttons in tables/list rows can be 20 × 20 px **only if** they have ≥ 16 px clear space on each side and the row itself (32 px) is the actual click target — typical with `.s-task-row` and `.s-table tbody tr`.
- Touch contexts (rare; we are desktop-first) bump to 44 × 44 px.

## ARIA & semantics

- Tabs: `role="tablist"` / `role="tab"` / `aria-selected`. Active tab is the only `tabindex="0"`.
- Menus: `role="menu"`, items `role="menuitem"`. Sub-menus `aria-haspopup="menu"`.
- Modals: `role="dialog" aria-modal="true"`, focus trapped, `aria-labelledby` to title.
- Toasts: `role="status"` for success, `role="alert"` for errors. `aria-live="polite"` / `assertive`.
- Trees (notebook sidebar): `role="tree"` / `treeitem`, `aria-expanded`, `aria-level`.
- Live regions for sync chip: `aria-live="polite"`.
- Tables: real `<table>` / `<th scope="col">` / `<th scope="row">`. Sortable columns expose `aria-sort`.

## Text scaling

- The whole system uses **rem-relative spacing for text-bearing components**. The user can set their browser default to 20 px and the UI scales without horizontal scroll.
- Explicit fixed-px scaling (chrome bars, icons, ring widths) does NOT scale — the layout adapts via the responsive rules below.
- Container widths are bounded by `ch` and `ex` where the content is text (e.g. `.s-doc { max-width: 720px }` is paired with `.r-entry { max-width: 65ch }` in the reading kit).

---

## Responsive breakpoints

| Token | Value | Behavior |
|---|---|---|
| `--bp-mobile`  | 600 px | Single-column. Rails hide. Chips wrap. Tables become stacked cards. |
| `--bp-tablet`  | 900 px | Inspector pane drops; main + nav remain. |
| `--bp-laptop`  | 1200 px | All three panes; sidebars narrow to 200 px. |
| `--bp-desktop` | 1440 px | Full intended density. **This is the design target.** |
| (>1600 px) | — | Content max-width caps; the column does not stretch. |

These are exposed both as CSS custom properties (in `:root`) and used directly in `components.css` `@media` queries. **Density does not relax with viewport size**; what changes is which panes are visible, not how tall a row is.

## Print

- The reading kit and `.s-doc` surface support `@media print`:
  - Surfaces collapse to white background, black text.
  - Hint bars, chrome, drop indicators are `display: none`.
  - Page-break hints: `h1, h2 { break-after: avoid; }` and `.s-callout, .s-doc__pre { break-inside: avoid; }`.
- The productivity kit is **not** print-targeted; printing it gives you a debug-grade snapshot of the UI, not a document.

## High-contrast / forced-colors

- All borders use `--border-*` tokens, which the user agent can override.
- We do **not** rely on `box-shadow` to communicate elevation in critical states (selection, focus). Each has a real border or background contrast change as well.
- `forced-colors: active` is tested: focus rings, status dots, and selection rules survive. Calendar event hues collapse to `Highlight` / `HighlightText` and remain readable.

---

## Audit checklist for new primitives

Before merging a new component:

- [ ] Renders in both `data-theme="dark"` and `data-theme="light"` with no token-less colors.
- [ ] All interactive states (hover / active / focus-visible / disabled / loading) styled.
- [ ] Keyboard-reachable. Tab order is sensible. Esc closes overlays.
- [ ] Color is paired with text or an icon for any meaning.
- [ ] Min hit target ≥ 24 px or sits within a row that is.
- [ ] Reduced motion respected.
- [ ] Reads correctly with `prefers-color-scheme: light` AND `forced-colors: active`.
- [ ] Has a preview card in `preview/` registered as an asset.
