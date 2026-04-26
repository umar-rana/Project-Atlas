# Next.js Template

A clean starter template built with:

- [Next.js 15](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/) components
- [Lucide](https://lucide.dev/) icons

## Getting Started

The development server is configured to run on port 5000:

```bash
npm run dev
```

Edit `src/app/page.tsx` to start building.

## Adding shadcn/ui Components

```bash
npx shadcn@latest add <component>
```

For example:

```bash
npx shadcn@latest add dialog
npx shadcn@latest add input
npx shadcn@latest add dropdown-menu
```

## Project Structure

```
src/
├── app/                # App Router pages and layouts
│   ├── globals.css     # Global styles + theme variables
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/
│   └── ui/             # shadcn/ui components
└── lib/
    └── utils.ts        # cn() utility helper
```

## Configuration Files

- `tailwind.config.ts` — Tailwind theme with shadcn/ui design tokens
- `components.json` — shadcn/ui CLI configuration
- `next.config.mjs` — Next.js configuration
- `tsconfig.json` — TypeScript configuration with `@/*` path alias

## Build for Production

```bash
npm run build
npm start
```
