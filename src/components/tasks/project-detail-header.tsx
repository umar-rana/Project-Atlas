"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { StatusPill } from "@/components/ui/status-pill";
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
import { MoreHorizontal, RefreshCw, Folder } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

const STATUS_TO_PILL: Record<
  string,
  React.ComponentProps<typeof StatusPill>["status"]
> = {
  active: "active",
  on_hold: "on-hold",
  completed: "complete",
  dropped: "cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  dropped: "Dropped",
};

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
  const moveToFolder = trpc.projects.update.useMutation({
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
    <div className="flex flex-col gap-1 border-b border-border-subtle px-3 py-2">
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
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-base font-semibold text-text-primary outline-none"
        />
        <StatusPill status={STATUS_TO_PILL[data.status] ?? "active"} label={STATUS_LABEL[data.status] ?? data.status} />
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary" aria-label="Project actions">
            <MoreHorizontal size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, status: "active" })}>Set active</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, status: "on_hold" })}>Put on hold</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (confirm("Mark all tasks complete and complete the project?")) {
                  markAll.mutate({ id: data.id });
                  update.mutate({ id: data.id, status: "completed" });
                }
              }}
            >
              Mark complete
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update.mutate({ id: data.id, status: "dropped" })}>Drop</DropdownMenuItem>
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
                  onSelect={() => moveToFolder.mutate({ id: data.id, folder_id: null })}
                  className={(data as typeof data & { folder_id?: string | null }).folder_id == null ? "font-semibold text-accent-primary" : ""}
                >
                  <Folder size={12} className="mr-1.5 shrink-0 text-text-disabled" />
                  <span className="italic">No folder (root)</span>
                </DropdownMenuItem>
                {flatFolders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onSelect={() => moveToFolder.mutate({ id: data.id, folder_id: f.id })}
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
      <div className="flex items-center gap-3 pl-5 font-ui text-2xs text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <RefreshCw size={9} />
          Review: {reviewIntervalLabel}
        </span>
        {data.sequential && (
          <span className="inline-flex items-center gap-1">
            Sequential
          </span>
        )}
      </div>
    </div>
  );
}
