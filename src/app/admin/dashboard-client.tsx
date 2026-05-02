"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Users, FileText, RefreshCcw, Activity, Briefcase, ArrowRight } from "lucide-react";

function MetricCard({
  label,
  value,
  sub,
  href,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-medium uppercase tracking-widest text-white/40">
          {label}
        </span>
        <div className={`rounded-md p-1.5 ${color}`}>
          <Icon size={14} className="text-white" />
        </div>
      </div>
      <div>
        <p className="font-mono text-3xl font-bold text-white">{value}</p>
        {sub && <p className="mt-1 font-mono text-xs text-white/40">{sub}</p>}
      </div>
      <div className="flex items-center gap-1 font-mono text-xs text-white/30 transition-colors group-hover:text-white/60">
        View detail <ArrowRight size={11} />
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="h-36 animate-pulse rounded-xl border border-white/10 bg-white/5" />
  );
}

export function AdminDashboardClient() {
  const { data, isLoading, isError, error } = trpc.admin.systemMetrics.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <h1 className="mb-1 font-mono text-lg font-semibold text-white">Dashboard</h1>
      <p className="mb-6 font-mono text-sm text-white/40">
        Live system overview — auto-refreshes every 30s.
      </p>

      {isError && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 font-mono text-sm text-red-400">
          Failed to load metrics: {error?.message ?? "Unknown error"}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : data ? (
          <>
            <MetricCard
              label="Users"
              value={data.users.total}
              sub={`${data.users.active} active · ${data.users.deleted} deleted`}
              href="/admin/users"
              icon={Users}
              color="bg-blue-600"
            />
            <MetricCard
              label="Content"
              value={data.content.tasks + data.content.projects + data.content.notes}
              sub={`${data.content.tasks} tasks · ${data.content.projects} projects · ${data.content.notes} notes`}
              href="/admin/users"
              icon={FileText}
              color="bg-violet-600"
            />
            <MetricCard
              label="Recoveries (30d)"
              value={data.recovery.last30Days}
              sub="Automatic orphan recovery events"
              href="/admin/recoveries"
              icon={RefreshCcw}
              color="bg-amber-600"
            />
            <MetricCard
              label="Auth Events (24h)"
              value={data.authEvents.last24Hours}
              sub="Sign-ins and resolutions"
              href="/admin/audit"
              icon={Activity}
              color="bg-emerald-600"
            />
            <MetricCard
              label="Scheduled Jobs"
              value={data.jobs.scheduled}
              sub="Active job schedules"
              href="/admin/jobs"
              icon={Briefcase}
              color="bg-sky-600"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
