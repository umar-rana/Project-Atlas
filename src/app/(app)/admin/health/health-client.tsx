"use client";

import { trpc } from "@/lib/trpc/client";

const CHECK_LABELS: Record<string, string> = {
  database: "Database",
  object_storage: "Object Storage",
  logging: "Logging",
  queue: "Rate Limit Queue",
  drive: "Google Drive",
  ai: "AI (Claude)",
  trpc: "tRPC",
  oidc: "OIDC Discovery",
  auth: "Auth",
};

const CHECK_ORDER = [
  "database",
  "object_storage",
  "logging",
  "queue",
  "drive",
  "ai",
  "trpc",
  "oidc",
  "auth",
];

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-success-muted">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Pass">
        <path
          d="M2.5 7L5.5 10L11.5 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent-success"
        />
      </svg>
    </div>
  ) : (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-danger-muted">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Fail">
        <path
          d="M4 4L10 10M10 4L4 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-accent-danger"
        />
      </svg>
    </div>
  );
}

export function HealthClient({ userId: _userId }: { userId: string }) {
  const { data, isLoading, refetch, isFetching } = trpc.health.full.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const isRunning = isLoading || isFetching;
  const allOk = data?.ok ?? false;

  return (
    <div className="overflow-y-auto h-full">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">System Health</h1>
            {data?.checkedAt && (
              <p className="mt-1 text-xs text-text-tertiary">
                Last checked: {new Date(data.checkedAt as string).toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRunning}
            className="rounded-lg border border-border-default bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
          >
            {isRunning ? "Running…" : "Re-run all checks"}
          </button>
        </div>

        <div
          className={`mb-6 rounded-xl border p-4 ${
            isRunning
              ? "border-border-default bg-surface-raised"
              : allOk
                ? "border-accent-success bg-accent-success-muted"
                : "border-accent-danger bg-accent-danger-muted"
          }`}
        >
          <p className="text-sm font-semibold text-text-primary">
            {isRunning ? "Running checks…" : allOk ? "All systems operational" : "One or more checks failed"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {CHECK_ORDER.map((checkKey) => {
            const check = (data?.checks as Record<string, { ok: boolean; message?: string; latencyMs?: number }>)?.[checkKey];
            return (
              <div
                key={checkKey}
                className="flex items-center justify-between rounded-xl border border-border-default bg-surface-raised px-5 py-4 shadow-1"
              >
                <div className="flex items-center gap-3">
                  {isRunning ? (
                    <div className="h-6 w-6 animate-pulse rounded-full bg-surface-overlay" />
                  ) : (
                    <StatusIcon ok={check?.ok ?? false} />
                  )}
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {CHECK_LABELS[checkKey] ?? checkKey}
                    </p>
                    {check?.message && <p className="text-xs text-text-tertiary">{check.message}</p>}
                    {check?.latencyMs !== undefined && (
                      <p className="text-xs text-text-tertiary">{check.latencyMs}ms</p>
                    )}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-3xs font-medium uppercase tracking-caps ${
                    isRunning
                      ? "bg-surface-overlay text-text-tertiary"
                      : check?.ok
                        ? "bg-accent-success-muted text-accent-success"
                        : "bg-accent-danger-muted text-accent-danger"
                  }`}
                >
                  {isRunning ? "Running" : check?.ok ? "Pass" : "Fail"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
