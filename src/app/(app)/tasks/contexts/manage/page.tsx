"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { ContextManagement } from "@/components/tasks/context-management";

export default function ContextManagePage() {
  return (
    <TasksShell>
      <ContextManagement />
    </TasksShell>
  );
}
