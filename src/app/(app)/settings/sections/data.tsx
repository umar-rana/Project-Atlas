"use client";

import { SectionHeader } from "./_shared";

export function DataSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Data" description="Manage your Atlas data." />
      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Trash</h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          Deleted items are kept for 30 days before permanent removal.
        </p>
        <a
          href="/trash"
          className="inline-flex rounded-md border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
        >
          View Trash
        </a>
      </div>
      <div className="border-border-dashed rounded-xl border border-dashed bg-surface-sunken px-6 py-8 text-center">
        <p className="font-ui text-sm text-text-tertiary">
          Export and import tools coming in a future wave.
        </p>
      </div>
    </div>
  );
}
