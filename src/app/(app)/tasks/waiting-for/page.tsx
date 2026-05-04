"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { WaitingForPerspective } from "@/components/tasks/waiting-for-perspective";

export default function WaitingForPage() {
  return (
    <TasksShell>
      <WaitingForPerspective />
    </TasksShell>
  );
}
