import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  CheckSquare,
  CalendarDays,
  Users,
  FileText,
  BookOpen,
  Mail,
  LogIn,
  Zap,
} from "lucide-react";
import { RequestAccessForm } from "@/components/homepage/request-access-form";

export default async function RootPage() {
  const { userId } = await auth();
  if (userId) redirect("/tasks");

  return (
    <div className="min-h-screen bg-surface-base text-text-primary font-ui">
      <Header />
      <main>
        <Hero />
        <GettingStarted />
        <WhatAtlasIs />
        <Modules />
        <RequestAccess />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface-base/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/icon.svg"
            alt="Atlas"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-lg font-semibold text-text-primary">Atlas</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-md px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-on-accent transition-opacity hover:opacity-90"
          >
            Sign Up
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 text-center tablet:py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-primary shadow-lg">
          <Image src="/icon.svg" alt="Atlas" width={40} height={40} className="rounded-xl" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-text-primary tablet:text-5xl">
          A personal command center for the way you actually work
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-text-secondary">
          Your tasks, your calendar, the people you&apos;re in touch with, your
          notes, your journal — in one place, with the connections between them
          intact.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 tablet:flex-row tablet:justify-center">
          <Link
            href="/sign-in"
            className="w-full rounded-lg bg-accent-primary px-8 py-3 text-base font-medium text-text-on-accent transition-opacity hover:opacity-90 tablet:w-auto"
          >
            Get started
          </Link>
          <a
            href="#modules"
            className="w-full rounded-lg border border-border-default px-8 py-3 text-base font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary tablet:w-auto"
          >
            Learn more
          </a>
        </div>
        <p className="mt-6 text-sm text-text-tertiary">
          Currently in private use among family and friends. By invitation only.
        </p>
      </div>
    </section>
  );
}

const gettingStartedSteps = [
  {
    icon: Mail,
    step: "1",
    title: "Check your invitation email",
    description:
      "Atlas is invite-only. Look for an invitation from Atlas in your inbox — it has a link that takes you straight to the sign-in page.",
  },
  {
    icon: LogIn,
    step: "2",
    title: "Sign in with Google or a magic link",
    description:
      "Click 'Continue with Google' to sign in instantly, or enter your email to receive a one-time magic link — no password needed.",
  },
  {
    icon: Zap,
    step: "3",
    title: "Capture your first task",
    description:
      "You'll land in Tasks. Hit the '+' button or press ⌘⇧I to open Quick Capture and add your first item. That's it — you're in.",
  },
];

function GettingStarted() {
  return (
    <section
      id="getting-started"
      className="border-t border-border-subtle bg-surface-base"
    >
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-2xl font-semibold text-text-primary tablet:text-3xl">
            How to get started
          </h2>
          <p className="mt-3 text-base leading-relaxed text-text-secondary">
            New to Atlas? Here&apos;s how to go from invitation to your first
            captured task in under two minutes.
          </p>
        </div>

        <div className="grid gap-6 tablet:grid-cols-3">
          {gettingStartedSteps.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative rounded-xl border border-border-subtle bg-surface-raised p-6"
              >
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary-subtle">
                    <Icon
                      className="h-4 w-4 text-accent-primary"
                      strokeWidth={1.75}
                    />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                    Step {item.step}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-text-primary">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10">
          <Link
            href="/sign-in"
            className="inline-flex rounded-lg bg-accent-primary px-6 py-2.5 text-sm font-medium text-text-on-accent transition-opacity hover:opacity-90"
          >
            Sign in to Atlas
          </Link>
        </div>
      </div>
    </section>
  );
}

function WhatAtlasIs() {
  return (
    <section className="border-t border-border-subtle bg-surface-raised">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold text-text-primary tablet:text-3xl">
          What Atlas aspires to be
        </h2>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-text-secondary">
          <p>
            Most productivity tools are good at one thing and force you to bolt
            on others. Atlas brings together your tasks, your calendar, the
            people you&apos;re in touch with, your notes, and your journal — so
            the connections between them actually live in one system.
          </p>
          <p>
            The meeting you have tomorrow, the person you&apos;re meeting, the
            project you&apos;ll discuss, the notes you took last week — instead
            of living in separate apps with no awareness of each other, they live
            together. When you reference a person, project, idea, or earlier
            thought, Atlas recognizes it and creates the connection. You
            don&apos;t have to think about organizing — the structure builds
            itself from how you actually work.
          </p>
          <p>
            This is built for people who think carefully about how they work.
            If you&apos;ve tried OmniFocus and Notion and Things and a calendar
            app and a journaling app and felt the friction of moving between
            them, Atlas is for you.
          </p>
        </div>
      </div>
    </section>
  );
}

const modules = [
  {
    icon: CheckSquare,
    name: "Tasks",
    description:
      "Your inbox for everything that needs to happen. Capture a thought in two seconds and it lives somewhere you'll actually see it again. Organize into projects when you're ready, or leave things in the inbox until you have time to think. The bar for capture is low; the bar for focus is high.",
  },
  {
    icon: CalendarDays,
    name: "Calendar",
    description:
      "Your time, visible in one place. Atlas connects to your existing Google Calendar and shows your meetings alongside your tasks — so when you're planning your week, you see both what you've committed to and what you want to get done.",
  },
  {
    icon: Users,
    name: "People",
    description:
      "The contacts and conversations that matter, kept warm. Atlas connects to your Google Contacts and helps you remember the people in your life — not as data records, but as ongoing relationships. When you open a person, you see what's been on your mind about them and what's coming up.",
  },
  {
    icon: FileText,
    name: "Notes",
    description:
      "The thinking you want to keep. Project briefs, meeting notes, reading notes, ideas. Atlas's notes are clean markdown documents — but with one important difference: they connect. A note from a meeting links to the people who were there and the calendar event. A reference to an idea links to that earlier note.",
  },
  {
    icon: BookOpen,
    name: "Journals",
    description:
      "The ongoing record of your days. A daily journal for processing — what happened, what you learned, what's on your mind. It's private, simple, and lives alongside everything else. When you reference a project in your journal entry, you can come back to that project and see the journal entries that mentioned it.",
  },
];

function Modules() {
  return (
    <section id="modules" className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-2xl font-semibold text-text-primary tablet:text-3xl">
        Five modules, one system
      </h2>
      <p className="mt-3 text-base text-text-secondary">
        Each module is useful on its own. Together they become something more.
      </p>
      <div className="mt-12 grid gap-6 tablet:grid-cols-2 laptop:grid-cols-3">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.name}
              className="rounded-xl border border-border-subtle bg-surface-raised p-6 transition-colors hover:border-border-default"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary-subtle">
                <Icon className="h-5 w-5 text-accent-primary" strokeWidth={1.75} />
              </div>
              <h3 className="text-base font-semibold text-text-primary">
                {mod.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {mod.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RequestAccess() {
  return (
    <section className="border-t border-border-subtle bg-surface-raised">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold text-text-primary tablet:text-3xl">
            Request access
          </h2>
          <p className="mt-3 text-base leading-relaxed text-text-secondary">
            Atlas is currently invite-only, shared among a small circle of family
            and friends. If you&apos;re interested in trying it when more spots
            open up, leave your details below.
          </p>
          <div className="mt-8">
            <RequestAccessForm />
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-surface-base">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 tablet:flex-row">
        <div className="flex items-center gap-3">
          <Image
            src="/icon.svg"
            alt="Atlas"
            width={24}
            height={24}
            className="rounded-md"
          />
          <span className="text-sm text-text-tertiary">
            Atlas — a personal command center
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <Link
            href="/privacy"
            className="text-sm text-text-tertiary transition-colors hover:text-text-secondary"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="text-sm text-text-tertiary transition-colors hover:text-text-secondary"
          >
            Terms of Use
          </Link>
        </nav>
      </div>
    </footer>
  );
}
