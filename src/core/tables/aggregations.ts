import type {
  ColumnType,
  AggregationType,
  TableRowData,
} from "./types";
import { isMultiSelectEmpty } from "./types";
import { isFormulaError } from "./formula-shared";

export function computeAggregation(
  type: ColumnType,
  aggregation: AggregationType | null | undefined,
  rows: TableRowData[],
  columnId: string,
): string | null {
  if (!aggregation || aggregation === "none") return null;

  const allValues = rows.map((r) => r.cells.find((c) => c.column_id === columnId)?.value ?? null);

  const values = allValues.filter((v) => {
    if (isFormulaError(v)) return false;
    if (type === "multi_select") return !isMultiSelectEmpty(v);
    return v !== null && v !== undefined && v !== "";
  });

  if (values.length === 0) return null;

  switch (aggregation) {
    case "count":
      return String(values.length);

    case "checked_ratio": {
      if (type !== "checkbox") return null;
      const checked = values.filter((v) => v === true).length;
      return `${checked}/${rows.length}`;
    }

    case "sum": {
      if (type !== "number" && type !== "currency") return null;
      const sum = values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
      return formatNumber(sum, type);
    }

    case "average": {
      if (type !== "number" && type !== "currency") return null;
      const total = values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
      return formatNumber(total / values.length, type);
    }

    case "min": {
      if (type === "number" || type === "currency") {
        const min = Math.min(...values.map((v) => Number(v)));
        return formatNumber(min, type);
      }
      if (type === "date") {
        const dates = values.map((v) => new Date(String(v)).getTime()).filter((t) => !isNaN(t));
        if (dates.length === 0) return null;
        return new Date(Math.min(...dates)).toLocaleDateString();
      }
      return null;
    }

    case "max": {
      if (type === "number" || type === "currency") {
        const max = Math.max(...values.map((v) => Number(v)));
        return formatNumber(max, type);
      }
      if (type === "date") {
        const dates = values.map((v) => new Date(String(v)).getTime()).filter((t) => !isNaN(t));
        if (dates.length === 0) return null;
        return new Date(Math.max(...dates)).toLocaleDateString();
      }
      return null;
    }

    default:
      return null;
  }
}

function formatNumber(n: number, type: ColumnType): string {
  if (isNaN(n)) return "0";
  const formatted =
    n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return formatted;
}

export const AGGREGATION_LABELS: Record<AggregationType, string> = {
  none: "None",
  sum: "Sum",
  average: "Average",
  count: "Count",
  min: "Min",
  max: "Max",
  checked_ratio: "Checked",
};

export function getAvailableAggregations(type: ColumnType): AggregationType[] {
  switch (type) {
    case "number":
    case "currency":
      return ["none", "sum", "average", "count", "min", "max"];
    case "date":
      return ["none", "count", "min", "max"];
    case "checkbox":
      return ["none", "count", "checked_ratio"];
    case "text":
    case "single_select":
    case "multi_select":
      return ["none", "count"];
    default:
      return ["none", "count"];
  }
}
