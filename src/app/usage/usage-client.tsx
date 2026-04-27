"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface StatCardProps {
  label: string;
  calls: number;
  tokens: number;
  cost: number;
}

function StatCard({ label, calls, tokens, cost }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tabular-nums text-text-primary">{calls}</span>
          <span className="text-xs text-text-secondary">calls</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold tabular-nums text-text-primary">
            {formatTokens(tokens)}
          </span>
          <span className="text-xs text-text-secondary">tokens</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium tabular-nums text-accent-primary">
            {formatCost(cost)}
          </span>
          <span className="text-xs text-text-secondary">cost</span>
        </div>
      </div>
    </div>
  );
}

export function UsageClient() {
  const { data, isLoading, error } = trpc.ai.usageStats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          AI Usage
        </h1>
        <Link
          href="/"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-sm text-text-secondary">
          Loading usage data…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-accent-danger bg-accent-danger-muted px-4 py-3 text-sm text-accent-danger">
          Failed to load usage data: {error.message}
        </div>
      )}

      {data && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary">Overview</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Today"
                calls={data.daily.calls}
                tokens={data.daily.inputTokens + data.daily.outputTokens}
                cost={data.daily.costUsd}
              />
              <StatCard
                label="This week"
                calls={data.weekly.calls}
                tokens={data.weekly.inputTokens + data.weekly.outputTokens}
                cost={data.weekly.costUsd}
              />
              <StatCard
                label="All time"
                calls={data.allTime.calls}
                tokens={data.allTime.inputTokens + data.allTime.outputTokens}
                cost={data.allTime.costUsd}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary">
              Breakdown by task type
            </h2>
            {data.byTask.length === 0 ? (
              <div className="rounded-xl border border-border-subtle bg-surface-base px-4 py-6 text-center text-sm text-text-tertiary">
                No AI calls recorded yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Task
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Calls
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Tokens
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTask.map((row, i) => (
                      <tr
                        key={row.task}
                        className={
                          i < data.byTask.length - 1
                            ? "border-b border-border-subtle"
                            : ""
                        }
                      >
                        <td className="px-4 py-3 font-mono text-xs text-text-primary">
                          {row.task}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                          {row.calls}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                          {formatTokens(row.inputTokens + row.outputTokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-accent-primary">
                          {formatCost(row.costUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
