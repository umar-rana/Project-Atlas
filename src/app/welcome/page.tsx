import Image from "next/image";
import Link from "next/link";
import { Mail, LogIn, Zap } from "lucide-react";

export const metadata = {
  title: "Welcome to Atlas",
  description: "New to Atlas? Here's how to get started in a few simple steps.",
};

const steps = [
  {
    icon: Mail,
    step: "1",
    title: "Check your invitation email",
    description:
      "Atlas is invite-only. Look for an invitation from Atlas in your inbox — it has a link that brings you straight here to sign in.",
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
      "You'll land in Tasks. Hit the '+' button or press ⌘⇧I to open Quick Capture and add your first item. That's all it takes to begin.",
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-surface-base font-ui text-text-primary">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-primary shadow-2">
            <Image src="/icon.svg" alt="Atlas" width={32} height={32} className="rounded-lg" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary tablet:text-4xl">
            Welcome to Atlas
          </h1>
          <p className="mt-4 text-base leading-relaxed text-text-secondary">
            You&apos;ve been invited. Here&apos;s how to get set up in under two minutes.
          </p>
        </div>

        <div className="space-y-4">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const isLast = index === steps.length - 1;
            return (
              <div key={item.step} className="relative flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary-subtle">
                    <Icon className="h-4 w-4 text-accent-primary" strokeWidth={1.75} />
                  </div>
                  {!isLast && <div className="mt-2 w-px flex-1 bg-border-subtle" />}
                </div>
                <div className="pb-8">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-text-tertiary">
                    Step {item.step}
                  </span>
                  <h2 className="text-base font-semibold text-text-primary">{item.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-border-subtle bg-surface-raised p-6">
          <p className="mb-4 text-sm leading-relaxed text-text-secondary">
            Ready? Sign in to Atlas and start capturing — your tasks, calendar, notes, and journal
            are waiting.
          </p>
          <Link
            href="/sign-in"
            className="inline-flex rounded-lg bg-accent-primary px-6 py-2.5 text-sm font-medium text-text-on-accent transition-opacity hover:opacity-90"
          >
            Sign in to Atlas
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-text-tertiary">
          Questions?{" "}
          <Link href="/" className="text-accent-primary hover:underline">
            Learn more about Atlas
          </Link>
        </p>
      </div>
    </div>
  );
}
