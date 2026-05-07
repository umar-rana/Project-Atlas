"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { ArrowLeft, Search } from "lucide-react";
import { toast } from "@/lib/toast";

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-xl border border-white/20 bg-[#111] p-6">
        <h3 className="mb-2 font-mono text-sm font-semibold text-white">{title}</h3>
        <p className="mb-4 font-mono text-xs text-white/50">{description}</p>
        {children}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm text-white/60 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 font-mono text-sm ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserPickerDialog({
  onSelect,
  onCancel,
}: {
  onSelect: (userId: string, email: string) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data } = trpc.admin.users.list.useInfiniteQuery(
    { search: debouncedSearch || undefined, filter: "active", limit: 20 },
    { getNextPageParam: (l) => l.nextCursor, enabled: true },
  );
  const users = data?.pages.flatMap((p) => p.users) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-xl border border-white/20 bg-[#111] p-6">
        <h3 className="mb-3 font-mono text-sm font-semibold text-white">Select target user</h3>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        <div className="mb-4 flex max-h-64 flex-col gap-1 overflow-auto">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect(u.id, u.email)}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
            >
              <div>
                <p className="font-mono text-sm text-white">{u.name ?? u.email.split("@")[0]}</p>
                <p className="font-mono text-2xs text-white/40">{u.email}</p>
              </div>
            </button>
          ))}
          {users.length === 0 && (
            <p className="py-6 text-center font-mono text-sm text-white/30">No users found</p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm text-white/60 hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminOrphanDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [showUserPicker, setShowUserPicker] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<{ id: string; email: string } | null>(
    null,
  );
  const [showReattachConfirm, setShowReattachConfirm] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [actionResult, setActionResult] = React.useState<string | null>(null);

  const { data, isLoading, isError, error } = trpc.admin.orphans.investigate.useQuery(
    { id },
    { staleTime: 30_000 },
  );

  const reattach = trpc.admin.orphans.reattach.useMutation({
    onSuccess: (res) => {
      const total = Object.values(res.counts).reduce((a, b) => a + b, 0);
      setActionResult(`Reattached ${total} items successfully.`);
      setShowReattachConfirm(false);
      setSelectedUser(null);
      utils.admin.orphans.investigate.invalidate({ id });
      toast.success("Orphan data reattached");
    },
    onError: (err) => {
      setShowReattachConfirm(false);
      toast.error(err.message);
    },
  });

  const softDelete = trpc.admin.orphans.softDelete.useMutation({
    onSuccess: () => {
      setActionResult("Orphan soft-deleted.");
      setShowDeleteConfirm(false);
      toast.success("Orphan soft-deleted");
      utils.admin.orphans.investigate.invalidate({ id });
    },
    onError: (err) => {
      setShowDeleteConfirm(false);
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-xl border border-white/10 bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 font-mono text-sm text-red-400">
        {error?.message ?? "Failed to load orphan"}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      {showUserPicker && (
        <UserPickerDialog
          onSelect={(userId, email) => {
            setSelectedUser({ id: userId, email });
            setShowUserPicker(false);
            setShowReattachConfirm(true);
          }}
          onCancel={() => setShowUserPicker(false)}
        />
      )}

      {showReattachConfirm && selectedUser && (
        <ConfirmDialog
          title="Confirm Reattach"
          description={`Reattach all data from ${data.email} to ${selectedUser.email}? This will soft-delete the orphan account.`}
          confirmLabel={reattach.isPending ? "Reattaching…" : "Reattach"}
          confirmClass="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
          onConfirm={() => reattach.mutate({ orphan_id: id, target_user_id: selectedUser.id })}
          onCancel={() => {
            setShowReattachConfirm(false);
            setSelectedUser(null);
          }}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Confirm Soft-Delete"
          description={`Soft-delete orphan ${data.email}? Their content (${data.counts.tasks}t · ${data.counts.projects}p · ${data.counts.notes}n) will remain in the database but the user account will be marked deleted.`}
          confirmLabel={softDelete.isPending ? "Deleting…" : "Soft-delete"}
          confirmClass="bg-red-700 text-white hover:bg-red-600"
          onConfirm={() => softDelete.mutate({ orphan_id: id })}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 font-mono text-sm text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <h1 className="font-mono text-lg font-semibold text-white">Orphan Investigation</h1>
        {data.deleted_at && (
          <span className="rounded border border-red-800 bg-red-950 px-1.5 py-0.5 font-mono text-2xs text-red-400">
            soft-deleted
          </span>
        )}
      </div>

      {actionResult && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/50 px-4 py-3 font-mono text-sm text-emerald-400">
          {actionResult}
        </div>
      )}

      <section className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
          Identity
        </h2>
        <dl>
          <div className="flex gap-3 py-1.5">
            <dt className="w-28 font-mono text-xs text-white/30">ID</dt>
            <dd className="break-all font-mono text-xs text-white/60">{data.id}</dd>
          </div>
          <div className="flex gap-3 py-1.5">
            <dt className="w-28 font-mono text-xs text-white/30">Email</dt>
            <dd className="font-mono text-xs text-white">{data.email}</dd>
          </div>
          <div className="flex gap-3 py-1.5">
            <dt className="w-28 font-mono text-xs text-white/30">Name</dt>
            <dd className="font-mono text-xs text-white">{data.name ?? "—"}</dd>
          </div>
          <div className="flex gap-3 py-1.5">
            <dt className="w-28 font-mono text-xs text-white/30">Clerk ID</dt>
            <dd className="break-all font-mono text-xs text-white/50">{data.clerk_id}</dd>
          </div>
          <div className="flex gap-3 py-1.5">
            <dt className="w-28 font-mono text-xs text-white/30">Created</dt>
            <dd className="font-mono text-xs text-white">{formatDate(data.created_at)}</dd>
          </div>
          <div className="flex gap-3 py-1.5">
            <dt className="w-28 font-mono text-xs text-white/30">Deleted</dt>
            <dd className="font-mono text-xs text-white">{formatDate(data.deleted_at)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
          Content Summary
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(data.counts).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <p className="font-mono text-2xl font-bold text-white">{v}</p>
              <p className="mt-0.5 font-mono text-2xs capitalize text-white/30">{k}</p>
            </div>
          ))}
        </div>

        {data.sampleTasks.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-white/30">
              Sample tasks
            </p>
            <div className="flex flex-col gap-1">
              {data.sampleTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded border border-white/5 bg-white/5 px-3 py-2"
                >
                  <p className="min-w-0 flex-1 truncate font-mono text-xs text-white/70">
                    {t.title}
                  </p>
                  <p className="shrink-0 font-mono text-2xs text-white/25">
                    {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.sampleProjects.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-white/30">
              Sample projects
            </p>
            <div className="flex flex-col gap-1">
              {data.sampleProjects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded border border-white/5 bg-white/5 px-3 py-2"
                >
                  <p className="min-w-0 flex-1 truncate font-mono text-xs text-white/70">
                    {p.title}
                  </p>
                  <p className="shrink-0 font-mono text-2xs text-white/25">
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {data.recentAuthEvents.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
            Auth History
          </h2>
          <div className="flex flex-col gap-1.5">
            {data.recentAuthEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded border border-white/10 bg-white/5 px-3 py-2"
              >
                <p className="min-w-0 flex-1 font-mono text-xs text-white/60">{e.action}</p>
                <p className="shrink-0 font-mono text-2xs text-white/25">
                  {formatDate(e.created_at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
          Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowUserPicker(true)}
            disabled={reattach.isPending || softDelete.isPending || Boolean(actionResult)}
            className="rounded-md bg-blue-600 px-4 py-2.5 font-mono text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            Reattach to user…
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={reattach.isPending || softDelete.isPending || Boolean(actionResult)}
            className="rounded-md bg-red-700 px-4 py-2.5 font-mono text-sm text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            Soft-delete orphan
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm text-white/60 hover:bg-white/10"
          >
            Leave alone
          </button>
        </div>
      </section>
    </div>
  );
}
