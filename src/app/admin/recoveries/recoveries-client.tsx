"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Flag, ChevronRight } from "lucide-react";
import { toast } from "@/lib/toast";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FlagButton({ recoveryId, isFlagged }: { recoveryId: string; isFlagged: boolean }) {
  const utils = trpc.useUtils();
  const flag = trpc.admin.recoveries.flag.useMutation({
    onSuccess: () => {
      toast.success("Recovery flagged as wrong");
      utils.admin.recoveries.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isFlagged) {
    return (
      <span className="flex items-center gap-1 rounded border border-amber-800 bg-amber-950 px-2 py-0.5 font-mono text-2xs text-amber-400">
        <Flag size={10} /> Flagged
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        flag.mutate({ recovery_id: recoveryId });
      }}
      disabled={flag.isPending}
      className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-2xs text-white/50 transition-colors hover:border-amber-800 hover:bg-amber-950 hover:text-amber-400 disabled:opacity-50"
    >
      <Flag size={10} /> Flag as wrong
    </button>
  );
}

export function AdminRecoveriesClient() {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.recoveries.list.useInfiniteQuery(
      { limit: 50 },
      { getNextPageParam: (last) => last.nextCursor, staleTime: 30_000 },
    );

  const orphans = trpc.admin.orphans.listPossible.useInfiniteQuery(
    { limit: 50 },
    { getNextPageParam: (last) => last.nextCursor, staleTime: 30_000 },
  );

  const recoveries = data?.pages.flatMap((p) => p.recoveries) ?? [];
  const possibleOrphans = orphans.data?.pages.flatMap((p) => p.orphans) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-1 font-mono text-lg font-semibold text-white">Recoveries</h1>
        <p className="mb-5 font-mono text-sm text-white/40">
          Automatic orphan recovery events and possible unrecovered orphans.
        </p>
      </div>

      <section>
        <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
          Automatic Recoveries
        </h2>

        {isError && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 font-mono text-sm text-red-400">
            {error?.message ?? "Failed to load recoveries"}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {recoveries.map((r) => {
            const meta = r.meta as {
              orphan_id?: string;
              orphan_email?: string;
              recovered?: { tasks?: number; projects?: number; notes?: number };
            } | null;
            const recovered = meta?.recovered;
            const totalRecovered = recovered
              ? (recovered.tasks ?? 0) + (recovered.projects ?? 0) + (recovered.notes ?? 0)
              : null;
            return (
              <Link
                key={r.id}
                href={`/admin/recoveries/${r.id}`}
                className="group flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-white">
                    {r.user?.email ?? r.user_id ?? "unknown user"}
                  </p>
                  {meta?.orphan_email && (
                    <p className="font-mono text-2xs text-white/40">
                      ← orphan: {meta.orphan_email}
                    </p>
                  )}
                  {recovered && (
                    <p className="mt-0.5 font-mono text-2xs text-emerald-400/70">
                      Recovered: {recovered.tasks ?? 0}T · {recovered.projects ?? 0}P ·{" "}
                      {recovered.notes ?? 0}N
                      {totalRecovered !== null && ` (${totalRecovered} items total)`}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-2xs text-white/25">
                    {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <FlagButton recoveryId={r.id} isFlagged={r.isFlagged} />
                  <ChevronRight
                    size={16}
                    className="text-white/20 transition-colors group-hover:text-white/50"
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {recoveries.length === 0 && !isLoading && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-10 text-center font-mono text-sm text-white/30">
            No automatic recovery events recorded.
          </div>
        )}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mt-3 w-full rounded-md border border-white/10 bg-white/5 py-2.5 font-mono text-sm text-white/60 hover:bg-white/10 disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
          Possible Unrecovered Orphans
        </h2>
        <p className="mb-3 font-mono text-xs text-white/30">
          Soft-deleted users that still own content — may need manual investigation.
        </p>

        {orphans.isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {possibleOrphans.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orphans/${o.id}`}
              className="group flex items-center gap-4 rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 transition-colors hover:bg-amber-950/40"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-amber-200">{o.email}</p>
                <p className="font-mono text-2xs text-white/30">
                  {o.counts.tasks}t · {o.counts.projects}p · {o.counts.notes}n
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xs text-white/25">
                  {new Date(o.deleted_at!).toLocaleDateString()}
                </span>
                <ChevronRight
                  size={16}
                  className="text-amber-600/50 transition-colors group-hover:text-amber-400"
                />
              </div>
            </Link>
          ))}
        </div>

        {possibleOrphans.length === 0 && !orphans.isLoading && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-10 text-center font-mono text-sm text-white/30">
            No unrecovered orphans found.
          </div>
        )}

        {orphans.hasNextPage && (
          <button
            onClick={() => orphans.fetchNextPage()}
            disabled={orphans.isFetchingNextPage}
            className="mt-3 w-full rounded-md border border-white/10 bg-white/5 py-2.5 font-mono text-sm text-white/60 hover:bg-white/10 disabled:opacity-50"
          >
            {orphans.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </div>
  );
}
