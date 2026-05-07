import type { ColumnType, CellValue, SingleSelectOption } from "./types";
import { isMultiSelectValue, isMultiSelectEmpty } from "./types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  normalized?: CellValue;
}

export function validateCellValue(type: ColumnType, value: unknown): ValidationResult {
  if (value === null || value === undefined || value === "") {
    return { valid: true, normalized: null };
  }

  switch (type) {
    case "text":
      if (typeof value !== "string") return { valid: false, error: "Text value must be a string" };
      return { valid: true, normalized: value };

    case "number": {
      const n = typeof value === "string" ? parseFloat(value) : value;
      if (typeof n !== "number" || isNaN(n)) return { valid: false, error: "Number value must be a valid number" };
      return { valid: true, normalized: n };
    }

    case "currency": {
      const n = typeof value === "string" ? parseFloat(value) : value;
      if (typeof n !== "number" || isNaN(n)) return { valid: false, error: "Currency value must be a valid number" };
      return { valid: true, normalized: n };
    }

    case "date": {
      if (typeof value !== "string") return { valid: false, error: "Date value must be an ISO date string" };
      const d = new Date(value);
      if (isNaN(d.getTime())) return { valid: false, error: "Date value must be a valid date" };
      return { valid: true, normalized: value };
    }

    case "checkbox":
      if (typeof value !== "boolean") return { valid: false, error: "Checkbox value must be a boolean" };
      return { valid: true, normalized: value };

    case "single_select":
      if (typeof value !== "string") return { valid: false, error: "Single select value must be a string (option ID)" };
      return { valid: true, normalized: value };

    case "multi_select": {
      if (isMultiSelectValue(value)) {
        const ids = value.option_ids.filter((id) => typeof id === "string");
        if (ids.length === 0) return { valid: true, normalized: null };
        return { valid: true, normalized: { option_ids: ids } };
      }
      return { valid: false, error: "Multi-select value must be an object with option_ids array" };
    }

    case "formula":
      return { valid: false, error: "Formula columns are read-only and cannot have cells written directly." };

    default:
      return { valid: false, error: `Unknown column type: ${type}` };
  }
}

export function serializeCellValue(type: ColumnType, value: CellValue): unknown {
  return value ?? null;
}

export function deserializeCellValue(type: ColumnType, raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  switch (type) {
    case "number":
    case "currency":
      return typeof raw === "number" ? raw : null;
    case "checkbox":
      return typeof raw === "boolean" ? raw : null;
    case "multi_select":
      if (isMultiSelectValue(raw)) return raw;
      return null;
    default:
      return typeof raw === "string" ? raw : null;
  }
}

export function formatCellValueForCsv(
  type: ColumnType,
  value: CellValue,
  options?: SingleSelectOption[],
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && !Array.isArray(value) && "__formula_error" in (value as object)) return "#ERROR";
  switch (type) {
    case "checkbox":
      return value ? "TRUE" : "FALSE";
    case "number":
    case "currency":
    case "formula":
      return String(value);
    case "multi_select": {
      if (!isMultiSelectValue(value) || isMultiSelectEmpty(value)) return "";
      if (!options) return value.option_ids.join("|");
      return value.option_ids
        .map((id) => options.find((o) => o.id === id)?.label ?? id)
        .join("|");
    }
    default:
      return String(value);
  }
}
