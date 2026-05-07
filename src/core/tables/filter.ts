import type { ColumnType, CellValue, FilterState, TableRowData, TableColumnData } from "./types";
import { isMultiSelectValue, isMultiSelectEmpty } from "./types";

function testFilter(type: ColumnType, value: CellValue, state: FilterState): boolean {
  const { operator, value: filterValue } = state;

  // Empty detection — multi_select needs special handling
  const isEmpty =
    type === "multi_select"
      ? isMultiSelectEmpty(value)
      : value === null || value === undefined || value === "";

  switch (operator) {
    case "is_empty":
      return isEmpty;
    case "is_not_empty":
      return !isEmpty;
  }

  if (isEmpty) return false;

  switch (type) {
    case "text":
    case "single_select":
      switch (operator) {
        case "equals":
          return String(value).toLowerCase() === String(filterValue ?? "").toLowerCase();
        case "not_equals":
          return String(value).toLowerCase() !== String(filterValue ?? "").toLowerCase();
        case "contains":
          return String(value).toLowerCase().includes(String(filterValue ?? "").toLowerCase());
        case "not_contains":
          return !String(value).toLowerCase().includes(String(filterValue ?? "").toLowerCase());
        default:
          return true;
      }

    case "multi_select": {
      if (!isMultiSelectValue(value)) return false;
      const selectedIds = value.option_ids;
      const filterIds: string[] = Array.isArray(filterValue)
        ? (filterValue as string[])
        : typeof filterValue === "string" && filterValue
          ? [filterValue]
          : [];
      if (filterIds.length === 0) return true;

      switch (operator) {
        case "contains_any_of":
          return filterIds.some((id) => selectedIds.includes(id));
        case "contains_all_of":
          return filterIds.every((id) => selectedIds.includes(id));
        default:
          return true;
      }
    }

    case "number":
    case "currency": {
      const numVal = Number(value);
      const numFilter = Number(filterValue ?? 0);
      switch (operator) {
        case "equals": return numVal === numFilter;
        case "not_equals": return numVal !== numFilter;
        case "greater_than": return numVal > numFilter;
        case "less_than": return numVal < numFilter;
        case "greater_than_or_equal": return numVal >= numFilter;
        case "less_than_or_equal": return numVal <= numFilter;
        default: return true;
      }
    }

    case "date": {
      const dateVal = new Date(String(value)).getTime();
      const dateFilter = new Date(String(filterValue ?? "")).getTime();
      if (isNaN(dateFilter)) return true;
      switch (operator) {
        case "equals": return Math.abs(dateVal - dateFilter) < 86400000;
        case "not_equals": return Math.abs(dateVal - dateFilter) >= 86400000;
        case "greater_than": return dateVal > dateFilter;
        case "less_than": return dateVal < dateFilter;
        default: return true;
      }
    }

    case "checkbox":
      switch (operator) {
        case "equals":
          return Boolean(value) === Boolean(filterValue);
        default:
          return true;
      }

    default:
      return true;
  }
}

export function filterRows(
  rows: TableRowData[],
  filter: FilterState | null,
  columns: TableColumnData[],
): TableRowData[] {
  if (!filter) return rows;

  const col = columns.find((c) => c.id === filter.column_id);
  if (!col) return rows;

  return rows.filter((row) => {
    const cell = row.cells.find((c) => c.column_id === filter.column_id);
    return testFilter(col.type, cell?.value ?? null, filter);
  });
}
