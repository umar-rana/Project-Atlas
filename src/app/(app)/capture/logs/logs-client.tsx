"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useLocale } from "@/core/locale/hooks";
import { formatDate as localeFormatDate } from "@/core/locale/formatters";

export function CaptureLogsClient(): React.ReactElement {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const filterOverrides = searchParams.get("filter") === "overrides";
  const [overridesOnly, setOverridesOnly] = React.useState(filterOverrides);

  const logs = trpc.capture.recentLogs.useQuery(
    { limit: 50, overrides_only: overridesOnly || undefined },
    { staleTime: 30_000 },
  );
  const overrideStats = trpc.capture.overrideStats.useQuery({ days: 0 }, { staleTime: 60_000 });

  const ov = overrideStats.data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <a
          href="/settings?section=ai"
          className="flex items-center gap-1.5 font-ui text-sm text-text-tertiary hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
          Back to AI Settings
        </a>
        <a
          href="/capture/saved"
          className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
        >
          View saved captures →
        </a>
      </div>

      <h1 className="mb-2 font-ui text-xl font-semibold text-text-primary">Capture parse log</h1>
      <p className="mb-6 font-ui text-sm text-text-secondary">
        Review how your captures were parsed and which fields were overridden.
      </p>

      {ov && ov.totalCaptures > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="font-ui text-2xs text-text-tertiary">Total overrides (all time)</p>
            <p className="font-ui text-xl font-semibold text-text-primary">{ov.totalOverrides}</p>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="font-ui text-2xs text-text-tertiary">Override rate</p>
            <p
              className={cn(
                "font-ui text-xl font-semibold",
                ov.overrideRate > 0.3 ? "text-accent-warning" : "text-accent-success",
              )}
            >
              {(ov.overrideRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="font-ui text-2xs text-text-tertiary">Most overridden field</p>
            <p className="font-ui text-xl font-semibold capitalize text-text-primary">
              {ov.mostOverridden ?? "—"}
            </p>
          </div>
        </div>
      )}

      {ov && Object.keys(ov.fieldCounts).length > 0 && (
        <div className="mb-6 rounded-xl border border-border-default bg-surface-raised p-5">
          <h2 className="mb-3 font-ui text-sm font-semibold text-text-primary">
            Override breakdown by field
          </h2>
          <div className="flex flex-col gap-2">
            {(() => {
              const totalFieldEvents = Object.values(ov.fieldCounts).reduce((s, c) => s + c, 0);
              return Object.entries(ov.fieldCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([field, count]) => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="w-24 font-ui text-xs font-medium capitalize text-text-primary">
                      {field}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        style={{
                          width: `${totalFieldEvents > 0 ? (count / totalFieldEvents) * 100 : 0}%`,
                        }}
                        className="h-2 rounded-full bg-accent-primary"
                      />
                    </div>
                    <span className="w-8 text-right font-ui text-xs text-text-tertiary">
                      {count}
                    </span>
                  </div>
                ));
            })()}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOverridesOnly(false)}
            className={cn(
              "rounded-md border px-3 py-1.5 font-ui text-xs font-medium transition-colors",
              !overridesOnly
                ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                : "border-border-default text-text-tertiary hover:text-text-secondary",
            )}
          >
            All captures
          </button>
          <button
            type="button"
            onClick={() => setOverridesOnly(true)}
            className={cn(
              "rounded-md border px-3 py-1.5 font-ui text-xs font-medium transition-colors",
              overridesOnly
                ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                : "border-border-default text-text-tertiary hover:text-text-secondary",
            )}
          >
            Overridden only
          </button>
        </div>
        <button
          type="button"
          onClick={() => logs.refetch()}
          disabled={logs.isFetching}
          className="flex items-center gap-1 rounded-md border border-border-default px-2 py-1.5 font-ui text-xs text-text-tertiary hover:text-text-secondary disabled:opacity-50"
        >
          <RefreshCw size={12} className={logs.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {logs.isLoading ? (
        <p className="font-ui text-sm text-text-tertiary">Loading…</p>
      ) : !logs.data || logs.data.length === 0 ? (
        <p className="font-ui text-sm text-text-tertiary">
          {overridesOnly ? "No overridden captures found." : "No capture logs yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full font-ui text-xs">
            <thead>
              <tr className="border-b border-border-default bg-surface-raised">
                <th className="px-4 py-2 text-left font-medium text-text-tertiary">Title</th>
                <th className="px-4 py-2 text-left font-medium text-text-tertiary">Tier</th>
                <th className="px-4 py-2 text-left font-medium text-text-tertiary">Confidence</th>
                <th className="px-4 py-2 text-left font-medium text-text-tertiary">Source</th>
                <th className="px-4 py-2 text-left font-medium text-text-tertiary">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border-subtle last:border-0 hover:bg-surface-hover"
                >
                  <td className="max-w-xs truncate px-4 py-2 text-text-primary">
                    {entry.title ?? entry.raw_text?.slice(0, 60) ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-medium",
                        entry.parse_tier === "local_only"
                          ? "bg-accent-success/10 text-accent-success"
                          : entry.parse_tier === "local_plus_ai"
                            ? "bg-accent-info/10 text-accent-info"
                            : "bg-accent-warning/10 text-accent-warning",
                      )}
                    >
                      {entry.parse_tier === "local_only"
                        ? "Local"
                        : entry.parse_tier === "local_plus_ai"
                          ? "Local+AI"
                          : "AI"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {(entry.local_confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-2 capitalize text-text-secondary">{entry.source}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-tertiary">
                    {localeFormatDate(entry.created_at, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
