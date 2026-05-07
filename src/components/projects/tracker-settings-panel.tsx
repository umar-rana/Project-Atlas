"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const AGGREGATION_OPTIONS = [
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "count", label: "Count" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "checked_ratio", label: "Checked ratio" },
] as const;

type AggregationValue = (typeof AGGREGATION_OPTIONS)[number]["value"];

function getCompatibleAggregations(
  columnType: string,
  columnConfig?: Record<string, unknown>,
): AggregationValue[] {
  switch (columnType) {
    case "number":
    case "currency":
      return ["sum", "average", "count", "min", "max"];
    case "date":
      return ["count", "min", "max"];
    case "checkbox":
      return ["count", "checked_ratio"];
    case "formula": {
      const returnType = (columnConfig as { return_type?: string } | undefined)?.return_type;
      return returnType === "number" ? ["sum", "average", "count", "min", "max"] : ["count"];
    }
    default:
      return ["count"];
  }
}

function isTrackerCompatibleColumn(columnType: string): boolean {
  return ["number", "currency", "date", "checkbox", "formula"].includes(columnType);
}

interface TrackerSettingsPanelProps {
  projectId: string;
  currentTracker: {
    table_id: string | null;
    column_id: string | null;
    aggregation: string | null;
    target_value: number | null;
    target_label: string | null;
  } | null;
  onSaved?: () => void;
}

export function TrackerSettingsPanel({
  projectId,
  currentTracker,
  onSaved,
}: TrackerSettingsPanelProps) {
  const utils = trpc.useUtils();

  const [tableId, setTableId] = React.useState(currentTracker?.table_id ?? "");
  const [columnId, setColumnId] = React.useState(currentTracker?.column_id ?? "");
  const [aggregation, setAggregation] = React.useState<AggregationValue | "">(
    (currentTracker?.aggregation as AggregationValue | null) ?? "",
  );
  const [targetValue, setTargetValue] = React.useState(
    currentTracker?.target_value != null ? String(currentTracker.target_value) : "",
  );
  const [targetLabel, setTargetLabel] = React.useState(currentTracker?.target_label ?? "");

  const tablesQuery = trpc.tables.list.useQuery({});
  const columnsQuery = trpc.tables.listColumns.useQuery(
    { table_id: tableId },
    { enabled: !!tableId },
  );

  const setTracker = trpc.projects.setTracker.useMutation({
    onSuccess: () => {
      toast.success("Tracker saved");
      utils.projects.get.invalidate({ id: projectId });
      onSaved?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const clearTracker = trpc.projects.clearTracker.useMutation({
    onSuccess: () => {
      toast.success("Tracker cleared");
      setTableId("");
      setColumnId("");
      setAggregation("");
      setTargetValue("");
      setTargetLabel("");
      utils.projects.get.invalidate({ id: projectId });
      onSaved?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedColumn = columnsQuery.data?.find((c) => c.id === columnId);
  const availableAggregations = selectedColumn
    ? AGGREGATION_OPTIONS.filter((a) =>
        getCompatibleAggregations(
          selectedColumn.type,
          selectedColumn.config as Record<string, unknown>,
        ).includes(a.value),
      )
    : AGGREGATION_OPTIONS;

  const compatibleColumns = React.useMemo(() => {
    const cols = columnsQuery.data ?? [];
    return cols.filter((c) => {
      if (!isTrackerCompatibleColumn(c.type)) return false;
      if (aggregation) {
        const validAggs = getCompatibleAggregations(c.type, c.config as Record<string, unknown>);
        if (!validAggs.includes(aggregation)) return false;
      }
      return true;
    });
  }, [columnsQuery.data, aggregation]);

  function handleTableChange(newTableId: string) {
    setTableId(newTableId);
    setColumnId("");
    setAggregation("");
  }

  function handleColumnChange(newColumnId: string) {
    setColumnId(newColumnId);
    const col = columnsQuery.data?.find((c) => c.id === newColumnId);
    if (col) {
      const compatible = getCompatibleAggregations(col.type, col.config as Record<string, unknown>);
      if (aggregation && !compatible.includes(aggregation)) {
        setAggregation(compatible[0] ?? "");
      } else if (!aggregation && compatible[0]) {
        setAggregation(compatible[0]);
      }
    }
  }

  function handleAggregationChange(newAgg: AggregationValue | "") {
    setAggregation(newAgg);
    if (selectedColumn) {
      const compatible = getCompatibleAggregations(
        selectedColumn.type,
        selectedColumn.config as Record<string, unknown>,
      );
      if (newAgg && !compatible.includes(newAgg)) {
        setColumnId("");
      }
    }
  }

  function handleSave() {
    if (!tableId || !columnId || !aggregation) {
      toast.error("Please select a table, column, and aggregation");
      return;
    }
    setTracker.mutate({
      project_id: projectId,
      table_id: tableId,
      column_id: columnId,
      aggregation: aggregation as AggregationValue,
      target_value: targetValue ? Number(targetValue) : null,
      target_label: targetLabel || null,
    });
  }

  const hasExistingTracker = !!currentTracker?.table_id;
  const isPending = setTracker.isPending || clearTracker.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-default bg-surface-raised p-4">
      <div className="font-ui text-xs font-semibold text-text-secondary">Tracker</div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="font-ui text-2xs text-text-tertiary">Source table</label>
          <select
            value={tableId}
            onChange={(e) => handleTableChange(e.target.value)}
            disabled={isPending}
            className={cn(
              "h-7 rounded-sm border border-border-default bg-surface-base px-2 font-ui text-xs text-text-primary",
              "focus:outline-none focus:ring-1 focus:ring-border-focus",
              "disabled:opacity-50",
            )}
          >
            <option value="">Select a table…</option>
            {tablesQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-ui text-2xs text-text-tertiary">Column</label>
          <select
            value={columnId}
            onChange={(e) => handleColumnChange(e.target.value)}
            disabled={!tableId || isPending || columnsQuery.isLoading}
            className={cn(
              "h-7 rounded-sm border border-border-default bg-surface-base px-2 font-ui text-xs text-text-primary",
              "focus:outline-none focus:ring-1 focus:ring-border-focus",
              "disabled:opacity-50",
            )}
          >
            <option value="">Select a column…</option>
            {compatibleColumns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
          {tableId && !columnsQuery.isLoading && compatibleColumns.length === 0 && (
            <span className="font-ui text-2xs text-text-tertiary">
              This table has no numeric, date, checkbox, or formula columns.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-ui text-2xs text-text-tertiary">Aggregation</label>
          <select
            value={aggregation}
            onChange={(e) => handleAggregationChange(e.target.value as AggregationValue | "")}
            disabled={!columnId || isPending}
            className={cn(
              "h-7 rounded-sm border border-border-default bg-surface-base px-2 font-ui text-xs text-text-primary",
              "focus:outline-none focus:ring-1 focus:ring-border-focus",
              "disabled:opacity-50",
            )}
          >
            <option value="">Select aggregation…</option>
            {availableAggregations.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-border-subtle pt-2">
          <div className="mb-2 font-ui text-2xs text-text-tertiary">Target (optional)</div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="font-ui text-2xs text-text-disabled">Value</label>
              <input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="e.g. 1000"
                disabled={isPending}
                className={cn(
                  "h-7 rounded-sm border border-border-default bg-surface-base px-2 font-ui text-xs text-text-primary",
                  "focus:outline-none focus:ring-1 focus:ring-border-focus",
                  "placeholder:text-text-disabled disabled:opacity-50",
                )}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="font-ui text-2xs text-text-disabled">Label</label>
              <input
                type="text"
                value={targetLabel}
                onChange={(e) => setTargetLabel(e.target.value)}
                placeholder="e.g. km"
                maxLength={200}
                disabled={isPending}
                className={cn(
                  "h-7 rounded-sm border border-border-default bg-surface-base px-2 font-ui text-xs text-text-primary",
                  "focus:outline-none focus:ring-1 focus:ring-border-focus",
                  "placeholder:text-text-disabled disabled:opacity-50",
                )}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!tableId || !columnId || !aggregation || isPending}
          className={cn(
            "h-7 rounded-sm bg-accent-primary px-3 font-ui text-xs font-medium text-text-on-accent",
            "hover:bg-accent-primary-hover active:bg-accent-primary-active",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "focus:outline-none focus:ring-1 focus:ring-border-focus",
          )}
        >
          {setTracker.isPending ? "Saving…" : "Save"}
        </button>
        {hasExistingTracker && (
          <button
            onClick={() => clearTracker.mutate({ project_id: projectId })}
            disabled={isPending}
            className={cn(
              "h-7 rounded-sm border border-border-default px-3 font-ui text-xs text-text-secondary",
              "hover:bg-surface-hover hover:text-text-primary",
              "disabled:cursor-not-allowed disabled:opacity-40",
              "focus:outline-none focus:ring-1 focus:ring-border-focus",
            )}
          >
            {clearTracker.isPending ? "Clearing…" : "Clear"}
          </button>
        )}
      </div>
    </div>
  );
}
