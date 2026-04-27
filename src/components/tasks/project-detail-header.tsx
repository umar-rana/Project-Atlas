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
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
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

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2">
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
      <span className="font-mono text-2xs text-text-tertiary tabular-nums">{data.task_count} active</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-sm p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary" aria-label="Project actions">
          <MoreHorizontal size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
          {COLORS.map((c) => (
            <DropdownMenuItem key={c} onSelect={() => update.mutate({ id: data.id, color: c })}>
              <span className={cn("mr-2 size-2 rounded-full", PROJECT_COLOR_DOTS[c])} />
              Color: {c}
            </DropdownMenuItem>
          ))}
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
  );
}
