"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
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
  Copy,
  Check,
  ExternalLink,
  X,
  Info,
  Package,
  Sliders,
  Settings2,
  LayoutTemplate,
} from "lucide-react";
const TemplatesSettingsSection = dynamic(
  () =>
    import("@/components/task-templates/templates-settings-section").then(
      (m) => m.TemplatesSettingsSection,
    ),
  { ssr: false },
);
const JobsManagement = dynamic(
  () => import("@/components/settings/jobs-management").then((m) => m.JobsManagement),
  { ssr: false },
);
const MigrationSummaryModal = dynamic(
  () =>
    import("@/components/tasks/migration-summary-modal").then((m) => m.MigrationSummaryModal),
  { ssr: false },
);
import { ADMIN_EMAILS } from "@/lib/admin-gate";
import {
  LOCALE_PRESETS,
  DATE_FORMAT_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  ISO_4217_CURRENCY_CODES,
  LANGUAGE_OPTIONS,
} from "@/core/locale/presets";
import type { LocalePresetKey } from "@/core/locale/presets";
import {
  formatDate,
  formatTime,
  formatNumber,
  formatCurrency,
  formatWeekdayAbbrev,
  formatMonthAbbrev,
} from "@/core/locale/formatters";
import type { LocaleSettings } from "@/core/locale/formatters";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";

const DriveWizard = dynamic(() => import("./drive-wizard").then((m) => m.DriveWizard), {
  ssr: false,
  loading: () => (
    <div className="flex h-24 items-center justify-center rounded-lg border border-border-default bg-surface-overlay">
      <span className="font-ui text-sm text-text-tertiary">Loading…</span>
    </div>
  ),
});

const CalendarManageDialogLazy = dynamic(
  () => import("@/components/calendar/calendar-manage-dialog").then((m) => m.CalendarManageDialog),
  { ssr: false },
);

type Section =
  | "profile"
  | "appearance"
  | "preferences"
  | "capture"
  | "tasks"
  | "templates"
  | "gtd"
  | "integrations"
  | "ai"
  | "backups"
  | "storage"
  | "data"
  | "account"
  | "system";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "capture", label: "Capture", icon: Inbox },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "gtd", label: "GTD", icon: Info },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "backups", label: "Backups", icon: HardDrive },
  { id: "storage", label: "Storage", icon: Package },
  { id: "data", label: "Data", icon: Database },
  { id: "account", label: "Account", icon: LogOut },
  { id: "system", label: "System", icon: Settings2 },
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
      <div className="border-border-dashed rounded-xl border border-dashed bg-surface-sunken px-6 py-10 text-center">
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

const EMAIL_DOMAIN = "atlas.insightive.io";

function EmailStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    processed: "bg-accent-success-muted text-accent-success",
    discarded: "bg-surface-overlay text-text-tertiary",
    failed: "bg-accent-danger-muted text-accent-danger",
    pending: "bg-accent-warning-muted text-accent-warning",
    processing: "bg-accent-warning-muted text-accent-warning",
  };
  const labels: Record<string, string> = {
    processed: "Processed",
    discarded: "Discarded",
    failed: "Failed",
    pending: "Pending",
    processing: "Processing",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-ui text-2xs font-medium",
        styles[status] ?? styles.pending,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:focus-ring disabled:opacity-50",
        checked ? "bg-accent-primary" : "bg-border-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function isValidEmailOrDomain(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const domainRegex = /^(@)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  // *.example.com or *.sub.example.com — wildcard subdomain block
  const wildcardDomainRegex = /^\*\.([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  // *@newsletters.example.com — wildcard local-part block
  const wildcardEmailRegex = /^\*@[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return (
    emailRegex.test(value) ||
    domainRegex.test(value) ||
    wildcardDomainRegex.test(value) ||
    wildcardEmailRegex.test(value)
  );
}

function BlocklistChipInput({
  chips,
  onChange,
  disabled,
}: {
  chips: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const [duplicateHint, setDuplicateHint] = useState(false);
  const [invalidHint, setInvalidHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function tryAdd(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!value) return;

    if (!isValidEmailOrDomain(value)) {
      setInvalidHint(true);
      setTimeout(() => setInvalidHint(false), 2000);
      return;
    }

    if (chips.includes(value)) {
      setDuplicateHint(true);
      setTimeout(() => setDuplicateHint(false), 2000);
      return;
    }

    onChange([...chips, value]);
    setInputValue("");
    setDuplicateHint(false);
    setInvalidHint(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      tryAdd(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  }

  function handleBlur() {
    if (inputValue.trim()) {
      tryAdd(inputValue);
    }
  }

  function removeChip(index: number) {
    onChange(chips.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex min-h-[2.5rem] flex-wrap gap-1.5 rounded-md border bg-surface-overlay px-2 py-1.5 focus-within:ring-2 focus-within:ring-border-focus",
          duplicateHint || invalidHint ? "border-accent-warning" : "border-border-default",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip, i) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-xs text-text-primary"
          >
            {chip}
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                removeChip(i);
              }}
              className="ml-0.5 rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-border-subtle hover:text-text-primary disabled:opacity-50"
              aria-label={`Remove ${chip}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setDuplicateHint(false);
            setInvalidHint(false);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={
            chips.length === 0
              ? "noreply@example.com, example.com, *.example.com, or *@example.com"
              : ""
          }
          className="min-w-[160px] flex-1 bg-transparent font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
        />
      </div>
      {duplicateHint && (
        <p className="font-ui text-2xs text-accent-warning">Already in the blocklist.</p>
      )}
      {invalidHint && (
        <p className="font-ui text-2xs text-accent-warning">
          Enter a valid email, domain, or wildcard pattern (e.g. example.com, *.example.com, or
          *@example.com).
        </p>
      )}
    </div>
  );
}

type MigrationPhase =
  | { phase: "idle" }
  | { phase: "previewing" }
  | { phase: "preview"; categoryA: number; categoryB: number; total: number }
  | { phase: "running" }
  | { phase: "done" }
  | { phase: "error"; message: string };

function InboxMigrationCard() {
  const [state, setState] = useState<MigrationPhase>({ phase: "idle" });
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<{
    converted: number;
    kept: number;
    errors: number;
    ranAt: string;
  } | null>(null);

  const migrationMutation = trpc.capture.runInboxMigration.useMutation({
    onSuccess: (data) => {
      if (data.dry_run) {
        setState({
          phase: "preview",
          categoryA: data.categoryA ?? 0,
          categoryB: data.categoryB ?? 0,
          total: data.total ?? 0,
        });
      } else {
        setSummary({
          converted: data.converted ?? 0,
          kept: data.kept ?? 0,
          errors: data.errors ?? 0,
          ranAt: new Date().toISOString(),
        });
        setShowSummary(true);
        setState({ phase: "done" });
      }
    },
    onError: (err) => {
      setState({ phase: "error", message: err.message || "Migration failed. Please try again." });
    },
  });

  function handlePreview() {
    setState({ phase: "previewing" });
    migrationMutation.mutate({ dry_run: true });
  }

  function handleRun() {
    setState({ phase: "running" });
    migrationMutation.mutate({ dry_run: false });
  }

  if (state.phase === "done" && !showSummary) return null;

  return (
    <>
      {showSummary && summary && (
        <MigrationSummaryModal summary={summary} onClose={() => setShowSummary(false)} />
      )}
      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">
          Migrate inbox to captures
        </h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          Convert legacy inbox tasks to the new GTD capture workflow. Simple tasks with no
          meaningful metadata will become captures; tasks with due dates, tags, notes, or contexts
          will stay as-is.
        </p>

        {state.phase === "error" && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent-danger bg-accent-danger-muted px-3 py-2">
            <X size={13} className="mt-0.5 shrink-0 text-accent-danger" />
            <p className="font-ui text-xs text-accent-danger">{state.message}</p>
          </div>
        )}

        {(state.phase === "preview" || state.phase === "running") && (
          <div className="mb-4 space-y-2 rounded-lg border border-border-default bg-surface-overlay p-3">
            <div className="flex items-center justify-between font-ui text-sm">
              <span className="text-text-secondary">Will convert to captures</span>
              <span className="font-semibold tabular-nums text-accent-success">
                {state.phase === "preview" ? state.categoryA : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between font-ui text-sm">
              <span className="text-text-secondary">Will stay as tasks</span>
              <span className="font-semibold tabular-nums text-text-primary">
                {state.phase === "preview" ? state.categoryB : "—"}
              </span>
            </div>
            {state.phase === "preview" && state.total === 0 && (
              <p className="pt-1 font-ui text-xs text-text-tertiary">
                No inbox tasks found to migrate.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {(state.phase === "idle" || state.phase === "error") && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={migrationMutation.isPending}
              className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              Preview migration
            </button>
          )}
          {state.phase === "previewing" && (
            <span className="font-ui text-sm text-text-tertiary">Analyzing your inbox…</span>
          )}
          {state.phase === "preview" && state.total > 0 && (
            <>
              <button
                type="button"
                onClick={() => setState({ phase: "idle" })}
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={migrationMutation.isPending}
                className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
              >
                Run migration
              </button>
            </>
          )}
          {state.phase === "preview" && state.total === 0 && (
            <button
              type="button"
              onClick={() => setState({ phase: "idle" })}
              className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
            >
              Dismiss
            </button>
          )}
          {state.phase === "running" && (
            <span className="font-ui text-sm text-text-tertiary">Running migration…</span>
          )}
        </div>
      </div>
    </>
  );
}

function CaptureSection({ userId, userEmail }: { userId: string; userEmail: string }) {
  const utils = trpc.useUtils();
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const userData = rawUserData as User | undefined;
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const [optimisticChips, setOptimisticChips] = useState<string[] | null>(null);
  const [verifyState, setVerifyState] = useState<
    | { status: "idle" }
    | { status: "success"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const sendVerification = trpc.emails.sendVerificationEmail.useMutation({
    onSuccess: (data) => {
      setVerifyState({
        status: "success",
        message: `Test email sent to ${data.recipient}. Check your inbox in a moment.`,
      });
    },
    onError: (err) => {
      setVerifyState({
        status: "error",
        message: err.message || "Could not send the test email. Please try again.",
      });
    },
  });

  const directAddress = `inbox+${userId}@${EMAIL_DOMAIN}`;
  const plainAddress = `inbox@${EMAIL_DOMAIN}`;

  const { data: emailsData, isLoading: emailsLoading } = trpc.emails.list.useQuery(
    { limit: 10 },
    { refetchOnWindowFocus: false },
  );

  const updateMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setOptimisticChips(null);
    },
    onError: () => setOptimisticChips(null),
  });

  const tasksPrefs =
    typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
      ? (userData.tasks_prefs as Record<string, unknown>)
      : {};

  const filterAutoReplies = tasksPrefs["email_filter_auto_replies"] !== false;
  const filterCalendar = tasksPrefs["email_filter_calendar"] !== false;
  const blocklistArray = Array.isArray(tasksPrefs["email_blocklist"])
    ? (tasksPrefs["email_blocklist"] as string[])
    : [];
  const displayedChips = optimisticChips ?? blocklistArray;

  function handleCopyDirect() {
    navigator.clipboard.writeText(directAddress).then(() => {
      setCopiedDirect(true);
      setTimeout(() => setCopiedDirect(false), 2000);
    });
  }

  function handleCopyPlain() {
    navigator.clipboard.writeText(plainAddress).then(() => {
      setCopiedPlain(true);
      setTimeout(() => setCopiedPlain(false), 2000);
    });
  }

  function handleBlocklistChange(chips: string[]) {
    setOptimisticChips(chips);
    updateMutation.mutate({ email_blocklist: chips });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Capture"
        description="Configure how Atlas captures and processes incoming content."
      />

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Email-to-inbox</h3>
        <p className="mb-4 font-ui text-xs text-text-secondary">
          Forward or send emails to one of the addresses below and they will appear as Inbox tasks
          automatically.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="rounded-full bg-accent-success-muted px-2 py-0.5 font-ui text-2xs font-medium text-accent-success">
                Always works
              </span>
              <span className="font-ui text-xs font-medium text-text-primary">Direct address</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-overlay px-3 py-2">
              <code className="flex-1 break-all font-mono text-sm text-text-primary">
                {directAddress}
              </code>
              <Hint label="Copy address">
                <button
                  type="button"
                  onClick={handleCopyDirect}
                  className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label="Copy direct address"
                >
                  {copiedDirect ? (
                    <Check size={14} className="text-accent-success" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </Hint>
            </div>
            <p className="mt-1 font-ui text-2xs text-text-tertiary">
              Your personal inbox address. Emails sent here are always routed to your account,
              regardless of which address you send from.
            </p>
          </div>

          <div className="h-px bg-border-subtle" />

          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="rounded-full bg-accent-warning-muted px-2 py-0.5 font-ui text-2xs font-medium text-accent-warning">
                Sender must match
              </span>
              <span className="font-ui text-xs font-medium text-text-primary">Plain address</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-overlay px-3 py-2">
              <code className="flex-1 break-all font-mono text-sm text-text-primary">
                {plainAddress}
              </code>
              <Hint label="Copy address">
                <button
                  type="button"
                  onClick={handleCopyPlain}
                  className="shrink-0 rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label="Copy plain address"
                >
                  {copiedPlain ? (
                    <Check size={14} className="text-accent-success" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </Hint>
            </div>
            <p className="mt-1 font-ui text-2xs text-text-tertiary">
              Shared inbox address. Only works when you email from{" "}
              <span className="font-medium text-text-secondary">{userEmail}</span> — the address
              registered on your account.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-text-tertiary" />
          <p className="font-ui text-2xs text-text-tertiary">
            <span className="font-medium text-text-secondary">Tip:</span> Use the direct address
            when forwarding from a different email account, or when emailing via an alias. Forwarded
            emails are supported — the original sender is extracted where possible.
          </p>
        </div>

        <div className="mt-4 border-t border-border-subtle pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-ui text-sm font-medium text-text-primary">Verify routing</p>
              <p className="font-ui text-xs text-text-tertiary">
                Send a one-time test email to{" "}
                <span className="font-medium text-text-secondary">{userEmail}</span> to confirm
                Atlas can reach you.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setVerifyState({ status: "idle" });
                sendVerification.mutate();
              }}
              disabled={sendVerification.isPending}
              className={cn(
                "shrink-0 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-primary transition-colors",
                "hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {sendVerification.isPending ? "Sending…" : "Send test email"}
            </button>
          </div>
          {verifyState.status !== "idle" && (
            <div
              role="status"
              className={cn(
                "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 font-ui text-xs",
                verifyState.status === "success"
                  ? "border-accent-success bg-accent-success-muted text-accent-success"
                  : "border-accent-danger bg-accent-danger-muted text-accent-danger",
              )}
            >
              {verifyState.status === "success" ? (
                <Check size={13} className="mt-0.5 shrink-0" />
              ) : (
                <X size={13} className="mt-0.5 shrink-0" />
              )}
              <span>{verifyState.message}</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Filters</h3>
        <p className="mb-4 font-ui text-xs text-text-secondary">
          Automatically discard emails that match these conditions.
        </p>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-ui text-sm text-text-primary">Discard auto-replies</p>
              <p className="font-ui text-xs text-text-tertiary">
                Emails with an <code className="font-mono text-2xs">Auto-Submitted</code> header are
                silently discarded.
              </p>
            </div>
            <Toggle
              checked={filterAutoReplies}
              onChange={(val) => updateMutation.mutate({ email_filter_auto_replies: val })}
              disabled={updateMutation.isPending}
            />
          </div>
          <div className="h-px bg-border-subtle" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-ui text-sm text-text-primary">Discard calendar invites</p>
              <p className="font-ui text-xs text-text-tertiary">
                Emails with <code className="font-mono text-2xs">.ics</code> attachments or calendar
                content-type are discarded.
              </p>
            </div>
            <Toggle
              checked={filterCalendar}
              onChange={(val) => updateMutation.mutate({ email_filter_calendar: val })}
              disabled={updateMutation.isPending}
            />
          </div>
          <div className="h-px bg-border-subtle" />
          <div>
            <p className="mb-1 font-ui text-sm text-text-primary">Sender blocklist</p>
            <p className="mb-2 font-ui text-xs text-text-tertiary">
              Type an address or domain and press Enter or comma to add. Emails from matching
              senders are discarded.
            </p>
            <BlocklistChipInput
              chips={displayedChips}
              onChange={handleBlocklistChange}
              disabled={updateMutation.isPending}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-ui text-sm font-semibold text-text-primary">Recent emails</h3>
            <p className="font-ui text-xs text-text-secondary">
              The 10 most recently received emails.
            </p>
          </div>
        </div>

        {emailsLoading ? (
          <p className="font-ui text-sm text-text-tertiary">Loading…</p>
        ) : !emailsData || emailsData.captures.length === 0 ? (
          <div className="border-border-dashed rounded-lg border border-dashed bg-surface-sunken px-4 py-8 text-center">
            <p className="font-ui text-sm text-text-tertiary">No emails received yet.</p>
            <p className="mt-1 font-ui text-xs text-text-tertiary">
              Send an email to{" "}
              <span className="font-medium text-text-secondary">{directAddress}</span> to get
              started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-default">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-sunken">
                  <th className="px-3 py-2 text-left font-ui text-2xs font-medium text-text-tertiary">
                    From
                  </th>
                  <th className="px-3 py-2 text-left font-ui text-2xs font-medium text-text-tertiary">
                    Subject
                  </th>
                  <th className="px-3 py-2 text-left font-ui text-2xs font-medium text-text-tertiary">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-ui text-2xs font-medium text-text-tertiary">
                    Task
                  </th>
                  <th className="px-3 py-2 text-left font-ui text-2xs font-medium text-text-tertiary">
                    Block
                  </th>
                </tr>
              </thead>
              <tbody>
                {emailsData.captures.map((capture, i) => (
                  <tr
                    key={capture.id}
                    className={cn(
                      "border-b border-border-subtle last:border-0",
                      i % 2 === 0 ? "bg-surface-raised" : "bg-surface-overlay",
                    )}
                  >
                    <td className="max-w-[140px] truncate px-3 py-2 font-ui text-xs text-text-secondary">
                      {capture.from_address}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-ui text-xs text-text-primary">
                      {capture.subject ?? (
                        <span className="italic text-text-tertiary">No subject</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <EmailStatusBadge status={capture.status} />
                    </td>
                    <td className="px-3 py-2">
                      {capture.task_id ? (
                        <a
                          href={`/tasks/inbox?taskId=${capture.task_id}`}
                          className="inline-flex items-center gap-1 font-ui text-xs text-accent-primary hover:underline"
                        >
                          View <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="font-ui text-xs text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {capture.from_address ? (
                        (() => {
                          const addr = capture.from_address.trim().toLowerCase();
                          const isBlocked = displayedChips.includes(addr);
                          return (
                            <button
                              onClick={() => {
                                const updated = isBlocked
                                  ? displayedChips.filter((c) => c !== addr)
                                  : [...displayedChips, addr];
                                handleBlocklistChange(updated);
                              }}
                              disabled={updateMutation.isPending}
                              className={cn(
                                "rounded px-2 py-0.5 font-ui text-2xs font-medium transition-colors disabled:opacity-50",
                                isBlocked
                                  ? "bg-surface-sunken text-text-secondary hover:bg-surface-overlay"
                                  : "bg-accent-danger-muted text-accent-danger hover:opacity-80",
                              )}
                            >
                              {isBlocked ? "Unblock" : "Block"}
                            </button>
                          );
                        })()
                      ) : (
                        <span className="font-ui text-xs text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InboxMigrationCard />
    </div>
  );
}

function IntegrationsSection({
  autoOpenWizard,
  driveLinked,
  driveError,
  calLinked,
  calError,
}: {
  autoOpenWizard?: boolean;
  driveLinked?: boolean;
  driveError?: string;
  calLinked?: boolean;
  calError?: string;
}) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [showWizard, setShowWizard] = useState(autoOpenWizard ?? false);
  const [driveBanner, setDriveBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(() => {
    if (driveLinked) return { type: "success", message: "Google Drive connected successfully." };
    if (driveError) {
      const msg = DRIVE_ERROR_MESSAGES[driveError] ?? "An unexpected error occurred.";
      return { type: "error", message: msg };
    }
    return null;
  });

  const CAL_ERROR_MESSAGES: Record<string, string> = {
    config: "Google Calendar OAuth is not configured — contact your admin.",
    provider: "Google Calendar authorization was declined.",
    state_missing: "OAuth session expired — please try again.",
    state_mismatch: "OAuth state mismatch — possible CSRF. Please try again.",
    no_code: "No authorization code returned from Google.",
    exchange: "Failed to exchange authorization code. Please try again.",
  };

  const [calBanner, setCalBanner] = useState<{ type: "success" | "error"; message: string } | null>(
    () => {
      if (calLinked) return { type: "success", message: "Google Calendar connected successfully." };
      if (calError) {
        const msg = CAL_ERROR_MESSAGES[calError] ?? "An unexpected error occurred.";
        return { type: "error", message: msg };
      }
      return null;
    },
  );

  const [isCalSyncing, setIsCalSyncing] = useState(false);
  const [manageCalOpen, setManageCalOpen] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  const { data: calStatus, refetch: refetchCalStatus } = trpc.calendar.connected.useQuery(
    undefined,
    {
      staleTime: 30_000,
    },
  );
  const calDisconnect = trpc.calendar.disconnect.useMutation({
    onSuccess: () => {
      utils.calendar.connected.invalidate();
      setCalBanner({ type: "success", message: "Google Calendar disconnected." });
      setDisconnectConfirm(false);
    },
    onError: (err: { message?: string }) =>
      setCalBanner({ type: "error", message: err.message ?? "Disconnect failed" }),
  });

  async function handleCalSync() {
    setIsCalSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      if (res.ok) {
        setCalBanner({ type: "success", message: "Calendar synced successfully." });
        refetchCalStatus();
      } else {
        const data = await res.json();
        setCalBanner({ type: "error", message: data.error || "Sync failed." });
      }
    } catch {
      setCalBanner({ type: "error", message: "Sync request failed." });
    } finally {
      setIsCalSyncing(false);
    }
  }

  useEffect(() => {
    if (driveLinked || driveError || calLinked || calError) {
      router.replace("/settings?section=integrations");
    }
  }, [router, driveLinked, driveError, calLinked, calError]);

  useEffect(() => {
    if (!driveBanner || driveBanner.type !== "success") return;
    const t = setTimeout(() => setDriveBanner(null), 6000);
    return () => clearTimeout(t);
  }, [driveBanner]);

  useEffect(() => {
    if (!calBanner || calBanner.type !== "success") return;
    const t = setTimeout(() => setCalBanner(null), 6000);
    return () => clearTimeout(t);
  }, [calBanner]);

  const { data: driveStatus } = trpc.drive.linkStatus.useQuery();
  const { data: driveSyncStatus } = trpc.drive.syncStatus.useQuery(undefined, {
    enabled: !!driveStatus?.linked,
    refetchOnWindowFocus: false,
  });
  const unlinkDrive = trpc.drive.unlink.useMutation({
    onSuccess: () => utils.drive.linkStatus.invalidate(),
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refetch: runVerify } = trpc.drive.verify.useQuery(undefined, { enabled: false });

  useEffect(() => {
    return () => {
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
    };
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (isTesting) return;
    setIsTesting(true);
    setTestResult(null);
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    try {
      const { data, error } = await runVerify();
      if (error) {
        setTestResult({ ok: false, message: error.message || "Connection check failed." });
      } else if (data?.ok) {
        setTestResult({ ok: true, message: "Connection is working." });
      } else {
        setTestResult({
          ok: false,
          message: data?.reason ?? "Drive access could not be verified.",
        });
      }
    } catch {
      setTestResult({ ok: false, message: "Connection check failed." });
    } finally {
      setIsTesting(false);
      testTimerRef.current = setTimeout(() => setTestResult(null), 5000);
    }
  }, [isTesting, runVerify]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Integrations" description="Connect external services to Atlas." />

      {driveBanner && (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 font-ui text-sm ${
            driveBanner.type === "success"
              ? "border-accent-success bg-accent-success-muted text-accent-success"
              : "border-accent-danger bg-accent-danger-muted text-accent-danger"
          }`}
        >
          <span>{driveBanner.message}</span>
          <button
            onClick={() => setDriveBanner(null)}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="mb-4">
          <h3 className="font-ui text-sm font-semibold text-text-primary">Google Drive</h3>
          <p className="font-ui text-xs text-text-secondary">
            Link a Drive folder to store your Atlas files.
          </p>
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
                  Folder:{" "}
                  <span className="font-medium text-text-primary">
                    {driveStatus.config?.root_folder_name}
                  </span>
                </p>
                <p className="pl-4 font-ui text-xs capitalize text-text-secondary">
                  Type:{" "}
                  <span className="font-medium text-text-primary">
                    {driveStatus.config?.drive_type ?? "personal"}
                  </span>
                </p>
                {driveSyncStatus?.lastSynced ? (
                  <p className="pl-4 font-ui text-xs text-text-tertiary">
                    Last synced{" "}
                    <span className="font-medium text-text-secondary">
                      {new Date(driveSyncStatus.lastSynced).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="pl-4 font-ui text-xs text-text-tertiary">
                    Not yet synced — first sync runs hourly
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  {isTesting ? "Testing…" : "Test connection"}
                </button>
                <button
                  onClick={() => setShowWizard(true)}
                  className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
                >
                  Change folder
                </button>
                <button
                  onClick={() => {
                    if (confirm("Unlink Drive? Atlas will lose access to your Drive folder."))
                      unlinkDrive.mutate();
                  }}
                  className="rounded-md border border-accent-danger px-3 py-1.5 font-ui text-xs font-medium text-accent-danger hover:bg-accent-danger-muted"
                >
                  Unlink
                </button>
              </div>
            </div>
            {testResult && (
              <div
                className={cn(
                  "border-t px-4 py-2 font-ui text-xs",
                  testResult.ok
                    ? "border-accent-success bg-accent-success-muted text-accent-success"
                    : "border-accent-danger bg-accent-danger-muted text-accent-danger",
                )}
              >
                {testResult.message}
              </div>
            )}
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

      {calBanner && (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 font-ui text-sm ${
            calBanner.type === "success"
              ? "border-accent-success bg-accent-success-muted text-accent-success"
              : "border-accent-danger bg-accent-danger-muted text-accent-danger"
          }`}
        >
          <span>{calBanner.message}</span>
          <button
            onClick={() => setCalBanner(null)}
            className="flex-shrink-0 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="mb-4">
          <h3 className="font-ui text-sm font-semibold text-text-primary">Google Calendar</h3>
          <p className="font-ui text-xs text-text-secondary">
            Sync events and time-blocks with your Google Calendar.
          </p>
        </div>

        {calStatus?.connected ? (
          <div className="rounded-lg border border-border-default bg-surface-overlay">
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent-success" />
                  <p className="font-ui text-sm font-medium text-text-primary">
                    Calendar connected
                  </p>
                </div>
                {calStatus.email && (
                  <p className="pl-4 font-ui text-xs text-text-secondary">
                    Account:{" "}
                    <span className="font-medium text-text-primary">{calStatus.email}</span>
                  </p>
                )}
                <p className="pl-4 font-ui text-xs text-text-secondary">
                  {calStatus.calendarCount} calendar{calStatus.calendarCount !== 1 ? "s" : ""} ·{" "}
                  {calStatus.eventCount} event{calStatus.eventCount !== 1 ? "s" : ""}
                </p>
                {calStatus.lastSynced ? (
                  <p className="pl-4 font-ui text-xs text-text-tertiary">
                    Last synced{" "}
                    <span className="font-medium text-text-secondary">
                      {new Date(calStatus.lastSynced).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="pl-4 font-ui text-xs text-text-tertiary">
                    Syncs daily at 02:30 UTC
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-wrap gap-2">
                <button
                  onClick={handleCalSync}
                  disabled={isCalSyncing}
                  className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  {isCalSyncing ? "Syncing…" : "Sync now"}
                </button>
                <button
                  onClick={() => setManageCalOpen(true)}
                  className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
                >
                  Manage calendars
                </button>
                <button
                  onClick={() => setDisconnectConfirm(true)}
                  className="rounded-md border border-accent-danger px-3 py-1.5 font-ui text-xs font-medium text-accent-danger hover:bg-accent-danger-muted"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {disconnectConfirm && (
              <div className="border-accent-danger/30 border-t bg-accent-danger-muted px-4 py-3">
                <p className="mb-2 font-ui text-xs text-accent-danger">
                  Disconnecting will revoke access and soft-delete all synced calendar events.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => calDisconnect.mutate()}
                    disabled={calDisconnect.isPending}
                    className="rounded-md bg-accent-danger px-3 py-1.5 font-ui text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {calDisconnect.isPending ? "Disconnecting…" : "Yes, disconnect"}
                  </button>
                  <button
                    onClick={() => setDisconnectConfirm(false)}
                    className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs text-text-secondary hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <a
            href="/api/calendar/oauth/start"
            className="inline-block rounded-lg bg-accent-primary px-4 py-2.5 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover"
          >
            Connect Google Calendar
          </a>
        )}
      </div>

      {manageCalOpen && (
        <CalendarManageDialogLazy open={manageCalOpen} onClose={() => setManageCalOpen(false)} />
      )}

      <div className="rounded-xl border border-border-subtle bg-surface-base p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-ui text-sm font-semibold text-text-primary">Google Contacts</h3>
            <p className="font-ui text-xs text-text-tertiary">Import contacts to Atlas People.</p>
          </div>
          <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 font-ui text-2xs font-medium text-text-tertiary">
            Coming soon
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-base p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-ui text-sm font-semibold text-text-primary">
              Resend (Inbound Email)
            </h3>
            <p className="font-ui text-xs text-text-tertiary">
              Routes emails sent to your inbox address to Atlas tasks. Configure your inbox address
              in{" "}
              <button
                type="button"
                className="text-accent-primary hover:underline"
                onClick={() => {
                  window.location.href = "/settings?section=capture";
                }}
              >
                Settings → Capture
              </button>
              .
            </p>
          </div>
          <span className="rounded-full bg-accent-success-muted px-2.5 py-0.5 font-ui text-2xs font-medium text-accent-success">
            Active
          </span>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-accent-primary" : "bg-border-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function CaptureParsingSection({ userData }: { userData: User | undefined }) {
  const utils = trpc.useUtils();
  const updatePrefs = trpc.capture.updateCapturePrefs.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  const capturePrefs =
    ((typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
      ? (userData.tasks_prefs as Record<string, unknown>).capture_prefs
      : {}) as Record<string, unknown> | undefined) ?? {};

  const aiCaptureEnabled = (capturePrefs.ai_capture_enabled as boolean | undefined) ?? true;
  const parseReviewModal = (capturePrefs.parse_review_modal as string | undefined) ?? "never";
  const autoCreateTags = (capturePrefs.auto_create_tags as boolean | undefined) ?? true;
  const autoLinkProjects = (capturePrefs.auto_link_projects as boolean | undefined) ?? true;
  const autoLinkPeople = (capturePrefs.auto_link_people as boolean | undefined) ?? false;
  const aiFallbackEnabled = (capturePrefs.ai_fallback_enabled as boolean | undefined) ?? true;

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
      <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Capture parsing</h3>
      <p className="mb-4 font-ui text-xs text-text-secondary">
        Configure how Atlas parses and files tasks when you capture them.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              Enable AI capture parsing
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Master toggle — disable to use local-only parsing for all captures.
            </p>
          </div>
          <ToggleSwitch
            checked={aiCaptureEnabled}
            onChange={(v) => updatePrefs.mutate({ ai_capture_enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              AI fallback for hard cases
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Use AI when local confidence is below threshold.
            </p>
          </div>
          <ToggleSwitch
            checked={aiFallbackEnabled}
            onChange={(v) => updatePrefs.mutate({ ai_fallback_enabled: v })}
          />
        </div>

        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-primary">
            Show parse review modal
          </label>
          <p className="mb-1.5 font-ui text-2xs text-text-tertiary">
            Appear before saving so you can inspect and adjust what was parsed.
          </p>
          <select
            value={parseReviewModal}
            onChange={(e) =>
              updatePrefs.mutate({
                parse_review_modal: e.target.value as "never" | "when_uncertain" | "always",
              })
            }
            className="rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            <option value="never">Never</option>
            <option value="when_uncertain">When uncertain (confidence &lt; threshold)</option>
            <option value="always">Always</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">Allow auto-create tags</p>
            <p className="font-ui text-2xs text-text-tertiary">
              Automatically create new tags from capture hints.
            </p>
          </div>
          <ToggleSwitch
            checked={autoCreateTags}
            onChange={(v) => updatePrefs.mutate({ auto_create_tags: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              Allow auto-link to projects
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Automatically link tasks to existing projects by name.
            </p>
          </div>
          <ToggleSwitch
            checked={autoLinkProjects}
            onChange={(v) => updatePrefs.mutate({ auto_link_projects: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-ui text-xs font-medium text-text-primary">
              Allow auto-link to people
            </p>
            <p className="font-ui text-2xs text-text-tertiary">
              Automatically link @mentions to Atlas People entries.
            </p>
          </div>
          <ToggleSwitch
            checked={autoLinkPeople}
            onChange={(v) => updatePrefs.mutate({ auto_link_people: v })}
          />
        </div>
      </div>
    </div>
  );
}

function CaptureIntelligenceSection({ userData }: { userData: User | undefined }) {
  const utils = trpc.useUtils();
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [sliderValue, setSliderValue] = useState<number>(userData?.ai_confidence_threshold ?? 0.7);
  const [sliderApplied, setSliderApplied] = useState(false);

  const strategyStats = trpc.capture.strategyStats.useQuery({ days: rangeDays });
  const qualityStats = trpc.capture.qualityStats.useQuery({ days: rangeDays });
  const overrideStats = trpc.capture.overrideStats.useQuery({ days: rangeDays });
  const thresholdImpact = trpc.capture.thresholdImpact.useQuery(
    { threshold: sliderValue, days: rangeDays },
    { staleTime: 1000 },
  );
  const exportStats = trpc.capture.exportStats.useQuery({ days: rangeDays }, { enabled: false });
  const updateThreshold = trpc.capture.updateThreshold.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setSliderApplied(true);
      setTimeout(() => setSliderApplied(false), 2000);
    },
  });
  const updateFallback = trpc.capture.updateCapturePrefs.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  const capturePrefs =
    ((typeof userData?.tasks_prefs === "object" && userData?.tasks_prefs !== null
      ? (userData.tasks_prefs as Record<string, unknown>).capture_prefs
      : {}) as Record<string, unknown> | undefined) ?? {};
  const aiFallbackEnabled = (capturePrefs.ai_fallback_enabled as boolean | undefined) ?? true;

  const st = strategyStats.data;
  const qt = qualityStats.data;
  const ov = overrideStats.data;
  const ti = thresholdImpact.data;

  const strategyVerdict = (() => {
    if (!st || st.totalCaptures === 0) return null;
    const localPct = (st.byTier.local_only / st.totalCaptures) * 100;
    if (localPct >= 70)
      return { label: "Working well", color: "text-accent-success", bg: "bg-accent-success/10" };
    if (localPct >= 40)
      return { label: "Marginal", color: "text-accent-warning", bg: "bg-accent-warning/10" };
    return { label: "Underperforming", color: "text-accent-danger", bg: "bg-accent-danger/10" };
  })();

  function handleExport() {
    exportStats.refetch().then((res) => {
      if (!res.data) return;
      const blob = new Blob([res.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capture-stats-${rangeDays}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const RANGE_OPTIONS = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
    { label: "All", value: 0 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-ui text-base font-semibold text-text-primary">Capture intelligence</h3>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRangeDays(opt.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-ui text-xs font-medium transition-colors",
                rangeDays === opt.value
                  ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                  : "border-border-default bg-surface-overlay text-text-tertiary hover:text-text-secondary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-ui text-sm font-semibold text-text-primary">Strategy performance</h4>
          {strategyVerdict && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 font-ui text-2xs font-medium",
                strategyVerdict.bg,
                strategyVerdict.color,
              )}
            >
              {strategyVerdict.label}
            </span>
          )}
        </div>
        {strategyStats.isLoading ? (
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        ) : !st || st.totalCaptures === 0 ? (
          <p className="font-ui text-xs text-text-tertiary">No capture data for this period.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 font-ui text-2xs text-text-tertiary">
                Parse tier distribution ({st.totalCaptures} total)
              </p>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-sunken">
                {st.byTier.local_only > 0 && (
                  <div
                    title={`Local only: ${st.byTier.local_only}`}
                    style={{ width: `${(st.byTier.local_only / st.totalCaptures) * 100}%` }}
                    className="h-full bg-accent-success transition-all"
                  />
                )}
                {st.byTier.local_plus_ai > 0 && (
                  <div
                    title={`Local + AI: ${st.byTier.local_plus_ai}`}
                    style={{ width: `${(st.byTier.local_plus_ai / st.totalCaptures) * 100}%` }}
                    className="h-full bg-accent-info transition-all"
                  />
                )}
                {st.byTier.fallback_only > 0 && (
                  <div
                    title={`AI primary: ${st.byTier.fallback_only}`}
                    style={{ width: `${(st.byTier.fallback_only / st.totalCaptures) * 100}%` }}
                    className="h-full bg-accent-warning transition-all"
                  />
                )}
              </div>
              <div className="mt-1 flex gap-3 font-ui text-2xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-success" />
                  Local only ({st.byTier.local_only})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-info" />
                  Local+AI ({st.byTier.local_plus_ai})
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent-warning" />
                  AI primary ({st.byTier.fallback_only})
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Actual AI cost</p>
                <p className="font-ui text-sm font-semibold text-text-primary">
                  ${st.totalAiCost.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Estimated pure-AI</p>
                <p className="font-ui text-sm font-semibold text-text-primary">
                  ${st.estimatedPureAiCost.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Savings</p>
                <p className="font-ui text-sm font-semibold text-accent-success">
                  ${st.aiCostSavings.toFixed(4)}
                  {st.estimatedPureAiCost > 0 && (
                    <span className="ml-1 font-ui text-2xs font-normal text-text-tertiary">
                      ({((st.aiCostSavings / st.estimatedPureAiCost) * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h4 className="mb-3 font-ui text-sm font-semibold text-text-primary">Parse quality</h4>
        {qualityStats.isLoading ? (
          <p className="font-ui text-2xs text-text-tertiary">Loading…</p>
        ) : !qt || qt.total === 0 ? (
          <p className="font-ui text-xs text-text-tertiary">No capture data for this period.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">Avg confidence</p>
                <p className="font-ui text-sm font-semibold text-text-primary">
                  {(qt.avgConfidence * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                <p className="font-ui text-2xs text-text-tertiary">AI error rate</p>
                <p
                  className={cn(
                    "font-ui text-sm font-semibold",
                    qt.aiFailureRate > 0.1 ? "text-accent-danger" : "text-text-primary",
                  )}
                >
                  {(qt.aiFailureRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            {(qt.avgLocalMs !== undefined || qt.avgAiMs !== undefined) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                  <p className="font-ui text-2xs text-text-tertiary">Local parse latency</p>
                  <p className="font-ui text-sm font-semibold text-text-primary">
                    {qt.avgLocalMs ?? 0}ms
                  </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                  <p className="font-ui text-2xs text-text-tertiary">AI parse latency</p>
                  <p className="font-ui text-sm font-semibold text-text-primary">
                    {qt.avgAiMs ?? 0}ms
                  </p>
                </div>
              </div>
            )}
            {ov && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                    <p className="font-ui text-2xs text-text-tertiary">
                      Suggestion acceptance rate
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className={cn(
                          "font-ui text-sm font-semibold",
                          ov.overrideRate > 0.3 ? "text-accent-warning" : "text-accent-success",
                        )}
                      >
                        {ov.totalCaptures > 0
                          ? `${(100 - ov.overrideRate * 100).toFixed(0)}%`
                          : "—"}
                      </p>
                      {ov.previousOverrideRate !== null &&
                        ov.previousOverrideRate !== undefined && (
                          <span
                            className={cn(
                              "font-ui text-2xs font-medium",
                              ov.overrideRate > ov.previousOverrideRate
                                ? "text-accent-danger"
                                : ov.overrideRate < ov.previousOverrideRate
                                  ? "text-accent-success"
                                  : "text-text-tertiary",
                            )}
                          >
                            {ov.overrideRate > ov.previousOverrideRate
                              ? "↑ more overrides"
                              : ov.overrideRate < ov.previousOverrideRate
                                ? "↓ fewer overrides"
                                : "→ stable"}
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                    <p className="font-ui text-2xs text-text-tertiary">Most overridden field</p>
                    <p className="font-ui text-sm font-semibold capitalize text-text-primary">
                      {ov.mostOverridden
                        ? `${ov.mostOverridden} (${ov.mostOverriddenCount}×)`
                        : "—"}
                    </p>
                  </div>
                </div>
                {ov.leastOverridden && ov.leastOverridden !== ov.mostOverridden && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border-subtle bg-surface-base p-3">
                      <p className="font-ui text-2xs text-text-tertiary">Least overridden field</p>
                      <p className="font-ui text-sm font-semibold capitalize text-accent-success">
                        {`${ov.leastOverridden} (${ov.leastOverriddenCount}×)`}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={exportStats.isFetching}
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                {exportStats.isFetching ? "Exporting…" : "Download capture stats as CSV"}
              </button>
              <a
                href="/capture/logs?filter=overrides"
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                View overrides log →
              </a>
              <a
                href="/capture/saved"
                className="rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary hover:bg-surface-hover"
              >
                Edit saved captures →
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h4 className="mb-3 font-ui text-sm font-semibold text-text-primary">Adjustments</h4>
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="font-ui text-xs font-medium text-text-primary">
                Confidence threshold
              </label>
              <span className="font-ui text-xs font-semibold text-text-primary">
                {sliderValue.toFixed(2)}
              </span>
            </div>
            <p className="mb-2 font-ui text-2xs text-text-tertiary">
              Captures below this confidence use AI. Higher = more AI calls.
            </p>
            <input
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full accent-accent-primary"
            />
            <div className="mt-1 flex justify-between font-ui text-2xs text-text-tertiary">
              <span>0.50 (less AI)</span>
              <span>0.90 (more AI)</span>
            </div>
            {ti && ti.total > 0 && (
              <div className="mt-2 rounded-md border border-border-subtle bg-surface-base px-3 py-2">
                <p className="font-ui text-2xs text-text-secondary">
                  At this threshold, based on last {rangeDays}d:{" "}
                  <span className="font-semibold">{ti.wouldSkipAi} captures</span> go local-only,{" "}
                  <span className="font-semibold">{ti.wouldUseAi} uses AI</span>, estimated cost{" "}
                  <span className="font-semibold">${ti.estimatedDailyCost.toFixed(4)}</span>.
                </p>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateThreshold.mutate({ threshold: sliderValue })}
                disabled={updateThreshold.isPending}
                className="rounded-md bg-accent-primary px-3 py-1.5 font-ui text-xs font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
              >
                {updateThreshold.isPending ? "Saving…" : "Apply changes"}
              </button>
              {sliderApplied && <span className="font-ui text-xs text-accent-success">Saved</span>}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border-subtle pt-4">
            <div>
              <p className="font-ui text-xs font-medium text-text-primary">AI fallback</p>
              <p className="font-ui text-2xs text-text-tertiary">
                Disable to use local-only parsing for all captures.
              </p>
            </div>
            <ToggleSwitch
              checked={aiFallbackEnabled}
              onChange={(v) => updateFallback.mutate({ ai_fallback_enabled: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AISection({ userData }: { userData?: User }) {
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.ai.usageStats.useQuery();
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const user = (rawUserData as User | undefined) ?? userData;

  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("atlas:ai_enabled");
    return stored !== "false";
  });

  const [budgetInput, setBudgetInput] = useState<string>(() => {
    const v = (userData as (User & { ai_budget_usd?: number | null }) | undefined)?.ai_budget_usd;
    return v != null ? String(v) : "";
  });
  const [budgetSaved, setBudgetSaved] = useState(false);

  useEffect(() => {
    const v = (user as (User & { ai_budget_usd?: number | null }) | undefined)?.ai_budget_usd;
    setBudgetInput(v != null ? String(v) : "");
  }, [user]);

  const updateBudgetMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      utils.ai.usageStats.invalidate();
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    },
  });

  function handleBudgetSave() {
    const parsed = budgetInput.trim() === "" ? null : parseFloat(budgetInput);
    if (parsed !== null && (isNaN(parsed) || parsed <= 0)) return;
    updateBudgetMutation.mutate({ ai_budget_usd: parsed });
  }

  function handleToggle() {
    const next = !aiEnabled;
    setAiEnabled(next);
    localStorage.setItem("atlas:ai_enabled", String(next));
  }

  const monthlyUsd = stats?.monthly.costUsd ?? 0;
  const budgetUsd = stats?.budgetUsd ?? null;
  const budgetPct = budgetUsd != null && budgetUsd > 0 ? monthlyUsd / budgetUsd : null;

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
          <ToggleSwitch checked={aiEnabled} onChange={handleToggle} />
        </div>
        <p className="mt-2 font-ui text-2xs text-text-tertiary">
          Preference saved locally — full profile sync coming in a future wave.
        </p>
      </div>

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-1 font-ui text-sm font-semibold text-text-primary">Monthly AI Budget</h3>
        <p className="mb-3 font-ui text-xs text-text-secondary">
          Set a monthly spending limit. You will see a warning on the usage page when you reach 80%
          of your budget.
        </p>
        <div className="flex items-center gap-2">
          <span className="font-ui text-sm text-text-secondary">$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="No limit"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBudgetSave()}
            className="w-32 rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          />
          <button
            type="button"
            onClick={handleBudgetSave}
            disabled={updateBudgetMutation.isPending}
            className="rounded-md bg-accent-primary px-3 py-2 font-ui text-sm font-medium text-text-on-accent hover:bg-accent-primary-hover disabled:opacity-50"
          >
            {updateBudgetMutation.isPending ? "Saving…" : "Save"}
          </button>
          {budgetInput !== "" && (
            <button
              type="button"
              onClick={() => {
                setBudgetInput("");
                updateBudgetMutation.mutate({ ai_budget_usd: null });
              }}
              className="font-ui text-xs text-text-tertiary hover:text-text-secondary"
            >
              Clear
            </button>
          )}
          {budgetSaved && <span className="font-ui text-xs text-accent-success">Saved</span>}
        </div>
        {budgetUsd != null && budgetPct != null && budgetPct >= 0.8 && (
          <div
            className={cn(
              "mt-3 rounded-lg px-3 py-2 font-ui text-xs font-medium",
              budgetPct >= 1
                ? "bg-accent-danger-muted text-accent-danger"
                : "bg-accent-warning-muted text-accent-warning",
            )}
          >
            {budgetPct >= 1
              ? `Budget exceeded — $${monthlyUsd.toFixed(4)} spent of $${budgetUsd.toFixed(2)} limit.`
              : `Heads up — you've used ${(budgetPct * 100).toFixed(0)}% of your $${budgetUsd.toFixed(2)} monthly budget.`}
          </div>
        )}
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
          Atlas uses Claude (Anthropic) for all AI features. Model selection and per-feature toggles
          coming in a future wave.
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

      <div className="border-t border-border-subtle pt-2">
        <CaptureParsingSection userData={user} />
      </div>

      <div className="border-t border-border-subtle pt-2">
        <CaptureIntelligenceSection userData={user} />
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

function GtdSection() {
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

function LocalePreviewBlock({ locale }: { locale: LocaleSettings }) {
  const sampleDate = new Date(2025, 11, 31, 14, 5, 0);
  const sampleNumber = 1234567.89;
  const sampleCurrency = 9999.5;

  // Dec 28, 2025 is a Sunday — gives us Sun–Sat for the full 7-day row
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2025, 11, 28 + i));

  // Previous, current, and next month relative to sampleDate (Nov, Dec, Jan)
  const months = [new Date(2025, 10, 1), new Date(2025, 11, 1), new Date(2026, 0, 1)];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-4">
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Date</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatDate(sampleDate, locale)}
        </p>
      </div>
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Time</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatTime(sampleDate, locale)}
        </p>
      </div>
      <div className="col-span-2">
        <p className="font-ui text-2xs font-medium text-text-tertiary">Weekdays</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {weekdays.map((d, i) => (
            <span key={i} className="font-mono text-sm text-text-primary">
              {formatWeekdayAbbrev(d, locale.language)}
            </span>
          ))}
        </div>
      </div>
      <div className="col-span-2">
        <p className="font-ui text-2xs font-medium text-text-tertiary">Months</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {months.map((d, i) => (
            <span key={i} className="font-mono text-sm text-text-primary">
              {formatMonthAbbrev(d, locale.language)}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Number</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatNumber(sampleNumber, locale)}
        </p>
      </div>
      <div>
        <p className="font-ui text-2xs font-medium text-text-tertiary">Currency</p>
        <p className="mt-0.5 font-mono text-sm text-text-primary">
          {formatCurrency(sampleCurrency, locale)}
        </p>
      </div>
    </div>
  );
}

function PreferencesSection({ initialUser }: { initialUser: User }) {
  const utils = trpc.useUtils();
  const { data: rawUserData } = trpc.user.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const user = (rawUserData as User | undefined) ?? initialUser;

  const serverPreset = (user.locale_preset ?? "pakistan") as LocalePresetKey;

  const [localPreset, setLocalPreset] = useState<LocalePresetKey>(serverPreset);
  const [localLocale, setLocalLocale] = useState<LocaleSettings>({
    date_format: user.date_format ?? "DD/MM/YYYY",
    time_format: (user.time_format as "12h" | "24h") ?? "12h",
    number_format: user.number_format ?? "1,234.56",
    currency_code: user.currency_code ?? "PKR",
    currency_symbol: user.currency_symbol ?? "₨",
    language: user.language ?? "ur",
  });

  const [showCustom, setShowCustom] = useState(serverPreset === "custom");
  const [saved, setSaved] = useState<string | null>(null);
  const [localeError, setLocaleError] = useState<string | null>(null);

  useEffect(() => {
    setLocalPreset(serverPreset);
    setLocalLocale({
      date_format: user.date_format ?? "DD/MM/YYYY",
      time_format: (user.time_format as "12h" | "24h") ?? "12h",
      number_format: user.number_format ?? "1,234.56",
      currency_code: user.currency_code ?? "PKR",
      currency_symbol: user.currency_symbol ?? "₨",
      language: user.language ?? "ur",
    });
    setShowCustom(serverPreset === "custom");
  }, [
    serverPreset,
    user.date_format,
    user.time_format,
    user.number_format,
    user.currency_code,
    user.currency_symbol,
    user.language,
  ]);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- TS2589: tRPC type inference depth; safe at runtime
  const updateLocale = trpc.user.updateLocale.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setLocaleError(null);
      setSaved("Saved");
      setTimeout(() => setSaved(null), 2000);
    },
    onError: (err) => {
      setLocaleError(err.message ?? "Failed to save locale settings.");
    },
  });

  function handlePresetChange(preset: LocalePresetKey) {
    setLocalPreset(preset);
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    const p = LOCALE_PRESETS.find((lp) => lp.key === preset);
    if (!p) return;
    setLocalLocale(p.settings);
    setShowCustom(false);
    updateLocale.mutate({
      preset: preset as "pakistan" | "us" | "uk",
      language: p.settings.language,
    });
  }

  function handleLanguageChange(language: string) {
    setLocalLocale((prev) => ({ ...prev, language }));
    if (localPreset !== "custom") {
      updateLocale.mutate({ preset: localPreset as "pakistan" | "us" | "uk", language });
    }
  }

  function handleCustomSave() {
    const code = localLocale.currency_code.trim().toUpperCase();
    if (!ISO_4217_CURRENCY_CODES.has(code)) {
      setLocaleError("Currency code must be a valid ISO 4217 code (e.g. USD, EUR, PKR).");
      return;
    }
    const symbol = localLocale.currency_symbol.trim();
    if (!symbol) {
      setLocaleError("Currency symbol cannot be empty.");
      return;
    }
    if (symbol.length > 5) {
      setLocaleError("Currency symbol must be 5 characters or fewer.");
      return;
    }
    setLocaleError(null);
    updateLocale.mutate({
      preset: "custom",
      date_format: localLocale.date_format,
      time_format: localLocale.time_format as "12h" | "24h",
      number_format: localLocale.number_format,
      currency_code: code,
      currency_symbol: symbol,
      language: localLocale.language,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Preferences"
        description="Control how dates, numbers, and currencies are displayed throughout Atlas."
      />

      {saved && (
        <div className="rounded-lg bg-accent-success-muted px-4 py-2 font-ui text-sm text-accent-success">
          {saved}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
            Locale preset
          </label>
          <select
            className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            value={localPreset}
            onChange={(e) => handlePresetChange(e.target.value as LocalePresetKey)}
          >
            {LOCALE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Choose a preset to apply locale defaults, or select Custom to configure each setting
            individually.
          </p>
        </div>

        <div>
          <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
            Language
          </label>
          <select
            className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            value={localLocale.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 font-ui text-xs text-text-tertiary">
            Controls weekday and month names throughout Atlas.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 font-ui text-xs font-medium text-text-secondary">Live preview</p>
        <LocalePreviewBlock locale={localLocale} />
      </div>

      {(showCustom || localPreset === "custom") && (
        <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
          <h3 className="mb-4 font-ui text-sm font-semibold text-text-primary">
            Custom locale settings
          </h3>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Date format
                </label>
                <select
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  value={localLocale.date_format}
                  onChange={(e) => setLocalLocale((l) => ({ ...l, date_format: e.target.value }))}
                >
                  {DATE_FORMAT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Time format
                </label>
                <div className="flex gap-2">
                  {TIME_FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setLocalLocale((l) => ({ ...l, time_format: opt.value as "12h" | "24h" }))
                      }
                      className={cn(
                        "flex-1 rounded-md border px-3 py-2 font-ui text-sm font-medium transition-colors",
                        localLocale.time_format === opt.value
                          ? "border-accent-primary bg-accent-primary-muted text-accent-primary"
                          : "border-border-default bg-surface-overlay text-text-secondary hover:bg-surface-hover",
                      )}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                Number format
              </label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-ui text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                value={localLocale.number_format}
                onChange={(e) => setLocalLocale((l) => ({ ...l, number_format: e.target.value }))}
              >
                {NUMBER_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Currency code
                </label>
                <input
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  value={localLocale.currency_code}
                  maxLength={3}
                  onChange={(e) =>
                    setLocalLocale((l) => ({ ...l, currency_code: e.target.value.toUpperCase() }))
                  }
                  placeholder="PKR"
                />
                <p className="mt-1 font-ui text-2xs text-text-tertiary">
                  Valid ISO 4217 code (e.g. USD, EUR, PKR)
                </p>
              </div>
              <div>
                <label className="mb-1 block font-ui text-xs font-medium text-text-secondary">
                  Currency symbol
                </label>
                <input
                  className="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  value={localLocale.currency_symbol}
                  maxLength={5}
                  onChange={(e) =>
                    setLocalLocale((l) => ({ ...l, currency_symbol: e.target.value }))
                  }
                  placeholder="₨"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 font-ui text-xs font-medium text-text-secondary">
                Preview with custom settings
              </p>
              <LocalePreviewBlock locale={localLocale} />
            </div>
            {localeError && (
              <p className="rounded-md bg-accent-danger-muted px-3 py-2 font-ui text-sm text-accent-danger">
                {localeError}
              </p>
            )}
            <button
              onClick={handleCustomSave}
              disabled={updateLocale.isPending}
              className="self-start rounded-md bg-accent-primary px-4 py-2 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateLocale.isPending ? "Saving…" : "Save custom locale"}
            </button>
          </div>
        </div>
      )}

      {!showCustom && localPreset !== "custom" && (
        <button
          onClick={() => setShowCustom(true)}
          className="self-start rounded-md border border-border-default px-4 py-2 font-ui text-sm text-text-secondary hover:bg-surface-hover"
        >
          Custom…
        </button>
      )}
    </div>
  );
}

interface SettingsClientProps {
  user: User;
  initialSection?: string;
  autoOpenWizard?: boolean;
  driveLinked?: boolean;
  driveError?: string;
  calLinked?: boolean;
  calError?: string;
}

const VALID_SECTIONS = new Set<Section>([
  "profile",
  "appearance",
  "preferences",
  "capture",
  "tasks",
  "templates",
  "gtd",
  "integrations",
  "ai",
  "backups",
  "storage",
  "data",
  "account",
  "system",
]);

function resolveSection(raw: string | undefined, fallback: Section): Section {
  if (raw && VALID_SECTIONS.has(raw as Section)) return raw as Section;
  return fallback;
}

function StorageSection() {
  const stats = trpc.media.stats.useQuery(undefined, { staleTime: 60_000 });
  const s = stats.data;

  function fmtBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Storage" description="Manage your attached files and media." />

      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
        <h3 className="mb-3 font-ui text-sm font-semibold text-text-primary">Attachment Summary</h3>
        {stats.isLoading ? (
          <p className="font-ui text-xs text-text-tertiary">Loading…</p>
        ) : s ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-base p-3">
              <p className="font-ui text-2xs text-text-tertiary">Total files</p>
              <p className="mt-0.5 font-ui text-xl font-semibold text-text-primary">
                {s.total_count}
              </p>
            </div>
            <div className="rounded-lg bg-surface-base p-3">
              <p className="font-ui text-2xs text-text-tertiary">Storage used</p>
              <p className="mt-0.5 font-ui text-xl font-semibold text-text-primary">
                {fmtBytes(s.total_bytes)}
              </p>
            </div>
          </div>
        ) : null}

        {s && Object.entries(s.by_type).some(([, v]) => v.count > 0) && (
          <div className="mt-4">
            <h4 className="mb-2 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
              By type
            </h4>
            <div className="flex flex-col gap-1">
              {Object.entries(s.by_type)
                .filter(([, v]) => v.count > 0)
                .map(([type, v]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="font-ui text-xs capitalize text-text-secondary">{type}</span>
                    <span className="font-ui text-xs text-text-tertiary">
                      {v.count} file{v.count !== 1 ? "s" : ""} · {fmtBytes(v.bytes)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <a
            href="/media"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
          >
            <ExternalLink size={13} />
            Manage in Media inbox
          </a>
        </div>
      </div>

      {s && (s.unreviewed_count > 0 || s.orphan_count > 0) && (
        <div className="border-accent-warning/30 bg-accent-warning/5 rounded-xl border p-5">
          <h3 className="mb-2 font-ui text-sm font-semibold text-text-primary">
            Cleanup suggestions
          </h3>
          <div className="flex flex-col gap-2">
            {s.unreviewed_count > 0 && (
              <div className="flex items-start justify-between gap-4">
                <p className="font-ui text-xs text-text-secondary">
                  You have <strong>{s.unreviewed_count}</strong> unreviewed attachment
                  {s.unreviewed_count !== 1 ? "s" : ""}.
                </p>
                <a
                  href="/media?reviewed=false"
                  className="shrink-0 font-ui text-xs text-accent-info hover:underline"
                >
                  Review now
                </a>
              </div>
            )}
            {s.orphan_count > 0 && (
              <div className="flex items-start justify-between gap-4">
                <p className="font-ui text-xs text-text-secondary">
                  You have <strong>{s.orphan_count}</strong> orphaned attachment
                  {s.orphan_count !== 1 ? "s" : ""} not attached to any task.
                </p>
                <a
                  href="/media?source=orphaned"
                  className="shrink-0 font-ui text-xs text-accent-info hover:underline"
                >
                  View orphans
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type AdminMigrationPhase =
  | { phase: "idle" }
  | { phase: "previewing" }
  | {
      phase: "preview";
      userCount: number;
      totalCategoryA: number;
      totalCategoryB: number;
      totalItems: number;
    }
  | { phase: "running" }
  | {
      phase: "done";
      userCount: number;
      totalConverted: number;
      totalKept: number;
      totalErrors: number;
    }
  | { phase: "error"; message: string };

function AdminMigrationPanel() {
  const [state, setState] = useState<AdminMigrationPhase>({ phase: "idle" });

  const migrationMutation = trpc.admin.runMigrationForAllUsers.useMutation({
    onSuccess: (data) => {
      if (data.dry_run) {
        setState({
          phase: "preview",
          userCount: data.userCount,
          totalCategoryA: data.totalCategoryA,
          totalCategoryB: data.totalCategoryB,
          totalItems: data.totalItems,
        });
      } else {
        setState({
          phase: "done",
          userCount: data.userCount,
          totalConverted: data.totalConverted,
          totalKept: data.totalKept,
          totalErrors: data.totalErrors,
        });
      }
    },
    onError: (err) => {
      setState({ phase: "error", message: err.message || "Migration failed." });
    },
  });

  function handlePreview() {
    setState({ phase: "previewing" });
    migrationMutation.mutate({ dry_run: true });
  }

  function handleRun() {
    setState({ phase: "running" });
    migrationMutation.mutate({ dry_run: false });
  }

  return (
    <div className="border-accent-warning/40 bg-accent-warning/5 rounded-xl border p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-accent-warning-muted px-2 py-0.5 font-ui text-2xs font-semibold text-accent-warning">
          Admin only
        </span>
        <h3 className="font-ui text-sm font-semibold text-text-primary">
          Inbox migration — all users
        </h3>
      </div>
      <p className="mb-3 font-ui text-xs text-text-secondary">
        Run the inbox-to-captures migration for every active user. Each user will see their summary
        the next time they open their inbox.
      </p>

      {state.phase === "error" && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent-danger bg-accent-danger-muted px-3 py-2">
          <X size={13} className="mt-0.5 shrink-0 text-accent-danger" />
          <p className="font-ui text-xs text-accent-danger">{state.message}</p>
        </div>
      )}

      {state.phase === "preview" && (
        <div className="mb-4 space-y-2 rounded-lg border border-border-default bg-surface-overlay p-3">
          <div className="flex items-center justify-between font-ui text-sm">
            <span className="text-text-secondary">Users</span>
            <span className="font-semibold tabular-nums text-text-primary">{state.userCount}</span>
          </div>
          <div className="flex items-center justify-between font-ui text-sm">
            <span className="text-text-secondary">Total items to convert</span>
            <span className="font-semibold tabular-nums text-accent-success">
              {state.totalCategoryA}
            </span>
          </div>
          <div className="flex items-center justify-between font-ui text-sm">
            <span className="text-text-secondary">Total items to keep</span>
            <span className="font-semibold tabular-nums text-text-primary">
              {state.totalCategoryB}
            </span>
          </div>
        </div>
      )}

      {state.phase === "done" && (
        <div className="border-accent-success/30 mb-4 space-y-2 rounded-lg border bg-accent-success-muted p-3">
          <div className="flex items-center justify-between font-ui text-sm">
            <span className="text-text-secondary">Users migrated</span>
            <span className="font-semibold tabular-nums text-text-primary">{state.userCount}</span>
          </div>
          <div className="flex items-center justify-between font-ui text-sm">
            <span className="text-text-secondary">Total converted</span>
            <span className="font-semibold tabular-nums text-accent-success">
              {state.totalConverted}
            </span>
          </div>
          <div className="flex items-center justify-between font-ui text-sm">
            <span className="text-text-secondary">Total kept</span>
            <span className="font-semibold tabular-nums text-text-primary">{state.totalKept}</span>
          </div>
          {state.totalErrors > 0 && (
            <div className="flex items-center justify-between font-ui text-sm">
              <span className="text-text-secondary">Errors</span>
              <span className="font-semibold tabular-nums text-accent-danger">
                {state.totalErrors}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {(state.phase === "idle" || state.phase === "error" || state.phase === "done") && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={migrationMutation.isPending}
            className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {state.phase === "done" ? "Preview again" : "Preview migration"}
          </button>
        )}
        {state.phase === "previewing" && (
          <span className="font-ui text-sm text-text-tertiary">Analyzing all inboxes…</span>
        )}
        {state.phase === "preview" && (
          <>
            <button
              type="button"
              onClick={() => setState({ phase: "idle" })}
              className="rounded-md border border-border-default px-3 py-1.5 font-ui text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={migrationMutation.isPending}
              className="rounded-md bg-accent-warning px-3 py-1.5 font-ui text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Run for all users
            </button>
          </>
        )}
        {state.phase === "running" && (
          <span className="font-ui text-sm text-text-tertiary">
            Running migration for all users…
          </span>
        )}
      </div>
    </div>
  );
}

export function SettingsClient({
  user,
  initialSection,
  autoOpenWizard,
  driveLinked,
  driveError,
  calLinked,
  calError,
}: SettingsClientProps) {
  const router = useRouter();
  const defaultSection = resolveSection(
    initialSection,
    autoOpenWizard ? "integrations" : "profile",
  );
  const [section, setSection] = useState<Section>(defaultSection);

  const navigate = useCallback(
    (id: Section) => {
      setSection(id);
      router.replace(`/settings?section=${id}`, { scroll: false });
    },
    [router],
  );

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
              ? "bg-accent-primary-subtle font-medium text-accent-primary"
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
      {section === "preferences" && <PreferencesSection initialUser={user} />}
      {section === "capture" && <CaptureSection userId={user.id} userEmail={user.email} />}
      {section === "tasks" && <TasksSection />}
      {section === "templates" && (
        <div className="flex flex-col gap-6">
          <TemplatesSettingsSection />
        </div>
      )}
      {section === "gtd" && <GtdSection />}
      {section === "integrations" && (
        <IntegrationsSection
          autoOpenWizard={autoOpenWizard}
          driveLinked={driveLinked}
          driveError={driveError}
          calLinked={calLinked}
          calError={calError}
        />
      )}
      {section === "ai" && <AISection userData={user} />}
      {section === "backups" && (
        <PlaceholderSection
          title="Backups"
          description="Manage automatic backups of your Atlas data to Google Drive."
        />
      )}
      {section === "storage" && <StorageSection />}
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
          <div className="border-border-dashed rounded-xl border border-dashed bg-surface-sunken px-6 py-8 text-center">
            <p className="font-ui text-sm text-text-tertiary">
              Export and import tools coming in a future wave.
            </p>
          </div>
        </div>
      )}
      {section === "account" && <AccountSection />}
      {section === "system" && (
        <div className="flex flex-col gap-6">
          <SectionHeader
            title="System"
            description="Monitor and manage background jobs that keep Atlas running smoothly."
          />
          <JobsManagement />
          {ADMIN_EMAILS.some((e) => e.toLowerCase() === user.email.trim().toLowerCase()) && (
            <AdminMigrationPanel />
          )}
        </div>
      )}
    </div>
  );

  return (
    <TwoPaneLayout list={nav} detail={content} listWidth={220} collapseListBelowTablet={false} />
  );
}
