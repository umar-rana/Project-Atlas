"use client";

import { TasksShell } from "@/components/tasks/tasks-shell";
import { SomedayPerspective } from "@/components/tasks/someday-perspective";

export default function SomedayPage() {
  return (
    <TasksShell>
      <SomedayPerspective />
    </TasksShell>
  );
}
