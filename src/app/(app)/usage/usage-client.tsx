"use client";

import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";

function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex h-[180px] items-end gap-2">
        {[60, 90, 45, 75, 110, 55, 80].map((h, i) => (
          <Skeleton
            key={i}
            variant="block"
            className="flex-1 rounded"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
      <Skeleton variant="line" width="100%" />
    </div>
  );
}

const UsageChart = dynamic(() => import("./usage-chart").then((m) => m.UsageChart), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});

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

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface StatCardProps {
  label: string;
  calls: number;
  tokens: number;
  cost: number;
  failures?: number;
}

function StatCard({ label, calls, tokens, cost, failures }: StatCardProps) {
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
        {failures != null && failures > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold tabular-nums text-red-400">{failures}</span>
            <span className="text-xs text-red-400/70">failed</span>
          </div>
        )}
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">AI Usage</h1>
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
          {data.budgetUsd != null &&
            (() => {
              const pct = data.monthly.costUsd / data.budgetUsd;
              if (pct < 0.8) return null;
              const exceeded = pct >= 1;
              return (
                <div
                  className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
                    exceeded
                      ? "border border-red-500/20 bg-red-500/10 text-red-400"
                      : "border border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {exceeded
                    ? `Monthly budget exceeded — ${formatCost(data.monthly.costUsd)} spent of ${formatCost(data.budgetUsd)} limit.`
                    : `You've used ${(pct * 100).toFixed(0)}% of your ${formatCost(data.budgetUsd)} monthly budget — ${formatCost(data.monthly.costUsd)} spent so far.`}
                </div>
              );
            })()}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary">Overview</h2>
            <div className="sm:grid-cols-3 grid grid-cols-1 gap-4">
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
                failures={data.failureCount}
              />
            </div>
          </section>

          {data.recentErrors.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-text-secondary">Recent errors</h2>
              <div className="overflow-hidden rounded-xl border border-red-500/20 bg-surface-raised shadow-1">
                {data.recentErrors.map((err, i) => (
                  <div
                    key={err.id}
                    className={`px-4 py-3 ${i < data.recentErrors.length - 1 ? "border-b border-border-subtle" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-text-secondary">{err.task}</span>
                        <p className="mt-0.5 truncate text-sm text-red-400">{err.error}</p>
                      </div>
                      <span className="shrink-0 text-xs text-text-tertiary">
                        {formatRelativeTime(err.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-text-secondary">Cost by task type</h2>
            <div className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-1">
              <UsageChart data={data.byTask} />
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
                          i < data.byTask.length - 1 ? "border-b border-border-subtle" : ""
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
