"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { SectionHeader } from "./_shared";

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

const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

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

export function ProfileSection({ initialUser }: { initialUser: User }) {
  const utils = trpc.useUtils();
  const [saved, setSaved] = useState<string | null>(null);
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const user = (rawUserData as User | undefined) ?? initialUser;

  const { data: sessions, isLoading: sessionsLoading } = trpc.session.list.useQuery();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const revokeMutation = trpc.session.revoke.useMutation({
    onSuccess: () => utils.session.list.invalidate(),
    onSettled: () => setRevokingId(null),
  });
  const revokeAllMutation = trpc.session.revokeAll.useMutation({
    onSuccess: () => utils.session.list.invalidate(),
  });

  const updateMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setSaved("Saved");
      setTimeout(() => setSaved(null), 2000);
    },
  });

  function handleBlur(field: string, value: string) {
    updateMutation.mutate({ [field]: value } as Parameters<typeof updateMutation.mutate>[0]);
  }

  const otherSessions = sessions?.filter((s) => !s.isCurrent) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader title="Profile" description="Your personal information and preferences." />

      {saved && (
        <div className="rounded-lg bg-accent-success-muted px-4 py-2 font-ui text-sm text-accent-success">
          {saved}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Name</label>
          <input
            className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            defaultValue={user.name ?? ""}
            onBlur={(e) => handleBlur("name", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
            Email
          </label>
          <input
            className="w-full cursor-not-allowed rounded-md border border-border-subtle bg-surface-base px-3 py-2 font-ui text-sm text-text-tertiary"
            value={user.email}
            readOnly
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
              Timezone
            </label>
            <select
              className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              defaultValue={user.timezone}
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
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
              Date format
            </label>
            <select
              className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              defaultValue={user.date_format}
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
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
              Time format
            </label>
            <div className="flex gap-2">
              {["12h", "24h"].map((f) => (
                <button
                  key={f}
                  onClick={() => updateMutation.mutate({ time_format: f as "12h" | "24h" })}
                  className={`flex-1 rounded-md border px-3 py-2 font-ui text-sm font-medium transition-colors ${
                    user.time_format === f
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
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
              Week starts
            </label>
            <div className="flex gap-2">
              {["sunday", "monday"].map((d) => (
                <button
                  key={d}
                  onClick={() => updateMutation.mutate({ week_start: d as "sunday" | "monday" })}
                  className={`flex-1 rounded-md border px-3 py-2 font-ui text-sm font-medium capitalize transition-colors ${
                    user.week_start === d
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

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-ui text-sm font-semibold text-text-primary">Active Sessions</h3>
            <p className="font-ui text-xs text-text-secondary">
              Sessions expire 7 days after signing in.
            </p>
          </div>
          {otherSessions.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Sign out of all other sessions?")) revokeAllMutation.mutate();
              }}
              disabled={revokeAllMutation.isPending}
              className="rounded-md border border-accent-danger px-3 py-1.5 font-ui text-xs font-medium text-accent-danger hover:bg-accent-danger-muted disabled:opacity-50"
            >
              Revoke all others
            </button>
          )}
        </div>
        {sessionsLoading ? (
          <p className="font-ui text-sm text-text-tertiary">Loading sessions…</p>
        ) : !sessions || sessions.length === 0 ? (
          <p className="font-ui text-sm text-text-tertiary">No active sessions found.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border-default bg-surface-overlay px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-ui text-sm font-medium text-text-primary">
                      {parseUserAgent(s.user_agent)}
                    </span>
                    {s.isCurrent && (
                      <span className="shrink-0 rounded-full bg-accent-success-muted px-2 py-0.5 font-ui text-xs font-medium text-accent-success">
                        current
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-ui text-xs text-text-tertiary">
                    {s.ip_address && <span>{s.ip_address}</span>}
                    {s.ip_address && <span>·</span>}
                    <span>Last seen {formatRelativeTime(s.last_seen)}</span>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => {
                      setRevokingId(s.id);
                      revokeMutation.mutate({ sessionId: s.id });
                    }}
                    disabled={revokingId === s.id}
                    className="ml-4 shrink-0 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:border-accent-danger hover:text-accent-danger disabled:opacity-50"
                  >
                    {revokingId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
