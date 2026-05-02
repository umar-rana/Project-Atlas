export type ColumnType = "text" | "number" | "date" | "checkbox" | "single_select" | "currency";

export type AggregationType = "sum" | "average" | "count" | "min" | "max" | "checked_ratio" | "none";

export interface SingleSelectOption {
  id: string;
  label: string;
  color?: string;
}

export interface ColumnConfig {
  options?: SingleSelectOption[];
  decimal_places?: number;
}

export type CellValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "single_select", label: "Single Select" },
  { value: "currency", label: "Currency" },
];

export const DEFAULT_AGGREGATIONS: Record<ColumnType, AggregationType> = {
  text: "none",
  number: "sum",
  date: "count",
  checkbox: "checked_ratio",
  single_select: "none",
  currency: "sum",
};

export interface TableColumnData {
  id: string;
  name: string;
  type: ColumnType;
  position: number;
  config: ColumnConfig;
  aggregation?: AggregationType | null;
  width: number;
}

export interface TableCellData {
  row_id: string;
  column_id: string;
  value: CellValue;
}

export interface TableRowData {
  id: string;
  position: number;
  cells: TableCellData[];
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal";

export interface FilterState {
  column_id: string;
  operator: FilterOperator;
  value: CellValue;
}

export interface SortState {
  column_id: string | null;
  direction: "asc" | "desc";
}

export function getOperatorsForType(type: ColumnType): FilterOperator[] {
  switch (type) {
    case "text":
      return ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"];
    case "number":
    case "currency":
      return ["equals", "not_equals", "greater_than", "less_than", "greater_than_or_equal", "less_than_or_equal", "is_empty", "is_not_empty"];
    case "date":
      return ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"];
    case "checkbox":
      return ["equals", "is_empty", "is_not_empty"];
    case "single_select":
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
    default:
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
  }
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  greater_than: "greater than",
  less_than: "less than",
  greater_than_or_equal: "≥",
  less_than_or_equal: "≤",
};
