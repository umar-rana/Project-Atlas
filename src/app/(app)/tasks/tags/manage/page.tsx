"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { TagManagement } from "@/components/tasks/tag-management";

export default function TagManagePage() {
  return (
    <TasksShell>
      <TagManagement />
    </TasksShell>
  );
}
