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
        description="Captures and unclassified tasks awaiting decisions."
        emptyTitle="Inbox zero"
        emptyBody="All items have been processed and classified. Capture something quick with the + button, or use ⌘⇧I."
        highlightId={taskId}
        headerExtra={<ProcessInboxButton />}
      />
    </TasksShell>
  );
}
