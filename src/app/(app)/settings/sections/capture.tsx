"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import type { User } from "@prisma/client";
import { Copy, Check, ExternalLink, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { SectionHeader } from "./_shared";

const MigrationSummaryModal = dynamic(
  () =>
    import("@/components/tasks/migration-summary-modal").then((m) => m.MigrationSummaryModal),
  { ssr: false },
);

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
  const wildcardDomainRegex = /^\*\.([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
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

export function CaptureSection({ userId, userEmail }: { userId: string; userEmail: string }) {
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
