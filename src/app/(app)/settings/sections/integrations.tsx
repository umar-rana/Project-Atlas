"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

const DriveWizard = dynamic(() => import("../drive-wizard").then((m) => m.DriveWizard), {
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

const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  provider: "Google declined to authorize access. Please try again.",
  state_missing: "Your authorization session expired or the cookie was missing. Please try again.",
  state_mismatch: "Security check failed — the OAuth state did not match. Please try again.",
  exchange: "Failed to exchange the authorization code with Google. Please try again.",
  config: "Drive was authorized but the configuration could not be saved. Please try again.",
  no_code: "No authorization code was received from Google. Please try again.",
};

export function IntegrationsSection({
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
