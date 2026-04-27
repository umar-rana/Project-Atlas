"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

type SyncState = "synced" | "syncing" | "error" | "idle";

function useSyncStatus() {
  const { data, isLoading, isFetching, refetch } = trpc.health.full.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const state: SyncState = isLoading || isFetching
    ? "syncing"
    : !data
    ? "idle"
    : data.ok
    ? "synced"
    : "error";

  return { data, state, refetch, isFetching };
}

const DOT_CLASSES: Record<SyncState, string> = {
  synced: "bg-accent-success",
  syncing: "bg-accent-warning animate-pulse",
  error: "bg-accent-danger",
  idle: "bg-text-disabled",
};

const STATE_LABELS: Record<SyncState, string> = {
  synced: "All systems operational",
  syncing: "Checking…",
  error: "Issues detected",
  idle: "Unknown",
};

function CheckRow({ label, ok, latencyMs }: { label: string; ok: boolean; latencyMs?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="font-ui text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">
        {latencyMs !== undefined && (
          <span className="font-mono text-2xs text-text-tertiary">{latencyMs}ms</span>
        )}
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            ok ? "bg-accent-success" : "bg-accent-danger",
          )}
        />
      </div>
    </div>
  );
}

export function SyncStatus(): React.ReactElement {
  const { data, state, refetch, isFetching } = useSyncStatus();
  const [open, setOpen] = React.useState(false);

  const checks = data?.checks as Record<string, { ok: boolean; latencyMs?: number }> | undefined;

  const CHECK_LABELS: Record<string, string> = {
    database: "Database",
    object_storage: "Object Storage",
    drive: "Google Drive",
    ai: "AI (Claude)",
    trpc: "tRPC",
    auth: "Auth",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Sync status: ${STATE_LABELS[state]}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-ui text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
        >
          <span className={cn("size-2 rounded-full transition-colors", DOT_CLASSES[state])} />
          <span className="hidden tablet:inline">{STATE_LABELS[state]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
            Sync status
          </p>
          <button
            type="button"
            onClick={() => {
              toast.promise(
                refetch().then((r) => {
                  if (!r.data?.ok) throw new Error("Issues detected");
                }),
                {
                  loading: "Checking services…",
                  success: "All systems operational",
                  error: "Issues detected — check the health dashboard",
                },
              );
            }}
            disabled={isFetching}
            aria-label="Sync now"
            className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 font-ui text-xs text-accent-primary hover:bg-accent-primary-subtle disabled:opacity-50"
          >
            <RefreshCw size={10} className={isFetching ? "animate-spin" : ""} />
            Sync now
          </button>
        </div>
        <div className="divide-y divide-border-subtle">
          {checks
            ? Object.entries(checks)
                .filter(([key]) => CHECK_LABELS[key])
                .map(([key, result]) => (
                  <CheckRow
                    key={key}
                    label={CHECK_LABELS[key] ?? key}
                    ok={result.ok}
                    latencyMs={result.latencyMs}
                  />
                ))
            : (
              <p className="py-2 font-ui text-xs text-text-tertiary">
                {isFetching ? "Checking services…" : "No data yet"}
              </p>
            )}
        </div>
        {data?.checkedAt && (
          <p className="mt-2 font-ui text-2xs text-text-tertiary">
            Last checked {new Date(data.checkedAt as string).toLocaleTimeString()}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
