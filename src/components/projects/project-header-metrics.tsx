"use client";

import * as React from "react";
import { Calendar, Clock } from "lucide-react";
import { timeDistance, timeDistancePast } from "@/core/projects/time-distance";
import { useLocale } from "@/core/locale/hooks";
import { formatDate, formatInt, formatNumber, formatCurrency } from "@/core/locale/formatters";

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

interface TrackerData {
  table_id: string;
  column_id: string;
  table_name: string | null;
  column_name: string | null;
  column_type?: string | null;
  aggregation: string;
  current_value: number | null;
  target_value: number | null;
  target_label: string | null;
  percentage: number | null;
  status: "ok" | "unavailable";
}

function formatTrackerValue(
  value: number,
  aggregation: string,
  columnType: string | null | undefined,
  locale: ReturnType<typeof useLocale>,
): string {
  if (aggregation === "checked_ratio") {
    return `${formatNumber(value * 100, locale)}%`;
  }
  if ((aggregation === "min" || aggregation === "max") && columnType === "date") {
    return formatDate(new Date(value), locale);
  }
  if (columnType === "currency") {
    return formatCurrency(value, locale);
  }
  return formatNumber(value, locale);
}

export function ProjectHeaderMetrics({
  metrics,
  targetDate,
  tracker,
  onReconfigure,
}: {
  metrics: Metrics;
  targetDate?: Date | string | null;
  tracker?: TrackerData | null;
  onReconfigure?: () => void;
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

  const lastActivityLabel = lastActivityDate ? timeDistancePast(lastActivityDate, now) : null;

  return (
    <div className="flex flex-col gap-0.5 pb-0.5 pl-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="font-ui text-2xs text-text-secondary">
          {task_counts.total === 0 ? (
            <span className="italic text-text-tertiary">No tasks yet</span>
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

      {tracker && (
        <div className="font-ui text-2xs text-text-secondary">
          {tracker.status === "unavailable" ? (
            <span>
              <span className="text-text-tertiary">
                Tracker unavailable — source has been removed
              </span>
              {onReconfigure && (
                <>
                  {" "}
                  <button
                    onClick={onReconfigure}
                    className="text-text-link underline hover:text-text-link-hover focus:outline-none"
                  >
                    Reconfigure
                  </button>
                </>
              )}
            </span>
          ) : tracker.current_value !== null ? (
            <span>
              {tracker.column_name && (
                <span className="text-text-tertiary">{tracker.column_name}: </span>
              )}
              <span className="font-medium">
                {formatTrackerValue(
                  tracker.current_value,
                  tracker.aggregation,
                  tracker.column_type,
                  locale,
                )}
                {tracker.target_label && tracker.aggregation !== "checked_ratio" && (
                  <span className="ml-0.5 font-normal text-text-tertiary">
                    {tracker.target_label}
                  </span>
                )}
              </span>
              {tracker.target_value != null && (
                <>
                  <span className="text-text-disabled"> / </span>
                  <span className="text-text-tertiary">
                    {formatTrackerValue(
                      tracker.target_value,
                      tracker.aggregation,
                      tracker.column_type,
                      locale,
                    )}
                    {tracker.target_label && tracker.aggregation !== "checked_ratio" && (
                      <span className="ml-0.5">{tracker.target_label}</span>
                    )}
                  </span>
                  {tracker.percentage != null && (
                    <span className="text-text-disabled">
                      {" "}
                      ({formatInt(Math.round(tracker.percentage), locale)}%)
                    </span>
                  )}
                </>
              )}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
