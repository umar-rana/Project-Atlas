"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { DriveWizard } from "./drive-wizard";
import { TwoPaneLayout } from "@/components/layout/two-pane-layout";
import {
  User as UserIcon,
  Palette,
  Inbox,
  Link2,
  Cpu,
  HardDrive,
  Database,
  LogOut,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Section =
  | "profile"
  | "appearance"
  | "capture"
  | "tasks"
  | "integrations"
  | "ai"
  | "backups"
  | "data"
  | "account";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "capture", label: "Capture", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "backups", label: "Backups", icon: HardDrive },
  { id: "data", label: "Data", icon: Database },
  { id: "account", label: "Account", icon: LogOut },
];

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

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-ui text-xl font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 font-ui text-sm text-text-secondary">{description}</p>}
    </div>
  );
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={title} description={description} />
      <div className="rounded-xl border border-border-dashed border-dashed bg-surface-sunken px-6 py-10 text-center">
        <p className="font-ui text-sm text-text-tertiary">Coming in a future wave</p>
      </div>
    </div>
  );
}

function ProfileSection({ initialUser }: { initialUser: User }) {
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
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Email</label>
          <input
            className="w-full cursor-not-allowed rounded-md border border-border-subtle bg-surface-base px-3 py-2 font-ui text-sm text-text-tertiary"
            value={user.email}
            readOnly
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Timezone</label>
            <select
              className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              defaultValue={user.timezone}
              onBlur={(e) => handleBlur("timezone", e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Date format</label>
            <select
              className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              defaultValue={user.date_format}
              onBlur={(e) => handleBlur("date_format", e.target.value)}
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Time format</label>
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
            <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">Week starts</label>
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
            <p className="font-ui text-xs text-text-secondary">Sessions expire 7 days after signing in.</p>
          </div>
          {otherSessions.length > 0 && (
            <button
              onClick={() => { if (confirm("Sign out of all other sessions?")) revokeAllMutation.mutate(); }}
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
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-border-default bg-surface-overlay px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-ui text-sm font-medium text-text-primary">{parseUserAgent(s.user_agent)}</span>
                    {s.isCurrent && (
                      <span className="shrink-0 rounded-full bg-accent-success-muted px-2 py-0.5 font-ui text-xs font-medium text-accent-success">current</span>
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
                    onClick={() => { setRevokingId(s.id); revokeMutation.mutate({ sessionId: s.id }); }}
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

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const utils = trpc.useUtils();
  const updateMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  function handleSetTheme(t: "dark" | "light" | "system") {
    setTheme(t);
    updateMutation.mutate({ theme: t });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Appearance" description="Control how Atlas looks." />
      <div>
        <label className="mb-3 block font-ui text-xs font-medium text-text-secondary">Theme</label>
        <div className="flex gap-3">
          {(["dark", "light", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleSetTheme(t)}
              className={`flex-1 rounded-xl border px-4 py-4 font-ui text-sm font-medium capitalize transition-colors ${
                theme === t
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t === "dark" ? "🌙 Dark" : t === "light" ? "☀️ Light" : "🖥 System"}
            </button>
          ))}
        </div>
        <p className="mt-2 font-ui text-xs text-text-tertiary">
          System follows your OS preference automatically.
        </p>
      </div>
    </div>
  );
}

function IntegrationsSection({
  autoOpenWizard,
  driveLinked,
  driveError,
}: {
  autoOpenWizard?: boolean;
  driveLinked?: boolean;
  driveError?: string;
}) {
  const utils = trpc.useUtils();
  const [showWizard, setShowWizard] = useState(autoOpenWizard ?? false);
  const [driveBanner, setDriveBanner] = useState<{ type: "success" | "error"; message: string } | null>(() => {
    if (driveLinked) return { type: "success", message: "Google Drive connected successfully." };
    if (driveError) {
      const msg = DRIVE_ERROR_MESSAGES[driveError] ?? "An unexpected error occurred.";
      return { type: "error", message: msg };
    }
    return null;
  });

  useEffect(() => {
    if (!driveBanner || driveBanner.type !== "success") return;
    const t = setTimeout(() => setDriveBanner(null), 6000);
    return () => clearTimeout(t);
  }, [driveBanner]);

  const { data: driveStatus } = trpc.drive.linkStatus.useQuery();
  const unlinkDrive = trpc.drive.unlink.useMutation({
    onSuccess: () => utils.drive.linkStatus.invalidate(),
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Integrations" description="Connect external services to Atlas." />

      {driveBanner && (
        <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 font-ui text-sm ${
          driveBanner.type === "success"
            ? "border-accent-success bg-accent-success-muted text-accent-success"
            : "border-accent-danger bg-accent-danger-muted text-accent-danger"
        }`}>
          <span>{driveBanner.message}</span>
          <button onClick={() => setDriveBanner(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="mb-4">
          <h3 className="font-ui text-sm font-semibold text-text-primary">Google Drive</h3>
          <p className="font-ui text-xs text-text-secondary">Link a Drive folder to store your Atlas files.</p>
        </div>

        {showWizard ? (
          <DriveWizard onClose={() => setShowWizard(false)} />
        ) : driveStatus?.linked ? (
          <div className="rounded-lg border border-border-default bg-surface-overlay">
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent-success" />
                  <p className="font-ui text-sm font-medium text-text-primary">Drive connected</p>
                </div>
                <p className="pl-4 font-ui text-xs text-text-secondary">
                  Folder: <span className="font-medium text-text-primary">{driveStatus.config?.root_folder_name}</span>
                </p>
                <p className="pl-4 font-ui text-xs text-text-secondary capitalize">
                  Type: <span className="font-medium text-text-primary">{driveStatus.config?.drive_type ?? "personal"}</span>
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  onClick={() => setShowWizard(true)}
                  className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
                >
                  Change folder
                </button>
                <button
                  onClick={() => { if (confirm("Unlink Drive? Atlas will lose access to your Drive folder.")) unlinkDrive.mutate(); }}
                  className="rounded-md border border-accent-danger px-3 py-1.5 font-ui text-xs font-medium text-accent-danger hover:bg-accent-danger-muted"
                >
                  Unlink
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowWizard(true)}
            className="rounded-lg bg-accent-primary px-4 py-2.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            Link Google Drive
          </button>
        )}
      </div>

      {[
        { label: "Google Calendar", desc: "Sync events and time-blocks with your Google Calendar." },
        { label: "Google Contacts", desc: "Import contacts to Atlas People." },
        { label: "Resend", desc: "Send transactional emails from Atlas workflows." },
      ].map((int) => (
        <div key={int.label} className="rounded-xl border border-border-subtle bg-surface-base p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-ui text-sm font-semibold text-text-primary">{int.label}</h3>
              <p className="font-ui text-xs text-text-tertiary">{int.desc}</p>
            </div>
            <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 font-ui text-2xs font-medium text-text-tertiary">
              Coming soon
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AISection() {
  const { data: stats, isLoading } = trpc.ai.usageStats.useQuery();
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("atlas:ai_enabled");
    return stored !== "false";
  });

  function handleToggle() {
    const next = !aiEnabled;
    setAiEnabled(next);
    localStorage.setItem("atlas:ai_enabled", String(next));
  }

  const monthlyUsd = stats?.monthly.costUsd ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="AI" description="Configure how Atlas uses AI features." />

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-ui text-sm font-semibold text-text-primary">AI Features</h3>
            <p className="font-ui text-xs text-text-tertiary">
              Enable or disable all AI-powered features in Atlas.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            onClick={handleToggle}
            className={cn(
              "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:focus-ring",
              aiEnabled ? "bg-accent-primary" : "bg-surface-overlay",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
                aiEnabled ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </div>
        <p className="mt-2 font-ui text-2xs text-text-tertiary">
          Preference saved locally — full profile sync coming in a future wave.
        </p>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Usage & Cost</h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          Estimated cost this month based on AI calls logged.
        </p>
        <div className="mb-4 flex items-baseline gap-1">
          {isLoading ? (
            <span className="font-ui text-xl font-semibold text-text-primary">—</span>
          ) : (
            <>
              <span className="font-ui text-xl font-semibold text-text-primary">
                ${monthlyUsd.toFixed(4)}
              </span>
              <span className="font-ui text-xs text-text-tertiary">this month</span>
            </>
          )}
        </div>
        {stats && (
          <p className="mb-3 font-ui text-2xs text-text-tertiary">
            {stats.monthly.calls} call{stats.monthly.calls !== 1 ? "s" : ""} ·{" "}
            {((stats.monthly.inputTokens + stats.monthly.outputTokens) / 1000).toFixed(1)}k tokens
          </p>
        )}
        <a
          href="/usage"
          className="inline-flex rounded-md border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
        >
          View full usage →
        </a>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-base p-5">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Model</h3>
        <p className="font-ui text-xs text-text-secondary">
          Atlas uses Claude (Anthropic) for all AI features. Model selection and per-feature toggles coming in a future wave.
        </p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-base p-5">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">System Health</h3>
        <p className="mb-2 font-ui text-xs text-text-secondary">
          Check AI connectivity and latency.
        </p>
        <a
          href="/admin/health"
          className="inline-flex rounded-md border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
        >
          View Health Dashboard →
        </a>
      </div>
    </div>
  );
}

function AccountSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Account" description="Manage your Atlas account." />
      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Sign Out</h3>
        <p className="mb-4 font-ui text-xs text-text-secondary">
          You will be signed out of Atlas on this device.
        </p>
        <a
          href="/api/auth/logout"
          className="inline-flex rounded-md border border-accent-danger px-4 py-2 font-ui text-sm font-medium text-accent-danger hover:bg-accent-danger-muted"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}

function TasksSection() {
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

  const tasksPrefs = (typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
    ? userData.tasks_prefs as Record<string, unknown>
    : {});

  const defaultReviewInterval = (tasksPrefs.default_review_interval_days as number | null | undefined) ?? null;
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
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Default Review Interval</h3>
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
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Forecast Default Range</h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          How many days to show in the Forecast view by default.
        </p>
        <div className="flex gap-3">
          {([7, 14] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => updateMutation.mutate({ tasks_default_forecast_days: n.toString() as "7" | "14" })}
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
            <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Sequential Projects by Default</h3>
            <p className="font-ui text-xs text-text-secondary">
              When enabled, new projects will be sequential by default — only the first incomplete task is available at a time.
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

interface SettingsClientProps {
  user: User;
  initialSection?: string;
  autoOpenWizard?: boolean;
  driveLinked?: boolean;
  driveError?: string;
}

const VALID_SECTIONS = new Set<Section>(["profile", "appearance", "capture", "tasks", "integrations", "ai", "backups", "data", "account"]);

function resolveSection(raw: string | undefined, fallback: Section): Section {
  if (raw && VALID_SECTIONS.has(raw as Section)) return raw as Section;
  return fallback;
}

export function SettingsClient({
  user,
  initialSection,
  autoOpenWizard,
  driveLinked,
  driveError,
}: SettingsClientProps) {
  const router = useRouter();
  const defaultSection = resolveSection(initialSection, autoOpenWizard ? "integrations" : "profile");
  const [section, setSection] = useState<Section>(defaultSection);

  const navigate = useCallback((id: Section) => {
    setSection(id);
    router.replace(`/settings?section=${id}`, { scroll: false });
  }, [router]);

  const nav = (
    <nav aria-label="Settings sections" className="flex flex-col gap-0.5 p-2">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => navigate(id)}
          aria-current={section === id ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-3 py-2 font-ui text-sm transition-colors",
            section === id
              ? "bg-accent-primary-subtle text-accent-primary font-medium"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Icon size={15} aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );

  const content = (
    <div className="h-full overflow-y-auto p-6">
      {section === "profile" && <ProfileSection initialUser={user} />}
      {section === "appearance" && <AppearanceSection />}
      {section === "capture" && (
        <PlaceholderSection
          title="Capture"
          description="Configure how Atlas captures and processes incoming content."
        />
      )}
      {section === "tasks" && <TasksSection />}
      {section === "integrations" && (
        <IntegrationsSection
          autoOpenWizard={autoOpenWizard}
          driveLinked={driveLinked}
          driveError={driveError}
        />
      )}
      {section === "ai" && <AISection />}
      {section === "backups" && (
        <PlaceholderSection
          title="Backups"
          description="Manage automatic backups of your Atlas data to Google Drive."
        />
      )}
      {section === "data" && (
        <div className="flex flex-col gap-6">
          <SectionHeader title="Data" description="Manage your Atlas data." />
          <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
            <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Trash</h3>
            <p className="mb-3 font-ui text-xs text-text-secondary">
              Deleted items are kept for 30 days before permanent removal.
            </p>
            <a
              href="/trash"
              className="inline-flex rounded-md border border-border-default px-4 py-2 font-ui text-sm font-medium text-text-secondary hover:bg-surface-hover"
            >
              View Trash
            </a>
          </div>
          <div className="rounded-xl border border-border-dashed border-dashed bg-surface-sunken px-6 py-8 text-center">
            <p className="font-ui text-sm text-text-tertiary">Export and import tools coming in a future wave.</p>
          </div>
        </div>
      )}
      {section === "account" && <AccountSection />}
    </div>
  );

  return (
    <TwoPaneLayout list={nav} detail={content} listWidth={220} collapseListBelowTablet={false} />
  );
}
