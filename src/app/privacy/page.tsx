import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Privacy Policy — Atlas",
  description: "How Atlas handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-base font-ui text-text-primary">
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface-base/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/icon.svg" alt="Atlas" width={28} height={28} className="rounded-lg" />
            <span className="text-base font-semibold text-text-primary">Atlas</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-text-tertiary">Last updated: April 2026</p>

        <div className="mt-10 space-y-10 text-base leading-relaxed text-text-secondary">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              The short version
            </h2>
            <p>
              Atlas is a private, invite-only tool. Your data is stored in
              databases owned and controlled by the person who set up your
              instance — not on shared commercial servers analyzed for advertising.
              There is no advertising. There is no selling of your data.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              What data Atlas stores
            </h2>
            <p>
              Atlas stores whatever you put into it: tasks, notes, journal
              entries, calendar events, contact information, and any other
              content you create within the app. This data is stored in a
              private database managed by the person who runs your Atlas
              instance.
            </p>
            <p className="mt-3">
              Atlas also stores your account information provided via Google
              sign-in (name, email address, profile picture), managed through
              Clerk, an authentication provider. You can review Clerk&apos;s
              privacy practices at{" "}
              <a
                href="https://clerk.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-link hover:text-text-link-hover underline"
              >
                clerk.com/privacy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              How Atlas uses AI
            </h2>
            <p>
              Atlas uses AI to help parse natural language when you capture
              tasks. When you write something like &ldquo;call Ahmed about Q2
              partnership next Tuesday,&rdquo; Atlas figures out the structure
              for you.
            </p>
            <p className="mt-3">
              Most captures are handled locally without any external AI call.
              Only ambiguous inputs are sent to a language model (Anthropic
              Claude) for parsing. The content is used solely to parse your
              input — it is not used to train models and is not sold or
              analyzed for advertising purposes.
            </p>
            <p className="mt-3">
              If you prefer no AI involvement in your capture flow, you can
              turn it off in Settings. Atlas works fine without it; you just
              lose the smart parsing of natural language.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Third-party integrations
            </h2>
            <p>
              Atlas can connect to Google Calendar, Google Contacts, and Google
              Drive with your explicit permission. These connections are
              authorized via OAuth and can be revoked at any time in Settings.
              Atlas reads and writes only the data necessary to provide the
              features you use.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Data retention and deletion
            </h2>
            <p>
              Your data is retained as long as your account exists. If you want
              your data deleted, contact the person who manages your Atlas
              instance directly. Because Atlas is privately hosted, there is no
              automated self-service deletion — it is handled manually and
              promptly.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Cookies and tracking
            </h2>
            <p>
              Atlas uses cookies only for session management and theme
              preferences. There are no analytics trackers, advertising pixels,
              or third-party tracking scripts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Changes to this policy
            </h2>
            <p>
              If this policy changes meaningfully, you&apos;ll be notified by
              the person who manages your Atlas instance. This is a private
              tool, so any changes will be communicated personally.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Contact
            </h2>
            <p>
              Questions about your data or this policy? Reach out directly to
              whoever invited you to Atlas.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border-subtle bg-surface-base">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 tablet:flex-row">
          <span className="text-sm text-text-tertiary">Atlas</span>
          <nav className="flex items-center gap-6">
            <Link href="/privacy" className="text-sm text-text-tertiary transition-colors hover:text-text-secondary">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-sm text-text-tertiary transition-colors hover:text-text-secondary">
              Terms of Use
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
