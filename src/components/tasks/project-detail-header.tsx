"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, RefreshCw, Folder, Flame, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ProjectTypeSelector, type ProjectType, PROJECT_TYPE_LABELS, PROJECT_TYPE_ICONS } from "@/components/projects/project-type-selector";
import { ProjectStatusSelector, type ProjectStatus } from "@/components/projects/project-status-selector";
import { ProjectTargetDatePicker } from "@/components/projects/project-target-date-picker";

const PROJECT_COLOR_DOTS: Record<string, string> = {
  blue: "bg-cal-1-border",
  green: "bg-cal-2-border",
  amber: "bg-cal-3-border",
  red: "bg-cal-4-border",
  purple: "bg-cal-5-border",
  teal: "bg-cal-6-border",
  pink: "bg-cal-7-border",
  orange: "bg-cal-8-border",
};
const COLORS = Object.keys(PROJECT_COLOR_DOTS);

const INACTIVE_STATUSES = new Set(["completed", "dropped"]);

export function ProjectDetailHeader({ projectId }: { projectId: string }): React.ReactElement | null {
  const router = useRouter();
  const utils = trpc.useUtils();
  const project = trpc.projects.get.useQuery({ id: projectId });
  const update = trpc.projects.update.useMutation({
    onSettled: () => {
      utils.projects.get.invalidate({ id: projectId });
      utils.projects.list.invalidate();
    },
  });
  const del = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted; tasks moved to Inbox");
      router.push("/tasks/inbox");
    },
    onSettled: () => {
      utils.projects.list.invalidate();
      utils.tasks.list.invalidate();
    },
  });
  const markAll = trpc.projects.markAllComplete.useMutation({
    onSettled: () => {
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
    },
  });

  const foldersQuery = trpc.folders.list.useQuery();
  const moveToFolder = trpc.folders.moveProject.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id: projectId });
      utils.projects.list.invalidate();
      utils.folders.list.invalidate();
      toast.success("Project moved");
    },
    onError: () => toast.error("Failed to move project"),
  });

  const flatFolders = React.useMemo(() => {
    type FolderNode = { id: string; name: string; children?: FolderNode[] };
    function flatten(nodes: FolderNode[], depth = 0): { id: string; name: string; depth: number }[] {
      const out: { id: string; name: string; depth: number }[] = [];
      for (const n of nodes) {
        out.push({ id: n.id, name: n.name, depth });
        if (n.children?.length) out.push(...flatten(n.children, depth + 1));
      }
      return out;
    }
    return flatten((foldersQuery.data ?? []) as FolderNode[]);
  }, [foldersQuery.data]);

  const [titleDraft, setTitleDraft] = React.useState("");
  React.useEffect(() => {
    if (project.data) setTitleDraft(project.data.title);
  }, [project.data?.title, project.data]);

  if (!project.data) return null;
  const data = project.data;
  const currentFolder = flatFolders.find((f) => f.id === (data as typeof data & { folder_id?: string | null }).folder_id);
  const projectType = ((data as typeof data & { type?: string }).type ?? "project") as ProjectType;
  const projectStatus = data.status as ProjectStatus;
  const targetDate = (data as typeof data & { target_date?: string | null }).target_date;
  const isInactive = INACTIVE_STATUSES.has(projectStatus);
  const totalTasks = (data as typeof data & { total_tasks?: number }).total_tasks ?? 0;
  const completedTasks = (data as typeof data & { completed_tasks?: number }).completed_tasks ?? 0;
  const habitStreak = (data as typeof data & { habit_streak?: number }).habit_streak ?? 0;
  const goalPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  function commitTitle() {
    const next = titleDraft.trim();
    if (next && next !== data.title) {
      update.mutate({ id: data.id, title: next });
    } else {
      setTitleDraft(data.title);
    }
  }

  const reviewIntervalLabel =
    data.review_interval_days == null
      ? "Never"
      : data.review_interval_days === 3
        ? "Every 3 days"
        : data.review_interval_days === 7
          ? "Weekly"
          : data.review_interval_days === 14
            ? "Every 2 weeks"
            : data.review_interval_days === 30
              ? "Monthly"
              : `Every ${data.review_interval_days} days`;

  return (
    <div className={cn(
      "flex flex-col gap-1 border-b border-border-subtle px-3 py-2",
      isInactive && "opacity-60",
    )}>
      <div className="flex items-center gap-3">
        <span className={cn("size-3 shrink-0 rounded-full", PROJECT_COLOR_DOTS[data.color ?? ""] ?? "bg-text-disabled")} aria-hidden />
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-base font-semibold text-text-primary outline-none focus-visible:ring-1 focus-visible:ring-border-focus rounded-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary" aria-label="Project actions">
            <MoreHorizontal size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Type</DropdownMenuLabel>
            {(["project", "goal", "habit"] as ProjectType[]).map((t) => (
              <DropdownMenuItem
                key={t}
                onSelect={() => update.mutate({ id: data.id, type: t })}
                className={t === projectType ? "font-semibold text-accent-primary" : ""}
              >
                <span className="mr-2">{PROJECT_TYPE_ICONS[t]}</span>
                {PROJECT_TYPE_LABELS[t]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, status: "active" })}
              className={projectStatus === "active" ? "font-semibold text-accent-primary" : ""}
            >Set active</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, status: "on_hold" })}
              className={projectStatus === "on_hold" ? "font-semibold text-accent-primary" : ""}
            >Pause</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (confirm("Mark all tasks complete and complete the project?")) {
                  markAll.mutate({ id: data.id });
                  update.mutate({ id: data.id, status: "completed" });
                }
              }}
              className={projectStatus === "completed" ? "font-semibold text-accent-primary" : ""}
            >
              Mark complete
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, status: "dropped" })}
              className={projectStatus === "dropped" ? "font-semibold text-accent-primary" : ""}
            >Abandon</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Review interval</DropdownMenuLabel>
            {([null, 3, 7, 14, 30] as (number | null)[]).map((days) => {
              const label = days == null ? "Never" : days === 3 ? "Every 3 days" : days === 7 ? "Weekly" : days === 14 ? "Every 2 weeks" : "Monthly";
              const active = data.review_interval_days === days;
              return (
                <DropdownMenuItem
                  key={String(days)}
                  onSelect={() => update.mutate({ id: data.id, review_interval_days: days })}
                  className={active ? "font-semibold text-accent-primary" : ""}
                >
                  {active ? "✓ " : ""}{label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Display</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, sequential: !data.sequential })}>
              {data.sequential ? "Disable sequential mode" : "Enable sequential mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Color</DropdownMenuLabel>
            {COLORS.map((c) => (
              <DropdownMenuItem key={c} onSelect={() => update.mutate({ id: data.id, color: c })}>
                <span className={cn("mr-2 size-2 rounded-full", PROJECT_COLOR_DOTS[c])} />
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Folder</DropdownMenuLabel>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Folder size={12} className="mr-1.5 shrink-0" />
                Move to folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onSelect={() => moveToFolder.mutate({ project_id: data.id, folder_id: null })}
                  className={(data as typeof data & { folder_id?: string | null }).folder_id == null ? "font-semibold text-accent-primary" : ""}
                >
                  <Folder size={12} className="mr-1.5 shrink-0 text-text-disabled" />
                  <span className="italic">No folder (root)</span>
                </DropdownMenuItem>
                {flatFolders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onSelect={() => moveToFolder.mutate({ project_id: data.id, folder_id: f.id })}
                    style={{ paddingLeft: `${12 + f.depth * 12}px` }}
                    className={(data as typeof data & { folder_id?: string | null }).folder_id === f.id ? "font-semibold text-accent-primary" : ""}
                  >
                    <Folder size={12} className="mr-1.5 shrink-0 text-text-tertiary" />
                    {f.name}
                  </DropdownMenuItem>
                ))}
                {flatFolders.length === 0 && (
                  <DropdownMenuItem disabled>No folders created yet</DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                if (confirm("Delete project? Its tasks will move to Inbox.")) {
                  del.mutate({ id: data.id });
                }
              }}
            >
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-5">
        <ProjectTypeSelector
          value={projectType}
          onChange={(t) => update.mutate({ id: data.id, type: t })}
          disabled={update.isPending}
        />
        <span className="text-text-disabled font-ui text-2xs">·</span>
        <ProjectStatusSelector
          value={projectStatus}
          onChange={(s) => update.mutate({ id: data.id, status: s })}
          disabled={update.isPending}
        />
        <span className="text-text-disabled font-ui text-2xs">·</span>
        <ProjectTargetDatePicker
          value={targetDate}
          onChange={(d) => update.mutate({ id: data.id, target_date: d })}
          disabled={update.isPending}
        />
        <span className="text-text-disabled font-ui text-2xs ml-1">·</span>
        <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-tertiary px-1.5 py-0.5">
          <RefreshCw size={9} />
          {reviewIntervalLabel}
        </span>
        {data.sequential && (
          <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-tertiary px-1.5 py-0.5">
            Sequential
          </span>
        )}
        <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-tertiary px-1.5 py-0.5">
          <Folder size={9} />
          {currentFolder ? currentFolder.name : <span className="italic">No folder</span>}
        </span>
      </div>

      {projectType === "goal" && (
        <div className="flex items-center gap-2 pl-5 pb-0.5">
          <div className="h-1.5 w-28 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-primary transition-all"
              style={{ width: totalTasks > 0 ? `${goalPercent}%` : "0%" }}
            />
          </div>
          <span className="font-ui text-2xs text-text-secondary">
            {totalTasks > 0
              ? `${completedTasks} / ${totalTasks} tasks done — ${goalPercent}%`
              : "No tasks yet — 0%"}
          </span>
        </div>
      )}

      {projectType === "habit" && (
        <div className="flex items-center gap-3 pl-5 pb-0.5">
          {habitStreak > 0 ? (
            <span className="inline-flex items-center gap-1 font-ui text-2xs text-accent-warning font-medium">
              <Flame size={10} />
              {habitStreak}-day streak
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-tertiary">
              <Flame size={10} />
              No streak yet
            </span>
          )}
          {completedTasks > 0 && (
            <>
              <span className="text-text-disabled font-ui text-2xs">·</span>
              <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-secondary">
                <CheckCircle2 size={10} />
                {completedTasks} {completedTasks === 1 ? "completion" : "completions"}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
