"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";

export default function FlaggedPage() {
  return (
    <TasksShell>
      <TaskList
        perspective="flagged"
        title="Flagged"
        description="Anything you've flagged for special attention."
        emptyTitle="No flagged tasks"
        emptyBody="Press F on any task to flag it."
      />
    </TasksShell>
  );
}
