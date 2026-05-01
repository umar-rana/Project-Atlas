"use client";

import * as React from "react";
import { TaskList } from "./task-list";
import { useLocale } from "@/core/locale/hooks";
import { formatDate, formatWeekdayFull } from "@/core/locale/formatters";

function getTomorrowDate(): { iso: string; d: Date } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return { iso: d.toISOString(), d };
}

export function TomorrowPerspective(): React.ReactElement {
  const locale = useLocale();
  const { iso, d } = getTomorrowDate();
  const weekday = formatWeekdayFull(d, locale.language);
  const datePart = formatDate(d, locale);
  const label = `${weekday}, ${datePart}`;

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
