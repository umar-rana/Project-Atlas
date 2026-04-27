"use client";

import * as React from "react";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { CompletedView } from "@/components/tasks/completed-view";

export default function CompletedPage() {
  return (
    <TasksShell>
      <CompletedView />
    </TasksShell>
  );
}
