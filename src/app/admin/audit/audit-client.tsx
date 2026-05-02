"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function AuditRow({ entry }: {
  entry: {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    user_id: string | null;
    user: { id: string; email: string; name: string | null } | null;
    meta: Record<string, unknown> | null;
    diff: Record<string, unknown> | null;
    created_at: Date | string;
    isWarning: boolean;
  }
}) {
  const [expanded, setExpanded] = React.useState(false);
  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;
  const hasDiff = entry.diff && Object.keys(entry.diff).length > 0;

  return (
    <div className={`rounded-lg border ${entry.isWarning ? "border-red-800 bg-red-950/30" : "border-white/10 bg-white/5"}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        {entry.isWarning ? (
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-400" />
        ) : (
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-white/20" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-medium text-white">{entry.action}</p>
          <p className="font-mono text-2xs text-white/30">
            {entry.entity_type} · {entry.entity_id.slice(0, 8)}…
            {entry.user && ` · ${entry.user.email}`}
          </p>
        </div>
        <p className="mr-2 shrink-0 font-mono text-2xs text-white/25">{formatDate(entry.created_at)}</p>
        {(hasMeta || hasDiff) ? (
          expanded
            ? <ChevronDown size={13} className="text-white/30" />
            : <ChevronRight size={13} className="text-white/30" />
        ) : null}
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-4 pb-3 pt-2">
          {hasMeta && (
            <div className="mb-2">
              <p className="mb-1 font-mono text-2xs text-white/30">META</p>
              <pre className="overflow-auto rounded bg-black/30 p-2 font-mono text-2xs text-white/60">
                {JSON.stringify(entry.meta, null, 2)}
              </pre>
            </div>
          )}
          {hasDiff && (
            <div>
              <p className="mb-1 font-mono text-2xs text-white/30">DIFF</p>
              <pre className="overflow-auto rounded bg-black/30 p-2 font-mono text-2xs text-white/60">
                {JSON.stringify(entry.diff, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminAuditClient() {
  const [action, setAction] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [warningOnly, setWarningOnly] = React.useState(false);
  const [excludeAdminViews, setExcludeAdminViews] = React.useState(true);
  const [dateFrom, setDateFrom] = React.useState(defaultFrom());
  const [dateTo, setDateTo] = React.useState("");

  const usersQuery = trpc.admin.users.list.useInfiniteQuery(
    { filter: "all", limit: 100 },
    { getNextPageParam: (l) => l.nextCursor, staleTime: 60_000 },
  );
  const allUsers = usersQuery.data?.pages.flatMap((p) => p.users) ?? [];

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.audit.search.useInfiniteQuery(
      {
        action: action || undefined,
        user_id: userId || undefined,
        warningOnly,
        excludeAdminViews,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 50,
      },
      {
        getNextPageParam: (last) => last.nextCursor,
        staleTime: 30_000,
      },
    );

  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div>
      <h1 className="mb-1 font-mono text-lg font-semibold text-white">Audit Log</h1>
      <p className="mb-5 font-mono text-sm text-white/40">
        Filterable system activity log — default: past 7 days, admin views hidden. Click rows to expand metadata.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by action…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="min-w-40 rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
        />

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
        >
          <option value="">All users</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
        />
        <span className="flex items-center font-mono text-sm text-white/30">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
        />

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white">
          <input
            type="checkbox"
            checked={warningOnly}
            onChange={(e) => setWarningOnly(e.target.checked)}
            className="accent-red-500"
          />
          Warnings only
        </label>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white">
          <input
            type="checkbox"
            checked={excludeAdminViews}
            onChange={(e) => setExcludeAdminViews(e.target.checked)}
            className="accent-white/50"
          />
          Hide admin views
        </label>
      </div>

      {isError && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 font-mono text-sm text-red-400">
          {error?.message ?? "Failed to load audit log"}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-white/10 bg-white/5" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} />
        ))}
      </div>

      {entries.length === 0 && !isLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-12 text-center font-mono text-sm text-white/30">
          No audit log entries match these filters.
        </div>
      )}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded-md border border-white/10 bg-white/5 py-2.5 font-mono text-sm text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load 50 more"}
        </button>
      )}
    </div>
  );
}
