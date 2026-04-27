"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";

export default function TodayPage() {
  return (
    <TasksShell>
      <TaskList
        perspective="today"
        title="Today"
        description="Due today, deferred to today, or flagged."
        emptyTitle="Nothing due today"
        emptyBody="Looking good. Capture something or jump to your inbox."
      />
    </TasksShell>
  );
}
