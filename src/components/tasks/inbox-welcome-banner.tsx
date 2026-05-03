"use client";

import * as React from "react";
import { Sparkles, X, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useShellStore } from "@/lib/shell/store";

const DISMISSED_KEY_PREFIX = "atlas_inbox_welcome_dismissed_v1";
const NEW_ACCOUNT_DAYS = 7;

function dismissedKey(userId: string) {
  return `${DISMISSED_KEY_PREFIX}:${userId}`;
}

export function InboxWelcomeBanner(): React.ReactElement | null {
  const { data: user } = trpc.user.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const setCaptureModalOpen = useShellStore((s) => s.setCaptureModalOpen);
  const [dismissed, setDismissed] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(dismissedKey(user.id)) === "true") {
        setDismissed(true);
      }
    } catch {
    }
  }, [user]);

  function handleDismiss() {
    setDismissed(true);
    if (!user) return;
    try {
      localStorage.setItem(dismissedKey(user.id), "true");
    } catch {
    }
  }

  if (dismissed) return null;
  if (!user) return null;

  const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
  if (accountAgeDays > NEW_ACCOUNT_DAYS) return null;

  return (
    <div className="mx-2 my-2 rounded-md border border-accent-primary-muted bg-accent-primary-subtle">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-accent-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-semibold text-text-primary">
            Welcome to your inbox
          </p>
          <p className="mt-0.5 font-ui text-2xs text-text-secondary">
            Capture anything on your mind and it will land here for triage.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCaptureModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md bg-accent-primary px-2 py-1 font-ui text-2xs font-medium text-text-on-accent hover:bg-accent-primary-hover focus-visible:focus-ring"
            >
              <Plus size={11} aria-hidden />
              Capture your first task
            </button>
            <span className="font-ui text-2xs text-text-tertiary">
              or press{" "}
              <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">⌘⇧I</kbd>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss welcome message"
          className="shrink-0 rounded-sm p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary focus-visible:focus-ring"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
