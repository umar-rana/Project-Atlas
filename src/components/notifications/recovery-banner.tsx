"use client";

import * as React from "react";
import { X, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

const ENTITY_LABELS: Record<string, string> = {
  tasks: "tasks",
  projects: "projects",
  notes: "notes",
  captures: "captures",
  attachments: "attachments",
  tags: "tags",
  contexts: "contexts",
  links: "links",
  tables: "tables",
  emailCaptures: "email captures",
  workLogs: "work logs",
};

const recoverySummarySchema = z.object({
  counts: z.record(z.number()).optional(),
  recoveredAt: z.string().optional(),
  orphanIds: z.array(z.string()).optional(),
});

function parseCounts(raw: unknown): Record<string, number> | null {
  const parsed = recoverySummarySchema.safeParse(raw);
  if (parsed.success && parsed.data.counts) return parsed.data.counts;
  // May be a flat counts object (legacy shape)
  const flat = z.record(z.number()).safeParse(raw);
  return flat.success ? flat.data : null;
}

export function RecoveryBanner() {
  const router = useRouter();
  const status = trpc.user.recoveryStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dismiss = trpc.user.dismissRecoveryNotification.useMutation({
    onSuccess: () => status.refetch(),
  });

  if (!status.data?.pending) return null;

  const counts = parseCounts(status.data.summary);
  if (!counts) return null;

  const rows = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, count]) => ({ label: ENTITY_LABELS[key] ?? key, count }));

  if (rows.length === 0) return null;

  const summary = rows.map(({ label, count }) => `${count} ${label}`).join(", ");

  return (
    <div className="bg-surface-elevated flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
      <ShieldCheck size={16} className="shrink-0 text-accent-primary" />
      <p className="flex-1 font-ui text-xs text-text-primary">
        Your account data has been restored: <strong>{summary}</strong>.
      </p>
      <button
        type="button"
        className="font-ui text-xs font-medium text-accent-primary hover:underline"
        onClick={() => router.push("/recovery-summary")}
      >
        View summary
      </button>
      <button
        type="button"
        className="font-ui text-xs font-medium text-text-secondary hover:text-text-primary"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate()}
      >
        Got it
      </button>
      <button
        type="button"
        className="ml-1 rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate()}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
