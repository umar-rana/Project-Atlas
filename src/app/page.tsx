import { ThemeSwitcher } from "@/components/theme-switcher";

export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Atlas</h1>
        <ThemeSwitcher />
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-1">
        <p className="text-md font-medium text-text-primary">Wave 0 bootstrap is live.</p>
        <p className="text-sm text-text-secondary">
          The Stratum design tokens, theme system, and primitive component library are loaded.{" "}
          <a
            href="/storybook/index.html"
            className="font-medium text-accent-primary underline underline-offset-2"
          >
            Open Storybook
          </a>{" "}
          to browse every primitive, composed, and layout component in both themes.
        </p>
      </section>

      <section aria-label="Token palette" className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
        {[
          { name: "Surface base", token: "bg-surface-base border border-border-default" },
          { name: "Surface raised", token: "bg-surface-raised border border-border-subtle" },
          { name: "Accent primary", token: "bg-accent-primary text-text-on-accent" },
          { name: "Accent success", token: "bg-accent-success text-text-on-accent" },
        ].map((s) => (
          <div
            key={s.name}
            className={`flex h-16 items-end justify-start rounded-md p-2 text-2xs font-medium ${s.token}`}
          >
            {s.name}
          </div>
        ))}
      </section>
    </main>
  );
}
