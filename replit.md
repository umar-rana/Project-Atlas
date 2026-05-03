# Atlas — Personal Productivity Command Center

## Overview
Atlas is a desktop-first personal productivity command center designed as a local-first capture intelligence system. It prioritizes cost-effective local parsing for user input, using AI only as a fallback to minimize costs. The application is deployed in production, utilizing Neon Postgres for its database, Clerk for authentication, and Cloudflare R2 for file storage. Its core purpose is to streamline personal productivity by providing a comprehensive system for task management, note-taking, and data organization.

## User Preferences
- Iterative development with clear, concise communication
- Ask before major architectural changes or new dependencies
- Desktop-first experiences throughout
- Strict TypeScript compliance — zero errors
- Clean codebase with consistent Tailwind CSS styling driven by Stratum tokens
- Do not modify `.github/workflows/ci.yml`

## System Architecture

### Core Design
Atlas is built on Next.js 15 (App Router) with React 19 and TypeScript, ensuring a robust and type-safe foundation. Styling is managed with Tailwind CSS 3.4 and custom Stratum design tokens for a consistent UI/UX. tRPC provides type-safe end-to-end APIs, while Prisma serves as the ORM for database interactions.

### UI/UX Decisions
The application features a `TwoPaneLayout` with a `ModuleSwitcher`, `TopBar`, and `CommandPalette` (`⌘K`). A `CaptureModal` (`⌘⇧I`) is central to quick input. Marketing pages exist for public information, while the authenticated app resides under `src/app/(app)/`.

A `<Hint>` tooltip component (`src/components/ui/hint.tsx`) wraps interactive controls across the app, providing keyboard-shortcut-aware tooltips via Radix UI. A full-screen **Help Center** overlay (`src/components/help/`) is accessible via the `?` keyboard shortcut, the CircleHelp icon in the module switcher, or "Help Center" in the TopbarHelpMenu. It includes 9 documentation sections with 20 articles and an AI chat panel backed by a streaming Anthropic API route at `src/app/api/help/chat/route.ts`.

### Technical Implementations
- **Authentication**: Handled by Clerk (`@clerk/nextjs` v7), with `clerk_id` mapped to Prisma `User` records. Includes profile synchronization, audit logging for auth events, and mechanisms for orphan recovery.
- **Database**: Primarily uses Neon Postgres. A `post-merge.sh` script ensures Prisma migrations are consistently applied to Neon, overriding local development configurations.
- **Full-Text Search**: Implemented with a `search_vector` column on key models (e.g., Task), populated by database triggers and indexed with a GIN index for efficient querying.
- **Background Jobs**: Powered by pg-boss v10 for durable PostgreSQL-backed cron scheduling, managing tasks like Google Drive sync, session cleanup, and attachment cleanup.
- **Locale & Formatting**: Provides pure functions and a `useLocale()` hook for consistent date, number, and currency formatting, supporting multiple languages and regional preferences.
- **Modules**:
    - **Tasks**: Offers full CRUD operations, subtasks, checklists, recurrence, work logs, and soft-delete capabilities. Features a Forecast view and FTS.
    - **Notes**: Utilizes TipTap (ProseMirror) as the rich-text editor with various extensions for features like block dragging, slash commands, markdown import/export, and image/URL handling. Supports internal references (notes, tags, contexts), backlinks, and Google Drive synchronization.
    - **Tables**: A structured-data module with Prisma models for `Table`, `TablesFolder`, `TableColumn`, `TableRow`, `TableCell`. Supports various column types (Text, Number, Currency, Date, Checkbox, Single Select) and grid features like keyboard navigation, inline editing, and aggregations.
    - **Projects**: Allows free-form project types, dynamic grouping, and comprehensive project detail views with metrics, notes sections, and audit logging.
    - **Admin Panel**: An isolated, gated route group for administrative tasks such as user management, audit log exploration, and job management.
    - **Settings**: Provides user configuration for profile, appearance, preferences, integrations, AI, backups, and system status, including background job management.
    - **Capture Pipeline**: Integrates `CaptureModal` with hybrid parsing (local NLP with Claude Haiku fallback) and email-to-inbox functionality via Resend inbound webhooks.
- **Google Drive Integration**: Features a 4-step OAuth wizard, AES-256-GCM encrypted token storage, and proactive token refreshing for hourly note and table exports.

## External Dependencies
- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS 3.4**
- **Radix UI, cmdk, vaul, sonner** (UI Primitives)
- **@clerk/nextjs v7** (Authentication)
- **Prisma** (ORM)
- **Neon Postgres** (Database)
- **pg-boss v10** (Job Scheduler)
- **TipTap** (Rich-text editor)
- **@tiptap/extension-drag-handle, @tiptap/extension-drag-handle-react**
- **lowlight** (Syntax highlighting)
- **Anthropic Claude** (AI for parsing and assistance)
- **Cloudflare R2** (File storage via `@aws-sdk/client-s3`)
- **Google Drive API (googleapis)**
- **date-fns-tz** (Date utilities)
- **chrono-node, compromise.js** (Local NLP parsing)
- **mailparser** (Email content parsing)
- **Resend** (Email service)
- **Pino, pino-pretty** (Logging)
- **Node.js crypto** (Encryption)
- **uuidv7** (UUID generation)