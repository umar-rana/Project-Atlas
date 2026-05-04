"use client";

import * as React from "react";
import { PlayCircle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useShellStore } from "@/lib/shell/store";

export function ProcessInboxButton(): React.ReactElement | null {
  const setProcessingModeOpen = useShellStore((s) => s.setProcessingModeOpen);

  const inboxQuery = trpc.capture.listInbox.useQuery(
    { limit: 200 },
    { staleTime: 15_000 },
  );

  const captureCount = (inboxQuery.data ?? []).length;

  if (captureCount === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setProcessingModeOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent shadow-sm hover:bg-accent-primary-hover transition-colors"
    >
      <PlayCircle size={14} aria-hidden />
      Process Inbox
      <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 font-ui text-2xs font-semibold tabular-nums">
        {captureCount}
      </span>
    </button>
  );
}
