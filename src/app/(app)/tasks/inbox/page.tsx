"use client";

import { useSearchParams } from "next/navigation";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { TaskList } from "@/components/tasks/task-list";
import { ProcessInboxButton } from "@/components/tasks/process-inbox-button";

export default function InboxPage() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");

  return (
    <TasksShell>
      <TaskList
        perspective="inbox"
        title="Inbox"
        description="Unfiled tasks awaiting triage."
        emptyTitle="Inbox zero"
        emptyBody="Capture a task with ⌘⇧I or use the quick-add bar above."
        highlightId={taskId}
        headerExtra={<ProcessInboxButton />}
      />
    </TasksShell>
  );
}
