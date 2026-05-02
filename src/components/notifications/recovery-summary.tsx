"use client";

import * as React from "react";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

const ENTITY_LABELS: Record<string, string> = {
  tasks: "Tasks",
  projects: "Projects",
  notes: "Notes",
  captures: "Captures",
  attachments: "Attachments",
  tags: "Tags",
  contexts: "Contexts",
  links: "Links",
  tables: "Tables",
  emailCaptures: "Email captures",
  workLogs: "Work logs",
};

const recoverySummarySchema = z.object({
  counts: z.record(z.number()).optional(),
  recoveredAt: z.string().optional(),
  orphanIds: z.array(z.string()).optional(),
});

type ParsedSummary = {
  counts: Record<string, number> | null;
  recoveredAt: string | undefined;
  orphanIds: string[];
};

function parseRecoverySummary(raw: unknown): ParsedSummary {
  const parsed = recoverySummarySchema.safeParse(raw);
  if (parsed.success) {
    return {
      counts: parsed.data.counts ?? null,
      recoveredAt: parsed.data.recoveredAt,
      orphanIds: parsed.data.orphanIds ?? [],
    };
  }
  // May be a flat counts object (legacy shape)
  const flat = z.record(z.number()).safeParse(raw);
  return {
    counts: flat.success ? flat.data : null,
    recoveredAt: undefined,
    orphanIds: [],
  };
}

export function RecoverySummary() {
  const router = useRouter();
  const status = trpc.user.recoveryStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dismiss = trpc.user.dismissRecoveryNotification.useMutation({
    onSuccess: () => {
      status.refetch();
      router.push("/tasks");
    },
  });

  const { counts, recoveredAt, orphanIds } = parseRecoverySummary(status.data?.summary);

  const rows: Array<{ label: string; count: number }> = counts
    ? Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([key, count]) => ({ label: ENTITY_LABELS[key] ?? key, count }))
    : [];

  const totalItems = rows.reduce((a, { count }) => a + count, 0);

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <button
        type="button"
        className="mb-6 flex items-center gap-1 font-ui text-xs text-text-tertiary hover:text-text-primary"
        onClick={() => router.back()}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={20} className="text-accent-primary" />
        <h1 className="font-ui text-lg font-semibold text-text-primary">Data Recovery Summary</h1>
      </div>

      {status.isLoading ? (
        <p className="font-ui text-sm text-text-tertiary">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="font-ui text-sm text-text-secondary">
          No data was recovered, or the notification was already dismissed.
        </p>
      ) : (
        <>
          {recoveredAt && (
            <p className="mb-2 font-ui text-xs text-text-tertiary">
              Recovered on {new Date(recoveredAt).toLocaleString()}
            </p>
          )}
          <p className="mb-4 font-ui text-sm text-text-secondary">
            The following data was recovered from a previous session and merged into your account:
          </p>
          <div className="rounded-md border border-border-subtle overflow-hidden mb-4">
            <table className="w-full font-ui text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-elevated">
                  <th className="px-4 py-2 text-left text-text-secondary font-medium">Type</th>
                  <th className="px-4 py-2 text-right text-text-secondary font-medium">Recovered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ label, count }) => (
                  <tr key={label} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2 text-text-primary">{label}</td>
                    <td className="px-4 py-2 text-right text-text-primary font-medium">{count}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border-subtle bg-surface-elevated">
                  <td className="px-4 py-2 text-text-secondary font-medium">Total</td>
                  <td className="px-4 py-2 text-right text-text-primary font-bold">{totalItems}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {orphanIds.length > 0 && (
            <div className="mb-4 rounded-md border border-border-subtle bg-surface-elevated px-4 py-3">
              <p className="mb-2 font-ui text-xs font-medium text-text-secondary">
                Source account{orphanIds.length === 1 ? "" : "s"} merged ({orphanIds.length}):
              </p>
              <ul className="space-y-1">
                {orphanIds.map((id) => (
                  <li key={id} className="font-mono text-xs text-text-tertiary break-all">
                    {id}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
            className="rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Got it
          </button>
        </>
      )}
    </div>
  );
}
