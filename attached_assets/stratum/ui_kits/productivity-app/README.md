# Stratum — Productivity App UI Kit

Dense, keyboard-ready desktop productivity interface. Demonstrates the system's primitives composed into real screens.

## Screens
- **Today** — grouped task list with Overdue / Today / Tonight, status pills, project markers, tabular time column.
- **Inbox** — capture queue, newest-first.
- **Calendar** — week view 7am–4pm, three event variants (filled / soft / border), tabular hours, today column tint.
- **Project (Q4 Launch)** — kanban board with status pills, tag families, avatar stack.
- **Notes** — split view list + reading-mode renderer using Source Serif 4.

## Components in here
`Sidebar`, `Topbar`, `TaskRow`, `Tag`, `Pill`, `Icon`, `Kbd`, `CommandPalette`, kanban `kcard`, calendar event blocks, reading article.

## Interactions
- `⌘K` open command palette
- `1`–`6` jump to sections
- click checkbox to complete tasks
- theme toggle in sidebar foot

## Files
- `index.html` — entry; loads tokens, data, App.jsx
- `style.css` — kit-specific layout (token-only)
- `App.jsx` — all React components
- `data.js` — sample data (tasks, events, kanban, notes)
