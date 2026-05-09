"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

export function GtdSection() {
  const utils = trpc.useUtils();
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const userData = rawUserData as User | undefined;
  const [saved, setSaved] = useState<string | null>(null);

  const updateMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setSaved("Saved");
      setTimeout(() => setSaved(null), 2000);
    },
  });

  const tasksPrefs =
    typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
      ? (userData.tasks_prefs as Record<string, unknown>)
      : {};

  const somedayCadence = (tasksPrefs.gtd_someday_review_cadence as string | undefined) ?? "weekly";
  const waitingForWindow =
    (tasksPrefs.gtd_waiting_for_default_window as string | undefined) ?? "1w";
  const twoMinuteReminder = (tasksPrefs.gtd_two_minute_reminder as boolean | undefined) ?? true;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="GTD Settings"
        description="Configure Getting Things Done methodology settings for your inbox and perspectives."
      />

      {saved && (
        <div className="rounded-lg bg-accent-success-muted px-4 py-2 font-ui text-sm text-accent-success">
          {saved}
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
          Someday / Maybe Review Cadence
        </h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          How often you want to review your Someday / Maybe list. This sets the default review
          interval when deferring a capture.
        </p>
        <div className="flex gap-3">
          {(
            [
              { value: "weekly", label: "Weekly" },
              { value: "biweekly", label: "Bi-weekly" },
              { value: "monthly", label: "Monthly" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateMutation.mutate({ gtd_someday_review_cadence: opt.value })}
              className={cn(
                "flex-1 rounded-xl border px-4 py-3 font-ui text-sm font-medium transition-colors",
                somedayCadence === opt.value
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
          Waiting For Default Follow-up Window
        </h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          When recording a follow-up for a Waiting For item, this is the default window used.
        </p>
        <div className="flex gap-3">
          {(
            [
              { value: "1w", label: "1 week" },
              { value: "2w", label: "2 weeks" },
              { value: "1m", label: "1 month" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateMutation.mutate({ gtd_waiting_for_default_window: opt.value })}
              className={cn(
                "flex-1 rounded-xl border px-4 py-3 font-ui text-sm font-medium transition-colors",
                waitingForWindow === opt.value
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
              Two-Minute Rule Reminder
            </h3>
            <p className="font-ui text-xs text-text-secondary">
              Show a reminder when processing captures that could be done in under two minutes.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={twoMinuteReminder}
            onClick={() => updateMutation.mutate({ gtd_two_minute_reminder: !twoMinuteReminder })}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              twoMinuteReminder ? "bg-accent-primary" : "bg-border-subtle",
            )}
          >
            <span
              className={cn(
                "inline-block size-4 rounded-full bg-white shadow transition-transform",
                twoMinuteReminder ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
