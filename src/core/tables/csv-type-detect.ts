import type { ColumnType } from "./types";

export interface DetectedColumn {
  name: string;
  type: ColumnType;
}

const CHECKBOX_TRUTHY = new Set(["true", "yes", "1", "x", "✓", "on"]);
const CHECKBOX_FALSY = new Set(["false", "no", "0", "", "off", "✗", "n/a"]);

export function detectCheckbox(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every(
    (v) =>
      CHECKBOX_TRUTHY.has(v.toLowerCase().trim()) ||
      CHECKBOX_FALSY.has(v.toLowerCase().trim()),
  );
}

export function detectNumber(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => {
    const cleaned = v.trim().replace(/[,\s]/g, "");
    const n = parseFloat(cleaned);
    return !isNaN(n) && isFinite(n);
  });
}

export function detectCurrency(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;
  const currencyPattern = /^[£$€¥₨₹₩₪฿₫₭₮₱₲₴₵₸₺₼₾]\s*[\d,.]+$/;
  return nonEmpty.every((v) => currencyPattern.test(v.trim()));
}

export function detectDate(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => {
    const t = v.trim();
    if (/^\d{1,5}$/.test(t)) return false;
    const d = new Date(t);
    return !isNaN(d.getTime());
  });
}

export function detectMultiSelect(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length < 2) return false;

  const hasPipeSeparators = nonEmpty.some((v) => v.includes("|"));
  const hasCommaSeparators = !hasPipeSeparators && nonEmpty.some((v) => v.includes(","));

  const separator = hasPipeSeparators ? "|" : hasCommaSeparators ? "," : null;
  if (!separator) return false;

  const allTerms: string[] = [];
  for (const v of nonEmpty) {
    for (const t of v.split(separator)) {
      const trimmed = t.trim();
      if (trimmed) allTerms.push(trimmed.toLowerCase());
    }
  }
  const uniqueTerms = new Set(allTerms);
  if (uniqueTerms.size > 50) return false;
  return uniqueTerms.size < allTerms.length;
}

export function detectSingleSelect(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length < 2) return false;
  const unique = new Set(nonEmpty.map((v) => v.toLowerCase().trim()));
  return unique.size >= 2 && unique.size <= 20 && unique.size < nonEmpty.length;
}

export function detectColumnType(values: string[]): ColumnType {
  if (detectCheckbox(values)) return "checkbox";
  if (detectCurrency(values)) return "currency";
  if (detectDate(values)) return "date";
  if (detectNumber(values)) return "number";
  if (detectMultiSelect(values)) return "multi_select";
  if (detectSingleSelect(values)) return "single_select";
  return "text";
}

export function detectColumns(
  headers: string[],
  rows: string[][],
): DetectedColumn[] {
  return headers.map((name, colIdx) => {
    const columnValues = rows.map((row) => row[colIdx] ?? "");
    const type = detectColumnType(columnValues);
    return { name, type };
  });
}

export function inferMultiSelectSeparator(values: string[]): "|" | "," {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  const hasPipe = nonEmpty.some((v) => v.includes("|"));
  return hasPipe ? "|" : ",";
}

export function extractSelectOptions(
  values: string[],
  type: "single_select" | "multi_select",
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const separator = type === "multi_select" ? inferMultiSelectSeparator(values) : null;
  for (const v of values) {
    if (!v.trim()) continue;
    const parts =
      separator && v.includes(separator)
        ? v.split(separator).map((t) => t.trim()).filter(Boolean)
        : [v.trim()];
    for (const part of parts) {
      if (!seen.has(part)) {
        seen.add(part);
        ordered.push(part);
      }
    }
  }
  return ordered;
}

export function coerceCheckbox(value: string): boolean | null {
  const v = value.toLowerCase().trim();
  if (CHECKBOX_TRUTHY.has(v)) return true;
  if (CHECKBOX_FALSY.has(v)) return false;
  return null;
}

export function coerceNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) || !isFinite(n) ? null : n;
}

export function coerceCurrency(value: string): number | null {
  const cleaned = value.trim().replace(/[£$€¥₨₹₩₪฿₫₭₮₱₲₴₵₸₺₼₾\s,]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) || !isFinite(n) ? null : n;
}

export function coerceDate(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const PALETTE_COLORS = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
  "var(--viz-7)",
  "var(--viz-8)",
] as const;

export function assignPaletteColor(index: number): string {
  return PALETTE_COLORS[index % PALETTE_COLORS.length] ?? "var(--viz-1)";
}
