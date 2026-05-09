"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

export function TasksSection() {
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

  const defaultReviewInterval =
    (tasksPrefs.default_review_interval_days as number | null | undefined) ?? null;
  const defaultForecastDays = (tasksPrefs.default_forecast_days as number | undefined) ?? 7;
  const defaultSequential = (tasksPrefs.default_sequential as boolean | undefined) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Tasks" description="Default settings for your Tasks module." />

      {saved && (
        <div className="rounded-lg bg-accent-success-muted px-4 py-2 font-ui text-sm text-accent-success">
          {saved}
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
          Default Review Interval
        </h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          How many days between project reviews when creating a new project.
        </p>
        <div className="flex items-center gap-3">
          <select
            defaultValue={defaultReviewInterval?.toString() ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              updateMutation.mutate({
                tasks_default_review_interval_days: v ? parseInt(v, 10) : null,
              });
            }}
            className="rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            <option value="">Never</option>
            <option value="3">Every 3 days</option>
            <option value="7">Weekly</option>
            <option value="14">Every 2 weeks</option>
            <option value="30">Monthly</option>
            <option value="90">Quarterly</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
          Forecast Default Range
        </h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          How many days to show in the Forecast view by default.
        </p>
        <div className="flex gap-3">
          {([7, 14] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                updateMutation.mutate({ tasks_default_forecast_days: n.toString() as "7" | "14" })
              }
              className={cn(
                "flex-1 rounded-xl border px-4 py-3 font-ui text-sm font-medium transition-colors",
                defaultForecastDays === n
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover",
              )}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
              Sequential Projects by Default
            </h3>
            <p className="font-ui text-xs text-text-secondary">
              When enabled, new projects will be sequential by default — only the first incomplete
              task is available at a time.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={defaultSequential}
            onClick={() => updateMutation.mutate({ tasks_default_sequential: !defaultSequential })}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              defaultSequential ? "bg-accent-primary" : "bg-border-subtle",
            )}
          >
            <span
              className={cn(
                "inline-block size-4 rounded-full bg-white shadow transition-transform",
                defaultSequential ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
