"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Search, ChevronRight, User2, Trash2 } from "lucide-react";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdminUsersClient() {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"active" | "deleted" | "all">("active");
  const [sort, setSort] = React.useState<"created_at" | "name" | "email" | "updated_at">("created_at");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.users.list.useInfiniteQuery(
      {
        search: debouncedSearch || undefined,
        filter,
        sort,
        sortDir,
        limit: 50,
      },
      {
        getNextPageParam: (last) => last.nextCursor,
        staleTime: 30_000,
      },
    );

  const users = data?.pages.flatMap((p) => p.users) ?? [];

  return (
    <div>
      <h1 className="mb-1 font-mono text-lg font-semibold text-white">Users</h1>
      <p className="mb-5 font-mono text-sm text-white/40">
        All user accounts — search, filter, and click to inspect.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "active" | "deleted" | "all")}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
        >
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
          <option value="all">All</option>
        </select>

        <select
          value={`${sort}:${sortDir}`}
          onChange={(e) => {
            const [s, d] = e.target.value.split(":");
            setSort(s as typeof sort);
            setSortDir(d as "asc" | "desc");
          }}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
          <option value="email:asc">Email A–Z</option>
          <option value="updated_at:desc">Recently updated</option>
        </select>
      </div>

      {isError && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 font-mono text-sm text-red-400">
          {error?.message ?? "Failed to load users"}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/admin/users/${user.id}`}
            className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <User2 size={18} className="text-white/50" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-mono text-sm font-medium text-white">
                  {user.name ?? user.email.split("@")[0]}
                </p>
                {user.deleted_at && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-2xs bg-red-950 text-red-400 border border-red-800">
                    deleted
                  </span>
                )}
                {user.recovery_notification_pending && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-2xs bg-amber-950 text-amber-400 border border-amber-800">
                    recovered
                  </span>
                )}
              </div>
              <p className="truncate font-mono text-xs text-white/40">{user.email}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-xs text-white/40">
                {user.counts.tasks}t · {user.counts.projects}p · {user.counts.notes}n
              </p>
              <p className="font-mono text-xs text-white/25">{formatDate(user.created_at)}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-white/20 transition-colors group-hover:text-white/50" />
          </Link>
        ))}
      </div>

      {users.length === 0 && !isLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-12 text-center font-mono text-sm text-white/30">
          No users found.
        </div>
      )}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded-md border border-white/10 bg-white/5 py-2.5 font-mono text-sm text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
