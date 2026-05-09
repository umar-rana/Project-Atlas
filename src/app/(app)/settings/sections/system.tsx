"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import { X } from "lucide-react";
import { ADMIN_EMAILS } from "@/lib/admin-gate";
import { SectionHeader } from "./_shared";

const JobsManagement = dynamic(
  () => import("@/components/settings/jobs-management").then((m) => m.JobsManagement),
  { ssr: false },
);

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

export function SystemSection({ userEmail }: { userEmail: string }) {
  const isAdmin = ADMIN_EMAILS.some((e) => e.toLowerCase() === userEmail.trim().toLowerCase());
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="System"
        description="Monitor and manage background jobs that keep Atlas running smoothly."
      />
      <JobsManagement />
      {isAdmin && <AdminMigrationPanel />}
    </div>
  );
}
