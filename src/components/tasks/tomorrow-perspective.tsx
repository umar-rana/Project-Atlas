"use client";

import * as React from "react";
import { TaskList } from "./task-list";

function getTomorrowDate(): { iso: string; label: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  const label = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return { iso: d.toISOString(), label };
}

export function TomorrowPerspective(): React.ReactElement {
  const { iso, label } = getTomorrowDate();

  return (
    <TaskList
      perspective="tomorrow"
      title={`Tomorrow · ${label}`}
      description="Due tomorrow or deferred to tomorrow."
      emptyTitle="Nothing scheduled for tomorrow"
      emptyBody="Enjoy the clear horizon — or plan ahead using the quick-add bar."
      defaultDueDate={iso}
    />
  );
}
