export type FormulaReturnType = "number" | "text" | "date" | "boolean";

export const FORMULA_ERROR_KEY = "__formula_error";

export interface FormulaErrorValue {
  [FORMULA_ERROR_KEY]: string;
}

export function isFormulaError(v: unknown): v is FormulaErrorValue {
  return (
    typeof v === "object" &&
    v !== null &&
    FORMULA_ERROR_KEY in v &&
    typeof (v as FormulaErrorValue)[FORMULA_ERROR_KEY] === "string"
  );
}
