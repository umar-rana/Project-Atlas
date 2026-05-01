# Atlas — Wave 4a Phase 2: Locale Formatters & Settings UI

## Overview
Atlas is a desktop-first personal productivity command center designed as a local-first capture intelligence system. It efficiently processes user input by prioritizing cost-effective local parsing methods and using AI services like Claude Haiku only as a fallback for ambiguous cases, significantly reducing AI costs. The project includes a comprehensive captures tRPC router for parsing, previewing, logging, and statistical analysis, a re-engineered capture modal, email-to-inbox functionality, and a robust, authenticated application shell focused on user experience. It aims to be a command center for personal productivity.

## User Preferences
I prefer iterative development with clear, concise communication. Before making major architectural changes or introducing new dependencies, please ask for approval. When implementing features, prioritize desktop-first experiences and ensure strict TypeScript compliance with zero errors. I value a clean codebase with consistent styling (Tailwind CSS driven by Stratum tokens) and well-tested utilities. Avoid making changes to `.github/workflows/ci.yml`.

## System Architecture
The application is built on Next.js 15 (App Router) + React 19 with TypeScript. Styling uses Tailwind CSS 3.4 and custom Stratum tokens, complemented by UI primitives from Radix UI, cmdk, vaul, and sonner. Dark mode is supported via `next-themes`.

**Core Architectural Decisions:**
- **Hybrid Parsing Pipeline**: Utilizes `chrono-node`, regex, and `compromise.js` for local-first input parsing, with Claude Haiku as a fallback for ambiguous cases to optimize AI costs.
- **tRPC API**: Provides a type-safe API layer for all backend interactions.
- **Database**: PostgreSQL via Prisma, featuring a foundational schema for users, audit logs, integration tokens, AI call logs, Notes, NotesFolder, and a generic Link graph table.
- **Authentication**: Clerk (`@clerk/nextjs` v7) handles all authentication, mapping Clerk user IDs to Prisma `User` rows via `clerk_id`.
- **Marketing Pages**: Public-facing marketing homepage at `/`, `/privacy`, and `/terms`. Authenticated users visiting `/` are redirected to `/tasks`.
- **Application Shell**: An authenticated shell featuring a `TwoPaneLayout`, `ModuleSwitcher`, `TopBar`, `CommandPalette` (`⌘K`), and `KeyboardShortcutsOverlay` (`⌘/`).
- **Capture Modals**: A re-engineered `CaptureModal` (`⌘⇧I`) for efficient input capture.
- **Settings and Configuration**: Comprehensive settings for managing profile, appearance, preferences (locale/formatting), capture preferences, integrations, AI, backups, data, and account.
- **Locale Formatting Layer**: `src/core/locale/` provides pure `formatDate`, `formatNumber`, `formatCurrency`, `formatTime`, `formatDateTime`, `formatRelativeDate` functions and a `useLocale()` React hook. Supports Pakistan (PKR), US (USD), UK (GBP), and Custom presets. All date/number/time/currency displays throughout the app use locale-aware formatters instead of hardcoded `toLocaleDateString` or `date-fns` format strings.
- **Email-to-Inbox**: Integration of email parsing (`mailparser`) with Resend inbound webhooks for capturing information from emails, including attachment handling and configurable filtering.
- **Date Handling**: Timezone-aware date utilities using `date-fns-tz`.
- **Google Drive Integration**: Utilizes the Google Drive API for linking and encrypting Drive tokens, with a 4-step OAuth wizard.
- **Queueing**: A priority-aware in-memory dispatch queue with DB-backed rate limiting. `pg-boss` (v10) provides a durable scheduled-job runner for cron jobs like `drive-sync-notes`, `drive-sync-tables`, `session-cleanup`, `trash-retention`, and `attachment-cleanup`.
- **Error Handling & Logging**: Comprehensive audit logging and Pino for structured logging.
- **Extensible Command and Shortcut Registries**: Context-based registries for managing application commands and keyboard shortcuts.
- **UI/UX Decisions**: Desktop-first design, component splitting, `React.memo` for performance, and narrowed Prisma `select` statements for efficiency.
- **Tasks Features**: Includes `ChecklistItem` model, `Checklist tRPC router`, `ChecklistSection` component, `SubtaskSection` and `SubtaskRow` components, updated task inspector with breadcrumbs, checklist progress badges in task list items, and enforced task depth.

## External Dependencies
- **Next.js**: Application framework
- **React**: UI library
- **TypeScript**: Programming language
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI, cmdk, vaul, sonner**: UI component primitives
- **next-themes**: Theming solution
- **@clerk/nextjs**: Authentication service
- **PostgreSQL**: Database
- **Prisma**: ORM for database interaction
- **tRPC**: Type-safe API layer
- **Anthropic Claude**: AI service
- **Cloudflare R2**: Cloud storage for file attachments via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- **Pino + pino-pretty**: Logging
- **Node.js crypto**: AES-256-GCM for encryption
- **Google Drive API (googleapis)**: For Google Drive integration
- **date-fns-tz**: Date and time utilities
- **mailparser**: For parsing email content
- **Resend**: Email service for inbound webhooks and outbound verification emails
- **chrono-node, compromise.js**: For local-first capture parsing
- **pg-boss**: PostgreSQL-backed durable job queue and scheduler (v10)