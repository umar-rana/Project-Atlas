"use client";

import { trpc } from "@/lib/trpc/client";
import { useLocale } from "@/core/locale/hooks";
import { formatDateTime } from "@/core/locale/formatters";

type WaitlistStatus = "pending" | "invited" | "dismissed";

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  pending: "Pending",
  invited: "Invited",
  dismissed: "Dismissed",
};

const STATUS_STYLES: Record<WaitlistStatus, string> = {
  pending: "bg-surface-overlay text-text-secondary",
  invited: "bg-accent-success-muted text-accent-success",
  dismissed: "bg-accent-danger-muted text-accent-danger",
};

function StatusBadge({ status }: { status: string }) {
  const s = (status as WaitlistStatus) in STATUS_LABELS ? (status as WaitlistStatus) : "pending";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-3xs font-medium uppercase tracking-caps ${STATUS_STYLES[s]}`}>
      {STATUS_LABELS[s]}
    </span>
  );
}

export function WaitlistClient() {
  const locale = useLocale();
  const { data: entries, isLoading, refetch } = trpc.waitlist.adminList.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const updateStatus = trpc.waitlist.adminUpdateStatus.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const counts = {
    total: entries?.length ?? 0,
    pending: entries?.filter((e) => e.status === "pending").length ?? 0,
    invited: entries?.filter((e) => e.status === "invited").length ?? 0,
    dismissed: entries?.filter((e) => e.status === "dismissed").length ?? 0,
  };

  return (
    <div className="overflow-y-auto h-full">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Waitlist</h1>
            <p className="mt-1 text-sm text-text-tertiary">
              {isLoading
                ? "Loading…"
                : `${counts.total} total · ${counts.pending} pending · ${counts.invited} invited · ${counts.dismissed} dismissed`}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-border-default bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border-default bg-surface-raised" />
            ))}
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="rounded-xl border border-border-default bg-surface-raised px-6 py-12 text-center">
            <p className="text-sm text-text-tertiary">No waitlist entries yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-border-default bg-surface-raised px-5 py-4 shadow-1"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text-primary">{entry.name}</p>
                      <StatusBadge status={entry.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-text-secondary">{entry.email}</p>
                    {entry.message && (
                      <p className="mt-2 text-sm text-text-tertiary line-clamp-2">{entry.message}</p>
                    )}
                    <p className="mt-2 text-xs text-text-tertiary">
                      {formatDateTime(new Date(entry.created_at), locale)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {entry.status !== "invited" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: entry.id, status: "invited" })}
                        disabled={updateStatus.isPending}
                        className="rounded-lg border border-accent-success bg-accent-success-muted px-3 py-1.5 text-xs font-medium text-accent-success hover:opacity-80 disabled:opacity-50"
                      >
                        Mark Invited
                      </button>
                    )}
                    {entry.status !== "dismissed" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: entry.id, status: "dismissed" })}
                        disabled={updateStatus.isPending}
                        className="rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    )}
                    {entry.status !== "pending" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: entry.id, status: "pending" })}
                        disabled={updateStatus.isPending}
                        className="rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
