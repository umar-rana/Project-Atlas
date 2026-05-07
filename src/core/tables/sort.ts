import type {
  ColumnType,
  CellValue,
  SortState,
  TableRowData,
  TableColumnData,
  SingleSelectOption,
} from "./types";
import { isMultiSelectValue, isMultiSelectEmpty } from "./types";
import { isFormulaError } from "./formula-shared";

function getFirstMultiSelectLabel(value: CellValue, options: SingleSelectOption[]): string | null {
  if (!isMultiSelectValue(value) || isMultiSelectEmpty(value)) return null;
  const firstId = value.option_ids[0];
  if (!firstId) return null;
  return options.find((o) => o.id === firstId)?.label ?? null;
}

function compareCellValues(
  type: ColumnType,
  a: CellValue,
  b: CellValue,
  direction: "asc" | "desc",
  options?: SingleSelectOption[],
): number {
  // Formula errors sort as null
  const aVal = isFormulaError(a) ? null : a;
  const bVal = isFormulaError(b) ? null : b;
  if (aVal !== a || bVal !== b) {
    return compareCellValues(type, aVal, bVal, direction, options);
  }

  // Empty detection — multi_select needs special handling
  const nullA =
    type === "multi_select" ? isMultiSelectEmpty(a) : a === null || a === undefined || a === "";
  const nullB =
    type === "multi_select" ? isMultiSelectEmpty(b) : b === null || b === undefined || b === "";

  // Empty cells always last on asc, first on desc
  if (nullA && nullB) return 0;
  if (nullA) return direction === "asc" ? 1 : -1;
  if (nullB) return direction === "asc" ? -1 : 1;

  let result = 0;

  switch (type) {
    case "text":
    case "single_select":
      result = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
      break;

    case "multi_select": {
      const labelA = getFirstMultiSelectLabel(a, options ?? []) ?? "";
      const labelB = getFirstMultiSelectLabel(b, options ?? []) ?? "";
      result = labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
      break;
    }

    case "number":
    case "currency":
      result = (Number(a) || 0) - (Number(b) || 0);
      break;

    case "date":
      result = new Date(String(a)).getTime() - new Date(String(b)).getTime();
      break;

    case "checkbox":
      result = (a === true ? 1 : 0) - (b === true ? 1 : 0);
      break;

    default:
      result = 0;
  }

  return direction === "desc" ? -result : result;
}

export function sortRows(
  rows: TableRowData[],
  sort: SortState,
  columns: TableColumnData[],
): TableRowData[] {
  if (!sort.column_id) return rows;

  const col = columns.find((c) => c.id === sort.column_id);
  if (!col) return rows;

  const options = (col.config.options ?? []) as SingleSelectOption[];

  // Formula columns: sort by their computed values using the declared return_type
  const effectiveType: ColumnType =
    col.type === "formula"
      ? (((col.config as { return_type?: string }).return_type as ColumnType) ?? "text")
      : col.type;

  return [...rows].sort((a, b) => {
    const cellA = a.cells.find((c) => c.column_id === sort.column_id);
    const cellB = b.cells.find((c) => c.column_id === sort.column_id);
    return compareCellValues(
      effectiveType,
      cellA?.value ?? null,
      cellB?.value ?? null,
      sort.direction,
      options,
    );
  });
}
