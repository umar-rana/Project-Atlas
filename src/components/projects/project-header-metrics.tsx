"use client";

import * as React from "react";
import { Calendar, Clock } from "lucide-react";
import { timeDistance, timeDistancePast } from "@/core/projects/time-distance";
import { useLocale } from "@/core/locale/hooks";
import { formatDate, formatInt } from "@/core/locale/formatters";

interface TaskCounts {
  total: number;
  active: number;
  completed: number;
}

interface Metrics {
  task_counts: TaskCounts;
  days_to_target?: number;
  last_activity_at?: Date | string | null;
}

export function ProjectHeaderMetrics({
  metrics,
  targetDate,
}: {
  metrics: Metrics;
  targetDate?: Date | string | null;
}) {
  const locale = useLocale();
  const { task_counts, last_activity_at } = metrics;
  const now = new Date();

  const targetDateObj = targetDate
    ? typeof targetDate === "string"
      ? new Date(targetDate)
      : targetDate
    : null;

  const lastActivityDate = last_activity_at
    ? typeof last_activity_at === "string"
      ? new Date(last_activity_at)
      : last_activity_at
    : null;

  const lastActivityLabel = lastActivityDate
    ? timeDistancePast(lastActivityDate, now)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5 pb-0.5">
      <span className="font-ui text-2xs text-text-secondary">
        {task_counts.total === 0 ? (
          <span className="text-text-tertiary italic">No tasks yet</span>
        ) : (
          <>
            <span className="font-medium">{formatInt(task_counts.total, locale)}</span>
            <span className="text-text-tertiary"> tasks total</span>
            <span className="text-text-disabled"> · </span>
            <span className="font-medium">{formatInt(task_counts.active, locale)}</span>
            <span className="text-text-tertiary"> active</span>
            <span className="text-text-disabled"> · </span>
            <span className="font-medium">{formatInt(task_counts.completed, locale)}</span>
            <span className="text-text-tertiary"> completed</span>
          </>
        )}
      </span>

      {targetDateObj && (
        <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-tertiary">
          <Calendar size={9} />
          <span>
            Target: {formatDate(targetDateObj, locale)}{" "}
            <span className="text-text-disabled">({timeDistance(targetDateObj, now)})</span>
          </span>
        </span>
      )}

      {lastActivityLabel && (
        <span className="inline-flex items-center gap-1 font-ui text-2xs text-text-tertiary">
          <Clock size={9} />
          <span>Last activity: {lastActivityLabel}</span>
        </span>
      )}
    </div>
  );
}
