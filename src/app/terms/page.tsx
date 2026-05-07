import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Terms of Use — Atlas",
  description: "Terms of use for Atlas.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-base font-ui text-text-primary">
      <header className="bg-surface-base/90 sticky top-0 z-50 border-b border-border-subtle backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/icon.svg" alt="Atlas" width={28} height={28} className="rounded-lg" />
            <span className="text-base font-semibold text-text-primary">Atlas</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Terms of Use</h1>
        <p className="mt-2 text-sm text-text-tertiary">Last updated: April 2026</p>

        <div className="mt-10 space-y-10 text-base leading-relaxed text-text-secondary">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">What Atlas is</h2>
            <p>
              Atlas is a private, personal productivity tool built and maintained by Umar, shared by
              invitation with a small group of family and friends. It is not a commercial product.
              Access is granted personally and can be withdrawn at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Permitted use</h2>
            <p>
              You may use Atlas for your own personal productivity — organizing your tasks, notes,
              journal, calendar, and contacts for your own life and work. Atlas is for personal use
              only. You may not use it for any commercial purpose, resell access to it, or allow
              others to use your account.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Your content</h2>
            <p>
              Everything you create in Atlas — tasks, notes, journal entries, and any other content
              — belongs to you. You are responsible for what you store in Atlas. Don&apos;t store
              anything illegal, harmful, or that you don&apos;t have the right to store.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">No warranties</h2>
            <p>
              Atlas is provided as-is, without warranties of any kind, express or implied. It is a
              personal project that is actively developed and may have bugs, rough edges, or
              unexpected behavior. You should maintain your own backups of anything important.
            </p>
            <p className="mt-3">
              Umar is not liable for any loss of data, missed tasks, or other harm arising from your
              use of Atlas. By using Atlas, you acknowledge that it is a personal tool shared in
              good faith, not a production-grade commercial service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Account access</h2>
            <p>
              Your Atlas account is personal to you. You are responsible for keeping your login
              credentials secure. If you suspect your account has been accessed without your
              permission, notify whoever manages your Atlas instance immediately.
            </p>
            <p className="mt-3">
              Access to Atlas may be suspended or terminated if these terms are violated, if you are
              no longer part of the invited group, or at the discretion of the person managing your
              instance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Third-party services</h2>
            <p>
              Atlas integrates with third-party services including Google (Calendar, Contacts,
              Drive) and Anthropic (AI parsing). Your use of these integrations is also subject to
              their respective terms of service. Atlas is not affiliated with or endorsed by these
              services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Changes to these terms</h2>
            <p>
              If these terms change in a meaningful way, you will be notified directly by whoever
              manages your Atlas instance. Continued use of Atlas after notice of changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Contact</h2>
            <p>Questions about these terms? Reach out directly to whoever invited you to Atlas.</p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border-subtle bg-surface-base">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 tablet:flex-row">
          <span className="text-sm text-text-tertiary">Atlas</span>
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
    </div>
  );
}
