# Atlas Design System (Wave 0)

Atlas is built on **Stratum**, a desktop-first design language tuned for dense
information work. Wave 0 ships only the design system itself — every product
surface (tasks, projects, calendar, AI, editor, etc.) is added in later waves
on top of these primitives.

This document is the build contract. If a component is not described here it
should not exist in the codebase yet.

---

## 1. Token system

Source of truth: `src/styles/tokens.css`. Tokens are exposed to Tailwind via
`tailwind.config.ts`, so utilities like `bg-surface-base` or `text-text-primary`
resolve back to `var(--surface-base)` / `var(--text-primary)`.

Components must use these tokens. Arbitrary values (`text-[10px]`, `z-[91]`,
`bg-black/45`, `top-[14vh]`, `min-w-[200px]`, etc.) are forbidden — if you need
a value, add a token first.

### Token families

| Family         | Example variables                                                                                                                                                                                          | Tailwind utility examples                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Surfaces       | `--surface-base`, `--surface-raised`, `--surface-overlay`, `--surface-sunken`, `--surface-hover`, `--surface-active`, `--surface-selected`, `--surface-selected-hover`                                     | `bg-surface-raised`, `hover:bg-surface-hover`                          |
| Borders        | `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus`, `--border-error`                                                                                                               | `border-border-subtle`, `border-border-error`                          |
| Text           | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled`, `--text-on-accent`, `--text-link`                                                                                              | `text-text-secondary`, `text-text-on-accent`                           |
| Accents        | `--accent-primary`, `--accent-primary-hover`, `--accent-primary-active`, `--accent-primary-muted`, `--accent-primary-subtle`, plus the same suffixes for `success`, `warning`, `danger`, `info`, `neutral` | `bg-accent-primary`, `bg-accent-danger-muted`                          |
| Viz palette    | `--viz-1..12`, `--viz-1-light..12-light`, `--viz-1-strong..12-strong`                                                                                                                                      | `bg-viz-3`, `text-viz-3-strong`, `bg-viz-7-light`                      |
| Cal palette    | `--cal-1-fill..12-fill`, `--cal-1-soft..12-soft`, `--cal-1-border..12-border`                                                                                                                              | `bg-cal-7-soft`, `border-cal-7-border`                                 |
| Scrims & rings | `--scrim-modal`, `--scrim-drawer`, `--ring-input`, `--ring-input-error`, `--ring-card-selected`, `--backdrop-blur-overlay`                                                                                 | `bg-surface-scrim-modal`, `shadow-ring-input`, `backdrop-blur-overlay` |

> **Note:** there is no `--accent-*-soft` or `--status-*` family. Status colors
> live under `--accent-{success,warning,danger,info}` and their `-muted` /
> `-subtle` variants. Likewise the viz palette uses `-light` / `-strong`
> (not `-soft`); `-soft` is reserved for the cal (calendar) palette.

### Sizing & motion tokens

- **Spacing** — `0`, `px`, `0.5`, `1`, `1.25` (5px), `1.5`, `2`, `2.5`, `3`,
  `3.5` (14px), `4`, `5`, `6`, `8`, `10`, `12`, `16`, `20`, `24`. Plus
  pixel-precise component heights `18`, `22`, `26`, `28`, `30`, `36`, `38`
  for buttons, inputs, and rail rows. The named control tokens
  (`h-control-pill`, `h-control-sm`, `h-control-input`, `h-control-md`,
  `h-control-input-md`, `h-control-lg`, `h-control-xl`) are the preferred
  way to express control heights.
  Numeric Tailwind keys that already exist on the spacing scale (e.g. `24`)
  intentionally resolve to the spacing token (`96px`); use `h-control-input`
  for the 24px input height.
- **Radii** — `none`, `2xs` (3px), `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `full`.
- **Type scale** — `text-{4xs,3xs,2xs,xs,sm,base,md,lg,xl,2xl,3xl}` plus
  tracking helpers `tracking-{tight,normal,wide,caps}`. Body copy is **13px**
  (`text-sm`); Stratum overrides shadcn's 14px default. The smallest sizes
  (`text-3xs` = 10px, `text-4xs` = 9px) are reserved for badge labels, kbd
  glyphs, and notification counters.
- **Fonts** — `font-ui` (Inter), `font-reading` (Source Serif 4),
  `font-mono` (JetBrains Mono). Loaded via `next/font` and wired to
  `--font-ui` / `--font-reading` / `--font-mono` on `<html>`.
- **Motion** — `duration-{instant,fast,medium,slow,deliberate}` resolve to
  the `--motion-*` tokens (80 / 120 / 180 / 280 / 400 ms). Easing helpers
  `ease-{standard,out,in,spring}` map to the `--ease-*` tokens. A
  `prefers-reduced-motion` media query in `tokens.css` collapses every
  duration to ~10 ms.
- **Shadows** — `shadow-{0,1,2,3,4,5}` plus the focus-style shadows
  `shadow-ring`, `shadow-ring-input`, `shadow-ring-input-error`,
  `shadow-ring-card-selected`.
- **Z-index** — `z-{base,rail,top-bar,overlay,drawer-backdrop,drawer,
modal-backdrop,modal-content,toast,tooltip}`.
- **Modal sizing** — `w-modal-base`, `max-w-modal-{sm,md,lg,xl,alert,cmd}`,
  `top-modal-top`, `top-modal-top-cmd`. Menus use `min-w-menu` /
  `min-w-menu-select`; the command palette list uses `max-h-menu-cmd`.

### Theming

- Provider: `next-themes` configured with `attribute="data-theme"`,
  `defaultTheme="dark"`, `enableSystem`, `disableTransitionOnChange`.
- `data-theme="dark" | "light"` swaps the entire token set in
  `tokens.css`. The `system` choice is resolved by `next-themes`.
- `ThemeSwitcher` (`src/components/theme-switcher.tsx`) renders three
  options (Dark / Light / System) and updates the provider. The
  `ThemeProvider` wrapper lives in `src/components/providers/theme-provider.tsx`.

---

## 2. Component inventory

All components ship with a `*.stories.tsx` Storybook story. The full inventory
is **41 components** spread across three folders:

### Primitives — `src/components/ui/` (28)

Foundational (5): `Button`, `IconButton`, `Input`, `Textarea`, `Label`.

Display (10): `Avatar`, `AvatarStack`, `Badge`, `Tag`, `StatusPill`, `Card`,
`Separator`, `Skeleton`, `Spinner`, `Progress`.

Form (4): `Checkbox`, `Radio` / `RadioGroup`, `Switch`, `Select`.

Feedback (2): `Tooltip`, `KeyboardShortcut`.

Overlay (7): `Popover`, `DropdownMenu`, `ContextMenu`, `Dialog`, `AlertDialog`,
`Drawer`, `Toast` (Sonner).

### Composed — `src/components/composed/` (7)

`MentionPill`, `TagPill`, `EntityLink`, `EmptyState`, `ReferenceAutocomplete`
(cmdk + Popover), `CommandPalette` (cmdk + Dialog, opens on `⌘K` / `Ctrl+K`),
`InspectorPanel`.

### Layout — `src/components/layout/` (6)

`PageHeader`, `ModuleSwitcher` (48px rail), `TopBar`, `TwoPaneLayout`,
`ThreePaneLayout`, `AppShell`.

---

## 3. Patterns (build contract)

These are non-negotiable rules baked into the components above. New product
work must obey them.

- **Body copy is 13px** (`text-sm`). Stratum is denser than shadcn defaults.
- **Pixel-precise heights** — buttons are 22 / 28 / 36 px, inputs are 24 / 30 px.
  Rails are 48 px; top bar is 48 px. Use the named utilities (`h-control-sm`,
  `h-control-md`, `h-control-input`, etc.), never arbitrary sizes.
- **Sentence case everywhere.** No Title Case, no ALL CAPS except for
  small-caps labels using `tracking-caps` + `text-3xs uppercase`.
- **No emoji, no gradients, no decorative illustration.** Empty states use
  short copy and (optionally) a single line-art icon.
- **Tag is a single primitive** with two props: `family`
  (`"format" | "purpose" | "freeform"`) and `hue` (`1–12`). The colored
  variants render against the **cal** palette
  (`bg-cal-{n}-soft text-cal-{n}-fill border-cal-{n}-border`); the viz
  palette is reserved for charts, sparklines, and data viz. `TagPill`
  (composed) wraps `Tag` with reference linking and hover affordance.
- **Keyboard shortcuts** render with `KeyboardShortcut`, which uses Unicode
  glyphs `⌘ ⇧ ⌃ ⌥ ⏎ ⌫ ⎋ ⇥` for modifier combos and the middle dot (`·`)
  for sequences. Never spell out "Cmd+Shift+K".
- **AlertDialog button order** — destructive verb on the **left**, `Cancel`
  pinned to the right with `ml-auto`. The destructive button uses the
  `danger` variant. The verb names the action ("Delete 4 projects"), never
  "OK" / "Confirm".
- **Focus** — every interactive element uses the focus-ring tokens
  (`shadow-ring`, `shadow-ring-input`, `shadow-ring-input-error`,
  `shadow-ring-card-selected`). No outline removal without a replacement.
- **Tabular numbers** — counts, durations, and time strings use
  `.tabular-nums` (utility in `globals.css`).
- **Stratum overrides shadcn.** When a shadcn default conflicts with a
  Stratum spec (size, radius, color, casing), Stratum wins.

---

## 4. Accessibility contract

- Every primitive that wraps a Radix component preserves Radix's a11y
  semantics — do not rebuild from scratch with `<div>`s.
- Color contrast is verified against WCAG AA at 4.5:1 for body and 3:1 for
  large text in both themes; the token set was tuned for this.
- Focus states are always visible. The `--ring-focus` family is the
  single source of truth for focus styling.
- `prefers-reduced-motion: reduce` collapses every duration to ~10 ms via
  `tokens.css`. Do not add CSS animations that bypass this.
- Icon-only controls (`IconButton`) require an `aria-label`.
- `Tooltip` is for supplemental info only — never for primary labels.
- `CommandPalette` and `Drawer` trap focus and restore it on close (Radix
  defaults; do not override).
- Keyboard targets are ≥ 22 px tall (smallest `IconButton`); pointer targets
  ≥ 28 px where possible.

---

## 5. How to add a new component

1. **Decide the layer.** Primitive (no app concept), composed (combines
   primitives, may carry app vocabulary like "mention"), or layout (page
   chrome). New product UI almost never lives in `src/components/ui/`.
2. **Check tokens first.** If you reach for a hex code, a `px` value, or a
   font-size literal, you're missing a token. Add it to `tokens.css` and
   expose it in `tailwind.config.ts` rather than hardcoding.
3. **Author the component** under the right folder. Use `cn()` from
   `src/lib/utils.ts` and `cva` for variant APIs.
4. **Write a story.** Every component must have `*.stories.tsx` covering the
   default state and any meaningful variants. Stories are the design review
   surface. Story files import from `@storybook/nextjs` (the framework
   package), never from `@storybook/react`.
5. **Verify.** Run `npm run type-check`, `npm run lint`, `npm run build`,
   and `npm run build-storybook` before opening review. Storybook
   (`npm run storybook`) should render the new story with both themes via
   the toolbar toggle.
6. **Document it here** if it's a new pattern, not just a new component.

---

## 6. File map

```
src/styles/tokens.css                       Stratum tokens (single source of truth)
src/app/globals.css                         Imports tokens + base reset
tailwind.config.ts                          Exposes every token to Tailwind
src/app/layout.tsx                          Loads next/font, ThemeProvider, Toaster
src/components/providers/theme-provider.tsx ThemeProvider (next-themes)
src/components/theme-switcher.tsx           Dark / Light / System toggle
src/components/ui/                          28 primitives + stories
src/components/composed/                    7 composed components + stories
src/components/layout/                      6 layout shells + stories
.storybook/                                 main.ts + preview.tsx (theme toolbar)
docs/design-system.md                       This file
```
