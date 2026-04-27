"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";

export default function InboxPage() {
  return (
    <TasksShell>
      <TaskList
        perspective="inbox"
        title="Inbox"
        description="Unfiled tasks awaiting triage."
        emptyTitle="Inbox zero"
        emptyBody="Capture a task with ⌘⇧I or use the quick-add bar above."
      />
    </TasksShell>
  );
}
