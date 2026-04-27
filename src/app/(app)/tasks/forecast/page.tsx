"use client";

import * as React from "react";
import { TasksShell } from "@/components/tasks/tasks-shell";
import { ForecastView } from "@/components/tasks/forecast-view";

export default function ForecastPage() {
  return (
    <TasksShell>
      <ForecastView />
    </TasksShell>
  );
}
