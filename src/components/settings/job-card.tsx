"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface JobInfo {
  name: string;
  description: string;
  cron: string;
  status: "active" | "paused";
  lastRun: {
    completedAt: Date | string;
    outcome: "completed" | "failed";
    result: string | null;
    breakdown: Record<string, number> | null;
  } | null;
  nextRun: Date | string | null;
}

function formatCronHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const minute = parts[0] ?? "*";
  const hour = parts[1] ?? "*";
  const dom = parts[2] ?? "*";
  const dow = parts[4] ?? "*";

  if (minute === "*" && hour === "*" && dom === "*" && dow === "*") {
    return "Every minute";
  }
  if (minute !== "*" && hour === "*" && dom === "*" && dow === "*") {
    return `Every hour at :${minute.padStart(2, "0")}`;
  }
  if (minute === "0" && hour === "*" && dom === "*" && dow === "*") {
    return "Every hour";
  }
  if (minute !== "*" && hour !== "*" && dom === "*" && dow === "*") {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const period = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const displayMin = m > 0 ? `:${String(m).padStart(2, "0")}` : "";
    return `Daily at ${displayHour}${displayMin} ${period} UTC`;
  }
  return cron;
}

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

function formatAbsoluteTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatJobName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function JobCard({ job, onMutated }: { job: JobInfo; onMutated: () => void }) {
  const [runQueued, setRunQueued] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const runNow = trpc.jobs.runNow.useMutation({
    onSuccess: () => {
      setRunQueued(true);
      setTimeout(() => {
        setRunQueued(false);
        onMutated();
      }, 3000);
    },
  });

  const pause = trpc.jobs.pause.useMutation({
    onSuccess: () => onMutated(),
  });

  const resume = trpc.jobs.resume.useMutation({
    onSuccess: () => onMutated(),
  });

  const isActive = job.status === "active";
  const isBusy = runNow.isPending || pause.isPending || resume.isPending;

  const hasBreakdown =
    job.lastRun?.outcome === "completed" &&
    job.lastRun.breakdown != null &&
    Object.keys(job.lastRun.breakdown).length > 0;

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-1">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-ui text-sm font-semibold text-text-primary">
              {formatJobName(job.name)}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-ui text-2xs font-medium",
                isActive
                  ? "bg-accent-success-muted text-accent-success"
                  : "bg-surface-overlay text-text-tertiary",
              )}
            >
              {isActive ? "Active" : "Paused"}
            </span>
          </div>
          <p className="mt-0.5 font-ui text-xs text-text-secondary">{job.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {runQueued ? (
            <span className="rounded-md bg-accent-success-muted px-3 py-1.5 font-ui text-xs font-medium text-accent-success">
              Queued
            </span>
          ) : (
            <button
              onClick={() => runNow.mutate({ job_name: job.name })}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary disabled:opacity-50"
              title="Run now"
            >
              <Play size={12} />
              Run now
            </button>
          )}

          {isActive ? (
            <button
              onClick={() => pause.mutate({ job_name: job.name })}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary transition-colors hover:border-accent-warning hover:text-accent-warning disabled:opacity-50"
              title="Pause job"
            >
              <Pause size={12} />
              Pause
            </button>
          ) : (
            <button
              onClick={() => resume.mutate({ job_name: job.name })}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 font-ui text-xs font-medium text-text-secondary transition-colors hover:border-accent-success hover:text-accent-success disabled:opacity-50"
              title="Resume job"
            >
              <RotateCcw size={12} />
              Resume
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-text-quaternary shrink-0" />
          <span className="font-ui text-xs text-text-secondary">{formatCronHuman(job.cron)}</span>
        </div>

        {job.lastRun ? (
          <div className="flex items-center gap-1.5">
            {job.lastRun.outcome === "completed" ? (
              <CheckCircle size={12} className="shrink-0 text-accent-success" />
            ) : (
              <XCircle size={12} className="shrink-0 text-accent-danger" />
            )}
            <span
              className={cn(
                "font-ui text-xs",
                job.lastRun.outcome === "failed" ? "text-accent-danger" : "text-text-secondary",
              )}
              title={formatAbsoluteTime(job.lastRun.completedAt)}
            >
              Last run {formatRelativeTime(job.lastRun.completedAt)} (
              {formatAbsoluteTime(job.lastRun.completedAt)})
              {job.lastRun.result ? ` — ${job.lastRun.result}` : ""}
            </span>
            {hasBreakdown && (
              <button
                onClick={() => setBreakdownOpen((o) => !o)}
                className="ml-0.5 flex items-center gap-0.5 rounded font-ui text-2xs text-text-tertiary transition-colors hover:text-text-secondary"
                title={breakdownOpen ? "Hide breakdown" : "Show breakdown"}
              >
                <ChevronDown
                  size={12}
                  className={cn("transition-transform", breakdownOpen && "rotate-180")}
                />
                {breakdownOpen ? "Hide" : "Details"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-text-quaternary shrink-0" />
            <span className="font-ui text-xs text-text-tertiary">Never run</span>
          </div>
        )}

        {job.nextRun && (
          <div className="flex items-center gap-1.5">
            <Calendar size={12} className="text-text-quaternary shrink-0" />
            <span className="font-ui text-xs text-text-secondary">
              Next run {formatAbsoluteTime(job.nextRun)}
            </span>
          </div>
        )}
      </div>

      {hasBreakdown && breakdownOpen && job.lastRun?.breakdown && (
        <div className="mt-3 rounded-lg border border-border-default bg-surface-overlay px-3 py-2.5">
          <p className="text-text-quaternary mb-2 font-ui text-2xs font-medium uppercase tracking-wide">
            Breakdown
          </p>
          <div className="sm:grid-cols-3 grid grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(job.lastRun.breakdown).map(([label, count]) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="font-ui text-xs text-text-secondary">{label}</span>
                <span className="font-ui text-xs font-medium tabular-nums text-text-primary">
                  {count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {job.lastRun?.outcome === "failed" && job.lastRun.result && (
        <div className="border-accent-danger/30 mt-3 rounded-md border bg-accent-danger-muted px-3 py-2">
          <p className="font-ui text-xs text-accent-danger">Error: {job.lastRun.result}</p>
        </div>
      )}

      {(runNow.isError || pause.isError || resume.isError) && (
        <div className="border-accent-danger/30 mt-3 rounded-md border bg-accent-danger-muted px-3 py-2">
          <p className="font-ui text-xs text-accent-danger">
            {(runNow.error ?? pause.error ?? resume.error)?.message ?? "Action failed"}
          </p>
        </div>
      )}
    </div>
  );
}
