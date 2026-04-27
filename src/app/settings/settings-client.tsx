"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { DriveWizard } from "./drive-wizard";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];

export function SettingsClient({ user: initialUser, autoOpenWizard = false }: { user: User; autoOpenWizard?: boolean }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(autoOpenWizard);
  const utils = trpc.useUtils();

  const { data: user } = trpc.user.me.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const currentUser = user ?? initialUser;

  const updateMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setSaved("Saved");
      setTimeout(() => setSaved(null), 2000);
    },
  });

  const { data: driveStatus } = trpc.drive.linkStatus.useQuery();
  const unlinkDrive = trpc.drive.unlink.useMutation({
    onSuccess: () => utils.drive.linkStatus.invalidate(),
  });

  function handleBlur(field: string, value: string) {
    updateMutation.mutate({ [field]: value } as Parameters<typeof updateMutation.mutate>[0]);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-text-primary">
        Settings
      </h1>

      {saved && (
        <div className="mb-4 rounded-lg bg-accent-success-muted px-4 py-2 text-sm text-text-primary">
          {saved}
        </div>
      )}

      {/* Profile */}
      <section className="mb-8 rounded-xl border border-border-default bg-surface-raised p-6 shadow-1">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Profile</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Name
            </label>
            <input
              className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              defaultValue={currentUser.name ?? ""}
              onBlur={(e) => handleBlur("name", e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Email
            </label>
            <input
              className="w-full cursor-not-allowed rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-sm text-text-tertiary"
              value={currentUser.email}
              readOnly
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Timezone
              </label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                defaultValue={currentUser.timezone}
                onBlur={(e) => handleBlur("timezone", e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Date format
              </label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                defaultValue={currentUser.date_format}
                onBlur={(e) => handleBlur("date_format", e.target.value)}
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Time format
              </label>
              <div className="flex gap-2">
                {["12h", "24h"].map((f) => (
                  <button
                    key={f}
                    onClick={() =>
                      updateMutation.mutate({ time_format: f as "12h" | "24h" })
                    }
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      currentUser.time_format === f
                        ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                        : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Week starts
              </label>
              <div className="flex gap-2">
                {["sunday", "monday"].map((d) => (
                  <button
                    key={d}
                    onClick={() =>
                      updateMutation.mutate({
                        week_start: d as "sunday" | "monday",
                      })
                    }
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      currentUser.week_start === d
                        ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                        : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Theme */}
      <section className="mb-8 rounded-xl border border-border-default bg-surface-raised p-6 shadow-1">
        <h2 className="mb-4 text-base font-semibold text-text-primary">Appearance</h2>
        <div className="flex gap-3">
          {["dark", "light", "system"].map((t) => (
            <button
              key={t}
              onClick={() =>
                updateMutation.mutate({ theme: t as "dark" | "light" | "system" })
              }
              className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium capitalize transition-colors ${
                currentUser.theme === t
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Drive Integration */}
      <section className="rounded-xl border border-border-default bg-surface-raised p-6 shadow-1">
        <h2 className="mb-1 text-base font-semibold text-text-primary">
          Google Drive
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Link a Drive folder to store your Atlas files.
        </p>

        {showWizard ? (
          <DriveWizard onClose={() => setShowWizard(false)} />
        ) : driveStatus?.linked ? (
          <div className="flex items-center justify-between rounded-lg border border-border-default bg-surface-overlay px-4 py-3">
            <div>
              <p className="text-sm font-medium text-accent-success">
                Drive linked
              </p>
              <p className="text-xs text-text-tertiary">
                {driveStatus.config?.root_folder_name}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowWizard(true)}
                className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                Change folder
              </button>
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Unlink Drive? Atlas will lose access to your Drive folder.",
                    )
                  ) {
                    unlinkDrive.mutate();
                  }
                }}
                className="rounded-md border border-accent-danger px-3 py-1.5 text-xs font-medium text-accent-danger hover:bg-accent-danger-muted"
              >
                Unlink
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowWizard(true)}
            className="rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            Link Google Drive
          </button>
        )}
      </section>
    </div>
  );
}
