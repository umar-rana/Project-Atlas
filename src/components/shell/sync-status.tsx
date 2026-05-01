"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useLocale } from "@/core/locale/hooks";
import { formatTime } from "@/core/locale/formatters";

type SyncState = "synced" | "syncing" | "error" | "idle";

function useSyncStatus() {
  const { data, isLoading, isFetching, isError, refetch } = trpc.health.ping.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: false,
  });

  const state: SyncState = isLoading || isFetching
    ? "syncing"
    : isError || !data
    ? "idle"
    : data.pong
    ? "synced"
    : "error";

  return { data, state, refetch, isFetching, isError };
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


export function SyncStatus(): React.ReactElement {
  const locale = useLocale();
  const { data, state, refetch, isFetching, isError } = useSyncStatus();
  const [open, setOpen] = React.useState(false);

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
      <PopoverContent align="end" className="w-56 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-ui text-xs font-semibold uppercase tracking-caps text-text-tertiary">
            App status
          </p>
          <button
            type="button"
            onClick={() => {
              toast.promise(
                refetch().then((r) => {
                  if (!r.data?.pong) throw new Error("Server unreachable");
                }),
                {
                  loading: "Checking…",
                  success: "Server is responsive",
                  error: "Server unreachable",
                },
              );
            }}
            disabled={isFetching}
            aria-label="Check now"
            className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 font-ui text-xs text-accent-primary hover:bg-accent-primary-subtle disabled:opacity-50"
          >
            <RefreshCw size={10} className={isFetching ? "animate-spin" : ""} />
            Check now
          </button>
        </div>
        <div className="py-1">
          <div className="flex items-center justify-between">
            <span className="font-ui text-xs text-text-secondary">Server</span>
            <span
              className={cn(
                "inline-block size-2 rounded-full",
                isFetching
                  ? "animate-pulse bg-accent-warning"
                  : isError || !data
                  ? "bg-text-disabled"
                  : "bg-accent-success",
              )}
            />
          </div>
        </div>
        {data?.ts && (
          <p className="mt-2 font-ui text-2xs text-text-tertiary">
            Last checked {formatTime(new Date(data.ts), locale)}
          </p>
        )}
        <a
          href="/admin/health"
          className="mt-2 block font-ui text-2xs text-accent-primary hover:underline"
        >
          Full diagnostics →
        </a>
      </PopoverContent>
    </Popover>
  );
}
