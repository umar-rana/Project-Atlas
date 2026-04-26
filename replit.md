# Next.js Template

## Overview
A clean Next.js 15 development starter template with Tailwind CSS and shadcn/ui pre-configured. Designed as a launching pad for new projects.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.4
- **Components**: shadcn/ui (style: new-york, base color: neutral)
- **Icons**: Lucide React

## Project Structure
```
src/
├── app/
│   ├── globals.css     # Tailwind directives + CSS variables for theming
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Demo home page
├── components/
│   └── ui/             # shadcn/ui components (button, card pre-installed)
└── lib/
    └── utils.ts        # cn() helper
```

## Configuration Files
- `components.json` — shadcn/ui config (aliases use @/ pointing to src/)
- `tailwind.config.ts` — Theme with shadcn/ui design tokens, dark mode via class
- `next.config.mjs` — Allows all dev origins (required for Replit iframe preview), disables cache headers in dev
- `tsconfig.json` — Path alias `@/*` resolves to `./src/*`

## Development
- Dev server runs on port 5000 (bound to 0.0.0.0 for Replit)
- Workflow: "Start application" runs `npm run dev`
- Add new shadcn components via: `npx shadcn@latest add <component>`

## Replit-Specific Setup
- Server binds to `0.0.0.0:5000` for proxy iframe compatibility
- `allowedDevOrigins: ['*']` in next.config.mjs allows the proxied preview
- Cache-Control set to no-store in development

## Recent Changes
- 2026-04-26: Initial template scaffold with Next.js 15, Tailwind, shadcn/ui (button + card components)
