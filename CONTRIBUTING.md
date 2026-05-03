# Contributing to Atlas

## Table of Contents

1. [Development setup](#development-setup)
2. [Design tokens](#design-tokens)
3. [CI checks](#ci-checks)
4. [Focus rings](#focus-rings)
5. [Component conventions](#component-conventions)

---

## Development setup

```bash
npm install
npm run dev       # Next.js dev server on :3000
npm run storybook # Component sandbox on :6006
```

Run all checks before opening a PR:

```bash
npm run lint
npm run typecheck
npm run validate-tokens
```

---

## Design tokens

Atlas uses **Stratum** design tokens for all colors, shadows, and spacing.
**Never use raw shadcn/Radix/Tailwind semantic tokens** — use their Stratum equivalents.

### Token mapping reference

| ❌ Forbidden (shadcn/Radix)         | ✅ Use instead (Stratum)              |
|-------------------------------------|--------------------------------------|
| `bg-popover`                        | `bg-surface-raised`                  |
| `bg-background`                     | `bg-surface-base`                    |
| `bg-muted`                          | `bg-surface-sunken`                  |
| `bg-primary`                        | `bg-accent-primary`                  |
| `bg-primary/90`                     | `hover:bg-accent-primary-hover`      |
| `bg-secondary`                      | `bg-surface-hover`                   |
| `bg-destructive`                    | `bg-accent-danger`                   |
| `bg-destructive/10`                 | `bg-accent-danger-muted`             |
| `bg-accent` (hover state)           | `bg-surface-hover`                   |
| `text-foreground`                   | `text-text-primary`                  |
| `text-muted-foreground`             | `text-text-tertiary`                 |
| `text-accent-foreground`            | `text-text-primary`                  |
| `text-primary-foreground`           | `text-text-on-accent`                |
| `text-destructive`                  | `text-accent-danger`                 |
| `text-primary`                      | `text-accent-primary`                |
| `border-border`                     | `border-border-default`              |
| `shadow-lg`                         | `shadow-2` or `shadow-3`             |
| `ring-primary`                      | `ring-accent-primary`                |
| `focus:border-primary`              | `focus:border-border-focus`          |
| `hover:border-primary`              | `hover:border-accent-primary`        |
| `z-50`                              | `z-overlay`                          |

All tokens are defined in `src/styles/tokens.css` and surfaced through `tailwind.config.ts`.

### Automated check

The token validator runs during CI and locally via:

```bash
npm run validate-tokens
```

It will report every file and line that contains a forbidden token, along with the correct replacement.

---

## CI checks

| Check               | Command                    | When it runs         |
|---------------------|----------------------------|----------------------|
| Type check          | `npm run typecheck`        | PR, pre-push         |
| ESLint              | `npm run lint`             | PR, pre-push         |
| Token validator     | `npm run validate-tokens`  | PR, pre-push         |
| Integration tests   | `npm run test:integration` | PR                   |
| Storybook smoke     | `npm run build-storybook`  | PR                   |

### eslint-plugin-tailwindcss

The ESLint config includes `eslint-plugin-tailwindcss` to enforce class ordering and catch unknown Tailwind utilities. This catches stale/removed tokens at lint time.

---

## Focus rings

Every interactive element (button, link, input, select) **must** expose a visible focus ring for keyboard navigation.

- **Use** the `focus-visible:focus-ring` utility (defined in `src/styles/globals.css`).
- **Never** use `focus:outline-none` without a compensating `focus-visible:` ring.
- **Never** use `focus-visible:outline-none` or `focus-visible:ring-0` unless the element delegates focus to an inner wrapper that already carries `focus-ring`.

The standard pattern:

```tsx
<button
  className="... focus-visible:focus-ring"
>
```

For elements that receive focus programmatically and are not typically keyboard-navigated (e.g., scroll containers), use `tabIndex={-1}` and omit the ring.

---

## Component conventions

### File naming

- One exported component per file.
- File name matches the PascalCase export, lowercased with hyphens: `NoteCard` → `note-card.tsx`.
- Wired (data-fetching) variants live alongside the pure component: `note-card.tsx` + `note-card-wired.tsx`.

### Icon sizes

| Context                     | Size |
|-----------------------------|------|
| Top-bar icon buttons        | 16   |
| Sidebar / module switcher   | 16   |
| Inline / dense toolbar      | 14   |
| Empty-state illustration    | 40   |

### Heights (interactive elements)

| Variant        | Height class |
|----------------|--------------|
| Standard button | `h-8` (32 px) |
| Compact button  | `h-7` (28 px) |
| Top-bar button  | `h-8` (32 px) via `size-8` |
| Input           | `h-8` (32 px) |

### Transitions

Use the custom Atlas utilities for consistency:

```
duration-fast ease-standard    ← most interactive elements
duration-moderate ease-standard ← panels, drawers
```

Do not use Tailwind's `duration-150`, `duration-200`, etc. directly.
