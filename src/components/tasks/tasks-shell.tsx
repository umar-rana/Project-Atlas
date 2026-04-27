"use client";

import * as React from "react";
import { TasksSidebar } from "./tasks-sidebar";
import { TaskInspector } from "./task-inspector";
import { useTasksStore } from "@/lib/tasks/store";
import { cn } from "@/lib/utils";

interface TasksShellProps {
  children: React.ReactNode;
  /** When true, renders inspector in trash mode (restore / delete forever). */
  trash?: boolean;
}

export function TasksShell({ children, trash }: TasksShellProps): React.ReactElement {
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const cols = selectedTaskId
    ? "grid-cols-[232px_minmax(0,1fr)_360px]"
    : "grid-cols-[232px_minmax(0,1fr)]";

  return (
    <div className={cn("grid h-full min-h-0 w-full overflow-hidden", cols)}>
      <aside
        aria-label="Tasks navigation"
        className="min-h-0 overflow-y-auto border-r border-border-subtle bg-surface-sunken max-mobile:hidden"
      >
        <TasksSidebar />
      </aside>
      <div className="min-h-0 overflow-hidden">{children}</div>
      {selectedTaskId ? (
        <aside
          aria-label="Task inspector"
          className="min-h-0 overflow-hidden border-l border-border-subtle bg-surface-overlay max-tablet:hidden"
        >
          <TaskInspector taskId={selectedTaskId} inTrash={trash} />
        </aside>
      ) : null}
    </div>
  );
}
