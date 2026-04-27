"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { DriveWizard } from "./drive-wizard";

const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  provider: "Google declined to authorize access. Please try again.",
  state_missing: "Your authorization session expired or the cookie was missing. Please try again.",
  state_mismatch: "Security check failed — the OAuth state did not match. Please try again.",
  exchange: "Failed to exchange the authorization code with Google. Please try again.",
  config: "Drive was authorized but the configuration could not be saved. Please try again.",
  no_code: "No authorization code was received from Google. Please try again.",
};

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

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS device";
  if (/Android/.test(ua)) return "Android device";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown device";
}

export function SettingsClient({
  user: initialUser,
  autoOpenWizard = false,
  driveLinked = false,
  driveError,
}: {
  user: User;
  autoOpenWizard?: boolean;
  driveLinked?: boolean;
  driveError?: string;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(autoOpenWizard);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [driveBanner, setDriveBanner] = useState<{ type: "success" | "error"; message: string } | null>(() => {
    if (driveLinked) return { type: "success", message: "Google Drive connected successfully." };
    if (driveError) {
      const msg = DRIVE_ERROR_MESSAGES[driveError] ?? "An unexpected error occurred connecting to Drive. Please try again.";
      return { type: "error", message: msg };
    }
    return null;
  });
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!driveBanner) return;
    if (driveBanner.type !== "success") return;
    const t = setTimeout(() => setDriveBanner(null), 6000);
    return () => clearTimeout(t);
  }, [driveBanner]);

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

  const { data: sessions, isLoading: sessionsLoading } = trpc.session.list.useQuery();
  const revokeMutation = trpc.session.revoke.useMutation({
    onSuccess: () => utils.session.list.invalidate(),
    onSettled: () => setRevokingId(null),
  });
  const revokeAllMutation = trpc.session.revokeAll.useMutation({
    onSuccess: () => utils.session.list.invalidate(),
  });

  function handleBlur(field: string, value: string) {
    updateMutation.mutate({ [field]: value } as Parameters<typeof updateMutation.mutate>[0]);
  }

  function handleRevoke(sessionId: string) {
    setRevokingId(sessionId);
    revokeMutation.mutate({ sessionId });
  }

  const otherSessions = sessions?.filter((s) => !s.isCurrent) ?? [];

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

      {driveBanner && (
        <div
          className={`mb-6 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            driveBanner.type === "success"
              ? "border-accent-success bg-accent-success-muted text-accent-success"
              : "border-accent-danger bg-accent-danger-muted text-accent-danger"
          }`}
        >
          <span>{driveBanner.message}</span>
          <button
            onClick={() => setDriveBanner(null)}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
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

      {/* Active Sessions */}
      <section className="mb-8 rounded-xl border border-border-default bg-surface-raised p-6 shadow-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Active Sessions</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Sessions expire 7 days after signing in.
            </p>
          </div>
          {otherSessions.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Sign out of all other sessions?")) {
                  revokeAllMutation.mutate();
                }
              }}
              disabled={revokeAllMutation.isPending}
              className="rounded-md border border-accent-danger px-3 py-1.5 text-xs font-medium text-accent-danger hover:bg-accent-danger-muted disabled:opacity-50"
            >
              Revoke all others
            </button>
          )}
        </div>

        {sessionsLoading ? (
          <p className="text-sm text-text-tertiary">Loading sessions…</p>
        ) : !sessions || sessions.length === 0 ? (
          <p className="text-sm text-text-tertiary">No active sessions found.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border-default bg-surface-overlay px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {parseUserAgent(s.user_agent)}
                    </span>
                    {s.isCurrent && (
                      <span className="shrink-0 rounded-full bg-accent-success-muted px-2 py-0.5 text-xs font-medium text-accent-success">
                        current
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
                    {s.ip_address && <span>{s.ip_address}</span>}
                    {s.ip_address && <span>·</span>}
                    <span>Last seen {formatRelativeTime(s.last_seen)}</span>
                    <span>·</span>
                    <span>Signed in {formatRelativeTime(s.created_at)}</span>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => handleRevoke(s.id)}
                    disabled={revokingId === s.id}
                    className="ml-4 shrink-0 rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent-danger hover:text-accent-danger disabled:opacity-50"
                  >
                    {revokingId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
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
          <div className="rounded-lg border border-border-default bg-surface-overlay">
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent-success" />
                  <p className="text-sm font-medium text-text-primary">Drive connected</p>
                </div>
                <p className="pl-4 text-xs text-text-secondary">
                  Folder: <span className="font-medium text-text-primary">{driveStatus.config?.root_folder_name}</span>
                </p>
                <p className="pl-4 text-xs text-text-secondary capitalize">
                  Type: <span className="font-medium text-text-primary">{driveStatus.config?.drive_type ?? "personal"}</span>
                </p>
                {driveStatus.config?.verified_at ? (
                  <p className="pl-4 text-xs text-text-tertiary">
                    Last verified:{" "}
                    {new Date(driveStatus.config.verified_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                ) : !driveStatus.config?.verified ? (
                  <p className="pl-4 text-xs text-accent-warning">
                    Folder not yet verified — it will be confirmed on the next sync.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-shrink-0 gap-2">
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
