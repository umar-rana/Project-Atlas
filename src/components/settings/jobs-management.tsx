"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { JobCard } from "./job-card";
import { RefreshCw } from "lucide-react";

export function JobsManagement() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    trpc.jobs.list.useQuery(undefined, {
      refetchOnWindowFocus: false,
      refetchInterval: 30_000,
    });

  const handleMutated = useCallback(() => {
    setTimeout(() => refetch(), 1000);
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border-default bg-surface-raised"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-accent-danger/30 bg-accent-danger-muted px-5 py-4">
        <p className="font-ui text-sm text-accent-danger">
          {error?.message ?? "Failed to load jobs"}
        </p>
      </div>
    );
  }

  const jobs = data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-ui text-xs text-text-tertiary">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} registered · auto-refreshes every 30s
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 font-ui text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {jobs.map((job) => (
        <JobCard key={job.name} job={job} onMutated={handleMutated} />
      ))}
    </div>
  );
}
