"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

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
    <div className="mx-2 my-2 rounded-md border border-accent-brand/30 bg-accent-brand-muted">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-accent-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-semibold text-text-primary">
            Welcome to your inbox
          </p>
          <p className="mt-0.5 font-ui text-2xs text-text-secondary">
            Capture anything on your mind with{" "}
            <kbd className="rounded bg-surface-raised px-1 py-px font-mono text-2xs">⌘⇧I</kbd>{" "}
            and it will land here for triage. Need a quick refresher?{" "}
            <Link
              href="/welcome"
              className="text-accent-brand underline-offset-2 hover:underline"
            >
              View the getting started guide
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss welcome message"
          className="shrink-0 rounded-sm p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
