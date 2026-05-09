"use client";

import { SectionHeader } from "./_shared";

export function AccountSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Account" description="Manage your Atlas account." />
      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Sign Out</h3>
        <p className="mb-4 font-ui text-xs text-text-secondary">
          You will be signed out of Atlas on this device.
        </p>
        <a
          href="/api/auth/logout"
          className="inline-flex rounded-md border border-accent-danger px-4 py-2 font-ui text-sm font-medium text-accent-danger hover:bg-accent-danger-muted"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}
