"use client";

import Link from "next/link";
import type { User } from "@prisma/client";

export function HomeClient({ user }: { user: User }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Atlas</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Settings
          </Link>
          <Link
            href="/admin/health"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Health
          </Link>
          <a
            href="/api/auth/logout"
            className="rounded-md border border-border-default bg-surface-raised px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
          >
            Sign out
          </a>
        </div>
      </header>

      <section className="rounded-xl border border-border-default bg-surface-raised p-6 shadow-1">
        <div className="flex items-center gap-3">
          {user.image ? (
            <img src={user.image} alt="" className="h-10 w-10 rounded-full" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-primary text-sm font-semibold text-text-on-accent">
              {(user.name ?? user.email)[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-text-primary">
              Welcome back, {user.name ?? user.email.split("@")[0]}
            </p>
            <p className="text-sm text-text-secondary">{user.email}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 tablet:grid-cols-3">
        {[
          { href: "/settings", label: "Settings", desc: "Preferences, theme, Drive" },
          { href: "/admin/health", label: "System Health", desc: "Check all foundation services" },
          { href: "/storybook/index.html", label: "Storybook", desc: "Design system components" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col gap-1 rounded-xl border border-border-default bg-surface-raised p-4 shadow-1 hover:bg-surface-hover transition-colors"
          >
            <p className="text-sm font-semibold text-text-primary">{item.label}</p>
            <p className="text-xs text-text-secondary">{item.desc}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-base p-4">
        <p className="text-xs text-text-tertiary">
          Atlas Wave 1 — Foundation layer active. Auth, database, storage, Drive, AI, and tRPC are wired.
        </p>
      </section>
    </main>
  );
}
