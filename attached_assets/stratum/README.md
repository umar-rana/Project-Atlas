# Stratum Design System

A complete, exhaustive design system for **dense, desktop-first productivity applications** — built so any future productivity-style screen (lists, tables, calendars, forms, dashboards, kanbans, timelines, editors) can be composed without inventing new primitives.

> Aesthetic lineage: Linear, Superhuman, Things, Bear, Notion. Calm, dense, confident, fast — not friendly, not gamified, not whimsical. Precise.

There is no source codebase or Figma; the system was authored from a written spec. All decisions documented in this folder are the source of truth.

---

## Index

| File / folder | What it is |
|---|---|
| `colors_and_type.css` | All design tokens — surfaces, borders, text, accents, viz, calendar, status, type scale, spacing, radius, motion. Both themes. Import this from any artifact. |
| `components.css` | Vanilla-CSS class implementations of every primitive in `preview/`. Framework-agnostic — drop into Vue, Nuxt, plain HTML, or React. ~106 KB. |
| `preview/` | One HTML card per token group / component cluster. These populate the **Design System** tab. 45 cards. |
| `ui_kits/productivity-app/` | Dense click-thru: Today, Inbox, Calendar (week), Project (kanban), Notes (split + reading). |
| `ui_kits/reading-app/` | Long-form journal/notebook recreation — Day One / Bear / iA Writer lineage. Three-pane: notebooks · entries · reader. Source Serif 4, drop-cap, weather strip. |
| `PATTERNS.md` | Cross-cutting behaviors: keyboard-first, sync state, drag/drop, selection, inline editing, autocomplete, focus mode, toasts, confirms, kbd display, density. |
| `ACCESSIBILITY.md` | Contrast measurements (both themes), color-as-only-signal audit, focus rules, motion, hit targets, ARIA semantics, responsive breakpoints, print, forced-colors. Includes a per-primitive audit checklist. |
| `SKILL.md` | Cross-compatible Agent Skills manifest — drop this folder into Claude Code as a skill. |
| `README.md` | This file. |

---

## Content fundamentals

The product talks to a **literate, intentional adult** who chose this tool for serious work. Copy is direct, low-affect, and assumes competence.

| Element | Rule | Example |
|---|---|---|
| Voice | Calm, terse, present tense. Never enthusiastic. | "Schedule for tomorrow." not "Awesome — let's get this scheduled!" |
| POV | Implied second-person, mostly imperative. Avoid "you" unless it sharpens. | "Capture anything." "Move to today." |
| Casing | **Sentence case** everywhere — labels, buttons, menu items, titles. | "New task" not "New Task" |
| Punctuation | No exclamation points. Em-dashes for asides. Periods on full sentences only. | "Saved · 2m ago" |
| Numbers | Tabular figures (`tnum`). Use real units; abbreviate calmly: 12 m, 3 h, Sep 17. | |
| Time | 24-hour for tabular contexts (calendar gutters), 12-hour for prose. Relative time for recent: "2m ago", "Yesterday", then absolute. | |
| Empty states | One short sentence; no illustrations; no jokes. | "Inbox empty." "Nothing scheduled tonight." |
| Errors | Name the cause, name the fix. Never "Oops." Never "Something went wrong." | "Couldn't sync calendar — retrying in 30s." |
| Confirmations | Past tense, single line. Pair with **Undo** wherever destructive. | "Task moved to Today. **Undo**" |
| Emoji | **Never.** Brand uses unicode dots (●), arrows, and Lucide glyphs only. |
| Marketing-ese | Forbidden: "powerful," "seamless," "effortless," "delight." | |

The app is a **piece of equipment**. The copy reflects that.

---

## Visual foundations

### Colors
- **OKLCH** throughout — perceptual lightness consistency across hues.
- **Semantic tokens only.** Components reference `--accent-primary`, never the underlying OKLCH triple. Theme swap = token swap, no re-design.
- **Dark by default.** Background `oklch(18.5% 0.008 265)` — deep ink, not pure black. Raised surfaces are *lighter* than base, not darker. Accent glows; never screams.
- Light mode: near-white base with white raised cards; shadows do most of the elevation work.
- Three-family tag system (outlined / filled / soft pill) so multiple metadata dimensions can co-exist visually.
- 12-hue calendar palette in three treatments (filled / soft / border) to support overlapping events.
- 8-hue × 3-shade data-viz palette designed for distinguishability under common color-vision deficiencies.

### Type
- **Inter (variable)** for UI · **Source Serif 4** for reading mode · **JetBrains Mono** for code & tabular figures.
- UI scale: 11 → 40 px in 10 steps. **13 px is the default body** — the workhorse.
- Reading scale: 16 px serif on 1.7 line-height, max 65ch.
- Weights: 400 / 500 / 600 / 700. **Italic reserved for prose** (quotes, hints) — never UI labels.
- `font-feature-settings: "tnum"` on every numeric column, count, timestamp.

### Spacing
- 8-pt grid + half-steps (1, 2, 6, 10) for ultra-tight composition.
- **Dense mode** primarily uses 2 / 4 / 6 / 8 / 12 / 16. **Reading mode** uses 16 / 24 / 32 / 48.
- Component internal padding is small (4–10 px); section gaps larger (16–24 px). Never inflate.

### Radius
- `radius-md` (6 px) is default for buttons & inputs. Cards/panels use `radius-lg` (8 px). Modals `radius-xl` (12 px). Avoid mixing radii at the same elevation level.

### Backgrounds
- **No images. No illustrations. No gradients.** Solid surface tokens, full stop. Tinted accents come from semi-transparent overlays of accent tokens (`*-muted`, `*-subtle`).
- No textures, no grain. The interface is precise; texture would lie about what it is.

### Borders
- Hairline `--border-subtle` for in-card dividers. `--border-default` for inputs/cards. `--border-strong` for emphasized affordances. Borders carry most visual structure in the dark theme — shadows are auxiliary.

### Shadows / elevation
- Five steps. Dark mode shadows are short, soft, low-alpha; light mode shadows are softer but more pronounced.
- **Surface lightness does most of the work in dark; shadow does most of the work in light.**

### Motion
- Five durations: 80 / 120 / 180 / 280 / 400 ms.
- `ease-standard` `cubic-bezier(0.16, 1, 0.3, 1)` is the default. `ease-spring` is reserved.
- **Every animation must be functional.** No decorative cascades. List items never animate on initial render.
- `prefers-reduced-motion` collapses every duration to 1 ms.

### Hover / press / focus
- Hover: token `--surface-hover` (one step lighter in dark, one step darker in light). Buttons brighten by ~6% rather than changing hue.
- Press: `--surface-active`, no scale transform. Press is felt by color, not size.
- Focus: visible 2 px ring offset by base color, then 2 px `--border-focus`. Always visible — keyboard is first-class.

### Transparency / blur
- Used only for: command-palette scrim (45% black + 2 px blur), accent muted backgrounds (built into the token), avatar stack borders. Never for "glass" panels.

### Layout
- Fixed 232 px sidebar; fluid main column. Topbars are 48 px and never grow. Below 1280 px width, density does not reduce — the system is desktop-first.
- Hint bar ("⌘K Command · 1–6 Sections") floats centered at the bottom — the keyboard cheat sheet is part of the interface, not hidden in a help menu.

### Cards
- `--surface-raised` background, 1 px subtle border, `radius-lg`, `shadow-1` only on hover/elevation. No rounded corners with colored left-border accents (cliché). Status comes from a real **pill** inside the card, not from the card's frame.

---

## Iconography

- **Lucide** is the icon library. Inlined as SVG with `currentColor`, `stroke-width: 1.5px` (2 px for emphasized affordances).
- **Sizes**: 14 (inline with `text-xs`/`text-sm`), 16 (default — buttons, list rows), 20 (primary actions, module switcher), 24 (empty states, large affordances).
- Optical alignment to text baselines, not geometric center.
- **No emoji. No png icons. No unicode-as-icon** (except `●` for status dots, `→` in copy).
- A single SVG mark composes the brand logo (`preview/brand-logo.html`) — three stacked layers, the topmost in `--accent-primary`. The mark is reused without modification at all sizes 14 → 96 px.
- Icon font: **none.** All icons inlined per-component for currentColor inheritance and zero network cost.

If you need an icon not present in Lucide, draw it in the same visual grammar (1.5 px stroke, 24 viewBox, round caps/joins). Substitutions from Heroicons are acceptable when stroke weight matches.

---

## Substitutions to be aware of

- **Inter** is loaded from rsms.me CDN (variable). **Source Serif 4** and **JetBrains Mono** from Google Fonts. No local font files are bundled — if you need offline, drop them into `fonts/` and update the `@import` lines at the top of `colors_and_type.css`.
- No production logos exist (Stratum is the system's own name). The mark in `preview/brand-logo.html` is the canonical lockup.

---

## How to build with this system

1. `<link rel="stylesheet" href=".../colors_and_type.css">` in any HTML you write. That's the contract.
2. If you also want pre-styled components (buttons, inputs, tables, kanban, calendar, doc, palette, etc), add `<link rel="stylesheet" href=".../components.css">` after it. Then use class names like `s-btn`, `s-input`, `s-table`, `s-event`, `s-task-row` — they're all in `preview/` cards as living examples.
3. Set `data-theme="dark"` (or `light`) on `<html>`.
4. Use the type classes (`.t-sm`, `.t-md`, `.t-lg`…) or reference `--text-sm` etc. directly.
5. Never write a hex color. Reference a token. If the token doesn't exist, the design wasn't ready.
6. For new components, look in `preview/` for the closest analogue and lift its grammar. Then check it against `ACCESSIBILITY.md`'s per-primitive checklist before merging.
7. For interaction patterns (drag, sync, autocomplete, etc), follow `PATTERNS.md`. Skip those and the surface stops feeling like Stratum.
