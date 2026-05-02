import type { ColumnType, CellValue, SortState, TableRowData, TableColumnData } from "./types";

function compareCellValues(type: ColumnType, a: CellValue, b: CellValue, direction: "asc" | "desc"): number {
  const nullA = a === null || a === undefined || a === "";
  const nullB = b === null || b === undefined || b === "";

  if (nullA && nullB) return 0;
  if (nullA) return 1;
  if (nullB) return -1;

  let result = 0;

  switch (type) {
    case "text":
    case "single_select":
      result = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
      break;

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

  return [...rows].sort((a, b) => {
    const cellA = a.cells.find((c) => c.column_id === sort.column_id);
    const cellB = b.cells.find((c) => c.column_id === sort.column_id);
    return compareCellValues(col.type, cellA?.value ?? null, cellB?.value ?? null, sort.direction);
  });
}
