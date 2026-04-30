"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { TomorrowPerspective } from "@/components/tasks/tomorrow-perspective";

export default function TomorrowPage() {
  return (
    <TasksShell>
      <TomorrowPerspective />
    </TasksShell>
  );
}
