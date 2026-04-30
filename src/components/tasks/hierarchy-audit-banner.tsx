"use client";

import * as React from "react";
import { AlertTriangle, X, ChevronDown, ChevronUp, FolderOpen, Inbox } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "atlas_hierarchy_audit_dismissed_v1";

export function HierarchyAuditBanner(): React.ReactElement | null {
  const utils = trpc.useUtils();
  const audit = trpc.tasks.auditHierarchy.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const fixMutation = trpc.tasks.fixHierarchyIssues.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Fixed ${result.fixed} task${result.fixed === 1 ? "" : "s"} successfully.`,
      );
      utils.tasks.auditHierarchy.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.counts.invalidate();
      utils.projects.list.invalidate();
    },
    onError: () => toast.error("Could not fix data issues. Try again."),
  });

  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = React.useState(false);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
    }
  }

  function handleCreateDefaultProjects() {
    fixMutation.mutate({
      createDefaultProjects: true,
      fixSubtasksWithoutParent: true,
    });
  }

  function handleMoveToInbox() {
    fixMutation.mutate({
      moveToInbox: true,
      fixSubtasksWithoutParent: true,
    });
  }

  if (dismissed) return null;
  if (!audit.data || audit.data.totalIssues === 0) return null;

  const { totalIssues, orphanedTasks, orphanedByFolder, subtasksWithoutParent } = audit.data;
  const hasOrphans = orphanedTasks.length > 0;
  const hasLostSubtasks = subtasksWithoutParent.length > 0;
  const folderCount = orphanedByFolder.length;

  return (
    <div className="mx-2 my-1 rounded-md border border-accent-warning/40 bg-accent-warning-muted">
      <div className="flex items-start gap-2 px-3 py-2">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-accent-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-semibold text-text-primary">
            {totalIssues} task{totalIssues === 1 ? "" : "s"} with hierarchy issues found
          </p>
          <p className="mt-0.5 font-ui text-2xs text-text-secondary">
            {hasOrphans
              ? `${orphanedTasks.length} task${orphanedTasks.length === 1 ? "" : "s"} linked to deleted projects`
              : null}
            {hasOrphans && hasLostSubtasks ? " · " : null}
            {hasLostSubtasks
              ? `${subtasksWithoutParent.length} subtask${subtasksWithoutParent.length === 1 ? "" : "s"} without a parent`
              : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse details" : "Expand details"}
            className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-accent-warning/20 px-3 pb-3 pt-2">
          {hasOrphans && (
            <div className="mb-2">
              <p className="mb-1 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                Tasks linked to deleted projects ({orphanedTasks.length})
              </p>
              {orphanedByFolder.map((group) => (
                <div key={group.folderId ?? "__root__"} className="mb-1">
                  {group.folderName ? (
                    <div className="flex items-center gap-1 font-ui text-2xs text-text-tertiary">
                      <FolderOpen size={9} />
                      <span>{group.folderName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 font-ui text-2xs text-text-tertiary">
                      <Inbox size={9} />
                      <span>No folder</span>
                    </div>
                  )}
                  <ul className="ml-3 flex flex-col gap-0.5">
                    {group.taskTitles.slice(0, 3).map((title, i) => (
                      <li key={i} className="truncate font-ui text-2xs text-text-secondary">
                        • {title}
                      </li>
                    ))}
                    {group.taskTitles.length > 3 && (
                      <li className="font-ui text-2xs text-text-disabled">
                        and {group.taskTitles.length - 3} more…
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {hasLostSubtasks && (
            <div className="mb-2">
              <p className="mb-1 font-ui text-2xs font-semibold uppercase tracking-caps text-text-tertiary">
                Subtasks without a parent ({subtasksWithoutParent.length})
              </p>
              <ul className="flex flex-col gap-0.5">
                {subtasksWithoutParent.slice(0, 4).map((t) => (
                  <li key={t.id} className="truncate font-ui text-2xs text-text-secondary">
                    • {t.title}
                  </li>
                ))}
                {subtasksWithoutParent.length > 4 && (
                  <li className="font-ui text-2xs text-text-disabled">
                    and {subtasksWithoutParent.length - 4} more…
                  </li>
                )}
              </ul>
            </div>
          )}

          <p className="mb-2 font-ui text-2xs text-text-secondary">
            How would you like to fix{" "}
            {totalIssues === 1 ? "this" : "these"}{" "}
            {totalIssues === 1 ? "task" : "tasks"}?
          </p>
          <div className="flex flex-col gap-1.5">
            {hasOrphans && folderCount > 0 && (
              <button
                type="button"
                onClick={handleCreateDefaultProjects}
                disabled={fixMutation.isPending}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm border border-accent-warning/40 bg-surface-base px-2.5 py-1.5 text-left font-ui text-2xs text-text-primary hover:bg-surface-hover disabled:opacity-50",
                )}
              >
                <FolderOpen size={11} className="shrink-0 text-accent-warning" />
                <span>
                  <strong>Create default project per folder</strong>
                  <span className="ml-1 text-text-tertiary">
                    ({folderCount === 1 ? "1 recovery project" : `${folderCount} recovery projects`})
                  </span>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleMoveToInbox}
              disabled={fixMutation.isPending}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border border-border-default bg-surface-base px-2.5 py-1.5 text-left font-ui text-2xs text-text-secondary hover:bg-surface-hover disabled:opacity-50",
              )}
            >
              <Inbox size={11} className="shrink-0 text-text-tertiary" />
              <span>
                <strong>Move all to inbox</strong>
                <span className="ml-1 text-text-disabled">(unassign from projects)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-left font-ui text-2xs text-text-disabled hover:text-text-tertiary"
            >
              Ignore for now
            </button>
          </div>
          {fixMutation.isPending && (
            <p className="mt-2 font-ui text-2xs text-text-tertiary">Fixing…</p>
          )}
        </div>
      )}
    </div>
  );
}
