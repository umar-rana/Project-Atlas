"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { ArrowLeft, AlertTriangle, CheckCircle } from "lucide-react";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-white/40">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <dt className="w-36 shrink-0 font-mono text-xs text-white/30">{label}</dt>
      <dd className="break-all font-mono text-xs text-white">{value ?? "—"}</dd>
    </div>
  );
}

export function AdminUserDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, isError, error } = trpc.admin.users.byId.useQuery(
    { id },
    { staleTime: 30_000 },
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
        {error?.message ?? "Failed to load user"}
      </div>
    );
  }

  if (!data) return null;

  const recovery = data.last_recovery_summary as {
    counts?: Record<string, number>;
    recoveredAt?: string;
    orphanIds?: string[];
  } | null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 font-mono text-sm text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <h1 className="font-mono text-lg font-semibold text-white">
          {data.name ?? data.email.split("@")[0]}
        </h1>
        {data.deleted_at && (
          <span className="rounded border border-red-800 bg-red-950 px-1.5 py-0.5 font-mono text-2xs text-red-400">
            deleted
          </span>
        )}
      </div>

      <Section title="Identity">
        <dl>
          <Row label="Internal ID" value={<span className="opacity-60">{data.id}</span>} />
          <Row label="Clerk ID" value={<span className="opacity-60">{data.clerk_id}</span>} />
          <Row label="Email" value={data.email} />
          <Row label="Name" value={data.name} />
          <Row label="Timezone" value={data.timezone} />
          <Row label="Locale" value={data.locale_preset} />
          <Row label="Language" value={data.language} />
          <Row label="Created" value={formatDate(data.created_at)} />
          <Row label="Updated" value={formatDate(data.updated_at)} />
          <Row label="Deleted" value={data.deleted_at ? formatDate(data.deleted_at) : "—"} />
        </dl>
      </Section>

      <Section title="Content Summary">
        <div className="sm:grid-cols-3 lg:grid-cols-5 grid grid-cols-2 gap-3">
          {Object.entries(data.counts).map(([key, count]) => (
            <div key={key} className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
              <p className="font-mono text-xl font-bold text-white">{count}</p>
              <p className="mt-0.5 font-mono text-2xs capitalize text-white/40">{key}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recent Auth Events (30d)">
        {data.recentAuthEvents.length === 0 ? (
          <p className="font-mono text-xs text-white/30">No auth events in the last 30 days.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.recentAuthEvents.map((ev) => (
              <div
                key={ev.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  ev.isWarning ? "border-red-800 bg-red-950/40" : "border-white/10 bg-white/5"
                }`}
              >
                {ev.isWarning ? (
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-400" />
                ) : (
                  <CheckCircle size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-white">{ev.action}</p>
                  {ev.meta && (
                    <p className="mt-0.5 truncate font-mono text-2xs text-white/30">
                      {JSON.stringify(ev.meta).slice(0, 120)}
                    </p>
                  )}
                </div>
                <p className="shrink-0 font-mono text-2xs text-white/25">
                  {formatDate(ev.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recovery History">
        {recovery ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded border border-amber-800 bg-amber-950 px-2 py-0.5 font-mono text-xs text-amber-400">
                Recovery pending
              </span>
              <span className="font-mono text-xs text-white/40">
                Recovered at: {recovery.recoveredAt ? formatDate(recovery.recoveredAt) : "—"}
              </span>
            </div>
            {recovery.counts && (
              <div className="sm:grid-cols-6 grid grid-cols-3 gap-2">
                {Object.entries(recovery.counts).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg border border-white/10 bg-white/5 p-2 text-center"
                  >
                    <p className="font-mono text-lg font-bold text-white">{v}</p>
                    <p className="font-mono text-2xs capitalize text-white/30">{k}</p>
                  </div>
                ))}
              </div>
            )}
            {recovery.orphanIds && recovery.orphanIds.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 font-mono text-2xs text-white/30">Source orphan IDs:</p>
                {recovery.orphanIds.map((oid) => (
                  <Link
                    key={oid}
                    href={`/admin/orphans/${oid}`}
                    className="block font-mono text-2xs text-blue-400 hover:underline"
                  >
                    {oid}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="font-mono text-xs text-white/30">No recovery history for this user.</p>
        )}
      </Section>
    </div>
  );
}
