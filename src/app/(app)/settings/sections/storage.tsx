"use client";

import { trpc } from "@/lib/trpc/client";
import { ExternalLink } from "lucide-react";
import { SectionHeader } from "./_shared";

export function StorageSection() {
  const stats = trpc.media.stats.useQuery(undefined, { staleTime: 60_000 });
  const s = stats.data;

  function fmtBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Storage" description="Manage your attached files and media." />

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-3 font-ui text-sm font-semibold text-text-primary">Attachment Summary</h3>
        {stats.isLoading ? (
          <p className="font-ui text-xs text-text-tertiary">Loading…</p>
        ) : s ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-base p-3">
              <p className="font-ui text-2xs text-text-tertiary">Total files</p>
              <p className="mt-0.5 font-ui text-xl font-semibold text-text-primary">
                {s.total_count}
              </p>
            </div>
            <div className="rounded-lg bg-surface-base p-3">
              <p className="font-ui text-2xs text-text-tertiary">Storage used</p>
              <p className="mt-0.5 font-ui text-xl font-semibold text-text-primary">
                {fmtBytes(s.total_bytes)}
              </p>
            </div>
          </div>
        ) : null}

        {s && Object.entries(s.by_type).some(([, v]) => v.count > 0) && (
          <div className="mt-4">
            <h4 className="mb-2 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
              By type
            </h4>
            <div className="flex flex-col gap-1">
              {Object.entries(s.by_type)
                .filter(([, v]) => v.count > 0)
                .map(([type, v]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="font-ui text-xs capitalize text-text-secondary">{type}</span>
                    <span className="font-ui text-xs text-text-tertiary">
                      {v.count} file{v.count !== 1 ? "s" : ""} · {fmtBytes(v.bytes)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <a
            href="/media"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
          >
            <ExternalLink size={13} />
            Manage in Media inbox
          </a>
        </div>
      </div>

      {s && (s.unreviewed_count > 0 || s.orphan_count > 0) && (
        <div className="border-accent-warning/30 bg-accent-warning/5 rounded-xl border p-5">
          <h3 className="mb-2 font-ui text-sm font-semibold text-text-primary">
            Cleanup suggestions
          </h3>
          <div className="flex flex-col gap-2">
            {s.unreviewed_count > 0 && (
              <div className="flex items-start justify-between gap-4">
                <p className="font-ui text-xs text-text-secondary">
                  You have <strong>{s.unreviewed_count}</strong> unreviewed attachment
                  {s.unreviewed_count !== 1 ? "s" : ""}.
                </p>
                <a
                  href="/media?reviewed=false"
                  className="shrink-0 font-ui text-xs text-accent-info hover:underline"
                >
                  Review now
                </a>
              </div>
            )}
            {s.orphan_count > 0 && (
              <div className="flex items-start justify-between gap-4">
                <p className="font-ui text-xs text-text-secondary">
                  You have <strong>{s.orphan_count}</strong> orphaned attachment
                  {s.orphan_count !== 1 ? "s" : ""} not attached to any task.
                </p>
                <a
                  href="/media?source=orphaned"
                  className="shrink-0 font-ui text-xs text-accent-info hover:underline"
                >
                  View orphans
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
