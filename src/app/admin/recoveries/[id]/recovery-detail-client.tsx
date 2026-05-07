"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { ArrowLeft, Flag } from "lucide-react";
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <dt className="w-36 shrink-0 font-mono text-xs text-white/30">{label}</dt>
      <dd className="break-all font-mono text-xs text-white">{value ?? "—"}</dd>
    </div>
  );
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

export function AdminRecoveryDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error } = trpc.admin.recoveries.byId.useQuery(
    { id },
    { staleTime: 30_000 },
  );

  const flag = trpc.admin.recoveries.flag.useMutation({
    onSuccess: () => {
      toast.success("Recovery flagged as wrong");
      utils.admin.recoveries.byId.invalidate({ id });
    },
    onError: (err) => toast.error(err.message),
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
        {error?.message ?? "Failed to load recovery"}
      </div>
    );
  }

  if (!data) return null;

  const meta = data.meta as Record<string, unknown> | null;
  const recovered = meta?.recovered as Record<string, number> | undefined;

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
        <h1 className="font-mono text-lg font-semibold text-white">Recovery Detail</h1>
        {data.isFlagged && (
          <span className="flex items-center gap-1 rounded border border-amber-800 bg-amber-950 px-2 py-0.5 font-mono text-2xs text-amber-400">
            <Flag size={10} /> Flagged
          </span>
        )}
      </div>

      <Section title="Recovery Event">
        <dl>
          <Row label="Event ID" value={<span className="opacity-60">{data.id}</span>} />
          <Row label="User" value={data.user?.email ?? data.user_id} />
          <Row label="Entity ID" value={<span className="opacity-60">{data.entity_id}</span>} />
          <Row label="Occurred at" value={formatDate(data.created_at)} />
          {meta && typeof meta.orphan_id === "string" && (
            <Row label="Orphan ID" value={<span className="opacity-60">{meta.orphan_id}</span>} />
          )}
          {meta && typeof meta.orphan_email === "string" && (
            <Row label="Orphan email" value={meta.orphan_email} />
          )}
        </dl>
      </Section>

      {recovered && Object.keys(recovered).length > 0 && (
        <Section title="Recovered Content">
          <div className="sm:grid-cols-6 grid grid-cols-3 gap-2">
            {Object.entries(recovered).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
                <p className="font-mono text-xl font-bold text-white">{v}</p>
                <p className="font-mono text-2xs capitalize text-white/30">{k}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {meta && (
        <Section title="Raw Metadata">
          <pre className="overflow-auto rounded bg-black/30 p-3 font-mono text-2xs text-white/50">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </Section>
      )}

      {data.relatedAuditEntries.length > 0 && (
        <Section title="Related Audit Entries">
          <div className="flex flex-col gap-1.5">
            {data.relatedAuditEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-white">{e.action}</p>
                </div>
                <p className="shrink-0 font-mono text-2xs text-white/25">
                  {formatDate(e.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!data.isFlagged && (
        <button
          type="button"
          onClick={() => flag.mutate({ recovery_id: id })}
          disabled={flag.isPending}
          className="flex items-center gap-2 self-start rounded-md border border-amber-800 bg-amber-950/50 px-4 py-2 font-mono text-sm text-amber-400 transition-colors hover:bg-amber-950 disabled:opacity-50"
        >
          <Flag size={14} />
          {flag.isPending ? "Flagging…" : "Flag as wrong recovery"}
        </button>
      )}
    </div>
  );
}
