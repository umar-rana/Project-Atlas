import "server-only";
import { Parser } from "expr-eval";
import type { Values } from "expr-eval";
import type { CellValue, ColumnType, TableColumnData, TableCellData } from "./types";
import {
  type FormulaReturnType,
  type FormulaErrorValue,
  FORMULA_ERROR_KEY,
  isFormulaError as _isFormulaError,
} from "./formula-shared";

export type { FormulaReturnType };
export type { FormulaErrorValue };
export { FORMULA_ERROR_KEY };
export { _isFormulaError as isFormulaError };
export { extractColumnRefs };

export interface FormulaResult {
  value: CellValue | FormulaErrorValue;
  error?: string;
}

// ─── Expression pre-processing ────────────────────────────────────────────────

function normalizeExpression(expression: string): string {
  return expression
    .replace(/&&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/!(?!=)/g, " not ");
}

function extractColumnRefs(expression: string): string[] {
  const refs: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(expression)) !== null) {
    const name = m[1]!.trim();
    if (!refs.includes(name)) refs.push(name);
  }
  return refs;
}

// Replace {ColumnName} tokens with safe variable names for expr-eval
function tokenizeExpression(expression: string): {
  processed: string;
  tokenMap: Map<string, string>;
} {
  const tokenMap = new Map<string, string>();
  let varIndex = 0;
  const processed = expression.replace(/\{([^}]+)\}/g, (_, colName: string) => {
    const name = colName.trim();
    if (!tokenMap.has(name)) {
      tokenMap.set(name, `__col${varIndex++}`);
    }
    return tokenMap.get(name)!;
  });
  return { processed, tokenMap };
}

// ─── Value coercion helpers ───────────────────────────────────────────────────

function coerceForColumn(
  colType: ColumnType,
  rawValue: CellValue,
): number | string | boolean | null {
  if (rawValue === null || rawValue === undefined) {
    switch (colType) {
      case "number":
      case "currency":
        return 0;
      case "checkbox":
        return false;
      default:
        return "";
    }
  }
  switch (colType) {
    case "number":
    case "currency":
      return typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;
    case "checkbox":
      return rawValue === true || rawValue === "true" || rawValue === 1;
    case "date":
      if (typeof rawValue === "string") {
        const d = new Date(rawValue);
        return isNaN(d.getTime()) ? "" : rawValue;
      }
      return "";
    default:
      return typeof rawValue === "string" ? rawValue : String(rawValue);
  }
}

function coerceResult(raw: unknown, returnType: FormulaReturnType, _decimals?: number): CellValue {
  if (raw === null || raw === undefined) return null;
  switch (returnType) {
    case "number": {
      const n = Number(raw);
      return isNaN(n) ? null : n;
    }
    case "text":
      return raw instanceof Date ? raw.toISOString() : typeof raw === "string" ? raw : String(raw);
    case "date": {
      if (raw instanceof Date) return raw.toISOString();
      if (typeof raw === "number") return new Date(raw).toISOString();
      if (typeof raw === "string") {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d.toISOString();
      }
      return null;
    }
    case "boolean":
      return Boolean(raw);
    default:
      return null;
  }
}

// ─── Parser factory with custom functions ─────────────────────────────────────

function makeParser(): Parser {
  const parser = new Parser({
    operators: {
      add: true,
      comparison: true,
      concatenate: true,
      conditional: true,
      divide: true,
      factorial: false,
      logical: true,
      multiply: true,
      power: true,
      remainder: true,
      subtract: true,
    },
  });

  parser.functions["IF"] = function (cond: unknown, ifTrue: unknown, ifFalse: unknown) {
    return cond ? ifTrue : ifFalse;
  };

  parser.functions["CONCAT"] = function (...args: unknown[]) {
    return args.map((a) => (a === null || a === undefined ? "" : String(a))).join("");
  };

  parser.functions["ROUND"] = function (n: unknown, decimals?: unknown) {
    const num = Number(n);
    if (isNaN(num)) return 0;
    const d = decimals !== undefined ? Number(decimals) : 0;
    const factor = Math.pow(10, isNaN(d) ? 0 : d);
    return Math.round(num * factor) / factor;
  };

  parser.functions["ABS"] = function (n: unknown) {
    return Math.abs(Number(n));
  };

  parser.functions["MIN"] = function (...args: unknown[]) {
    const nums = args.map(Number).filter((n) => !isNaN(n));
    return nums.length === 0 ? null : Math.min(...nums);
  };

  parser.functions["MAX"] = function (...args: unknown[]) {
    const nums = args.map(Number).filter((n) => !isNaN(n));
    return nums.length === 0 ? null : Math.max(...nums);
  };

  parser.functions["DAYS_BETWEEN"] = function (a: unknown, b: unknown) {
    const dateA = a instanceof Date ? a : new Date(String(a));
    const dateB = b instanceof Date ? b : new Date(String(b));
    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return null;
    return Math.round((dateB.getTime() - dateA.getTime()) / 86400000);
  };

  parser.functions["NOW"] = function () {
    return new Date();
  };

  parser.functions["LEN"] = function (s: unknown) {
    if (s === null || s === undefined) return 0;
    return String(s).length;
  };

  parser.functions["UPPER"] = function (s: unknown) {
    if (s === null || s === undefined) return "";
    return String(s).toUpperCase();
  };

  parser.functions["LOWER"] = function (s: unknown) {
    if (s === null || s === undefined) return "";
    return String(s).toLowerCase();
  };

  return parser;
}

// ─── Shared parser instance ───────────────────────────────────────────────────

const sharedParser = makeParser();

// ─── Circular reference detection ─────────────────────────────────────────────

function buildDependencyGraph(
  columns: Array<{ id: string; name: string; type: string; config: Record<string, unknown> }>,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const col of columns) {
    if (col.type !== "formula") continue;
    const cfg = col.config as { expression?: string };
    const expr = cfg.expression ?? "";
    const refs = extractColumnRefs(expr);
    const depIds: string[] = [];
    for (const ref of refs) {
      const dep = columns.find((c) => c.name === ref);
      if (dep) depIds.push(dep.id);
    }
    graph.set(col.id, depIds);
  }
  return graph;
}

function hasCycle(
  startId: string,
  deps: string[],
  graph: Map<string, string[]>,
  visited = new Set<string>(),
): boolean {
  for (const dep of deps) {
    if (dep === startId) return true;
    if (visited.has(dep)) continue;
    visited.add(dep);
    const nextDeps = graph.get(dep) ?? [];
    if (hasCycle(startId, nextDeps, graph, visited)) return true;
  }
  return false;
}

// ─── Topological sort of formula columns ──────────────────────────────────────

function topoSortFormulaCols<T extends { id: string; name: string; type: string; config: object }>(
  formulaCols: T[],
): T[] {
  const byId = new Map<string, T>(formulaCols.map((c) => [c.id, c]));
  const byName = new Map<string, string>(formulaCols.map((c) => [c.name, c.id]));

  const deps = new Map<string, string[]>();
  for (const col of formulaCols) {
    const refs = extractColumnRefs((col.config as { expression?: string }).expression ?? "");
    deps.set(
      col.id,
      refs.flatMap((r) => (byName.has(r) ? [byName.get(r)!] : [])),
    );
  }

  const visited = new Set<string>();
  const result: T[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const dep of deps.get(id) ?? []) visit(dep);
    const col = byId.get(id);
    if (col) result.push(col);
  }

  for (const col of formulaCols) visit(col.id);
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all formula columns for a single row in dependency order,
 * accumulating computed values so formula-on-formula references work correctly.
 * Returns only the formula virtual cells (not the original regular cells).
 */
export function injectFormulaVirtualCells(
  rowId: string,
  regularCells: TableCellData[],
  allColumns: TableColumnData[],
): Array<{ id: string; row_id: string; column_id: string; value: CellValue | FormulaErrorValue }> {
  const formulaCols = allColumns.filter((c) => c.type === "formula");
  if (formulaCols.length === 0) return [];

  const sorted = topoSortFormulaCols(formulaCols);
  const accumulated: TableCellData[] = [...regularCells];
  const out: Array<{
    id: string;
    row_id: string;
    column_id: string;
    value: CellValue | FormulaErrorValue;
  }> = [];

  for (const col of sorted) {
    const cfg = col.config as {
      expression?: string;
      return_type?: FormulaReturnType;
      decimals?: number;
    };
    const result = evaluateFormula(
      cfg.expression ?? "",
      accumulated,
      allColumns,
      cfg.return_type ?? "text",
      cfg.decimals,
    );
    out.push({
      id: `formula-${rowId}-${col.id}`,
      row_id: rowId,
      column_id: col.id,
      value: result.value,
    });
    // Add to accumulated so subsequent formula columns can reference this one
    accumulated.push({ row_id: rowId, column_id: col.id, value: result.value as CellValue });
  }

  return out;
}

/**
 * Evaluate a formula expression for a single row.
 */
export function evaluateFormula(
  expression: string,
  rowCells: TableCellData[],
  allColumns: TableColumnData[],
  returnType: FormulaReturnType,
  decimals?: number,
): FormulaResult {
  try {
    const { processed, tokenMap } = tokenizeExpression(expression);
    const normalized = normalizeExpression(processed);

    // Build variables map — typed as Values so no any cast needed
    const vars: Values = {};
    for (const [colName, varName] of tokenMap) {
      const col = allColumns.find((c) => c.name === colName);
      if (!col) {
        return {
          value: { [FORMULA_ERROR_KEY]: `Column "${colName}" not found` },
          error: `Column "${colName}" not found`,
        };
      }
      const cell = rowCells.find((c) => c.column_id === col.id);
      // coerceForColumn returns number | string | boolean | null
      // expr-eval Values = number | string | fn | object — no boolean/null.
      // Map: null → 0, true → 1, false → 0  (expr-eval evaluates 1/0 in logical context correctly)
      const coerced = coerceForColumn(col.type as ColumnType, cell?.value ?? null);
      vars[varName] = coerced === null ? 0 : coerced === true ? 1 : coerced === false ? 0 : coerced;
    }

    const parsed = sharedParser.parse(normalized);
    const raw = parsed.evaluate(vars);
    const value = coerceResult(raw, returnType, decimals);

    return { value };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      value: { [FORMULA_ERROR_KEY]: msg },
      error: msg,
    };
  }
}

/**
 * Validate a formula expression and return an array of friendly error messages.
 * Pass selfId when updating/creating a formula column (to detect self-reference and circular refs).
 * Pass selfName when creating a new column so it's included in the dependency graph.
 */
export function validateFormula(
  expression: string,
  returnType: string,
  tableColumns: Array<{ id: string; name: string; type: string; config: Record<string, unknown> }>,
  selfId?: string,
  selfName?: string,
): string[] {
  const errors: string[] = [];

  if (!expression.trim()) {
    errors.push("Formula expression cannot be empty.");
    return errors;
  }

  if (!["number", "text", "date", "boolean"].includes(returnType)) {
    errors.push("Return type must be one of: number, text, date, boolean.");
    return errors;
  }

  // 1. Parse expression (syntax check)
  let parseOk = false;
  try {
    const { processed } = tokenizeExpression(expression);
    const normalized = normalizeExpression(processed);
    sharedParser.parse(normalized);
    parseOk = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(friendlyParseError(msg));
    return errors;
  }

  // 2. Extract column refs
  const refs = extractColumnRefs(expression);

  // 3. All refs must exist in the table
  let missingRef = false;
  for (const ref of refs) {
    const col = tableColumns.find((c) => c.name === ref);
    if (!col) {
      errors.push(`Column "${ref}" does not exist in this table.`);
      missingRef = true;
    }
  }

  // 4. Self-reference check — both for an existing column (selfId) and a new column (selfName)
  if (selfId) {
    const selfCol = tableColumns.find((c) => c.id === selfId);
    if (selfCol && refs.includes(selfCol.name)) {
      errors.push("A formula column cannot reference itself.");
    }
  }
  if (selfName && refs.includes(selfName)) {
    errors.push("A formula column cannot reference itself.");
  }

  if (errors.length > 0) return errors;

  // 5. Circular reference detection — include the column being added/updated
  if (parseOk && !missingRef) {
    const hypothetical = tableColumns.map((c) => {
      if (c.id === selfId) {
        return { ...c, type: "formula", config: { expression } };
      }
      return c;
    });
    // For a new column (no selfId yet in DB), add it with a temp id using its real name
    if (!selfId && selfName) {
      hypothetical.push({ id: "__new__", name: selfName, type: "formula", config: { expression } });
    } else if (!selfId && !selfName) {
      hypothetical.push({
        id: "__new__",
        name: "__new__",
        type: "formula",
        config: { expression },
      });
    }

    const graph = buildDependencyGraph(hypothetical);
    const checkId = selfId ?? "__new__";
    const deps = graph.get(checkId) ?? [];

    if (hasCycle(checkId, deps, graph)) {
      errors.push("This formula creates a circular reference with other formula columns.");
    }
  }

  // 6. Return-type consistency: dry-run with representative values to detect type mismatches
  if (errors.length === 0 && parseOk && !missingRef) {
    try {
      const { processed, tokenMap } = tokenizeExpression(expression);
      const normalized = normalizeExpression(processed);
      const dummyVars: Values = {};
      for (const [colName, varName] of tokenMap) {
        const col = tableColumns.find((c) => c.name === colName);
        if (!col) continue;
        switch (col.type) {
          case "number":
          case "currency":
            dummyVars[varName] = 1;
            break;
          case "checkbox":
            dummyVars[varName] = 1;
            break;
          case "date":
            dummyVars[varName] = "2024-01-01";
            break;
          default:
            dummyVars[varName] = "sample";
        }
      }
      const parsed = sharedParser.parse(normalized);
      const raw = parsed.evaluate(dummyVars);

      if (returnType === "number") {
        const n = Number(raw);
        if (isNaN(n) && typeof raw === "string" && raw.length > 0) {
          errors.push(
            `This formula returns text ("${raw.slice(0, 20)}") but the return type is Number. Change the return type to Text, or adjust the expression.`,
          );
        }
      } else if (returnType === "date") {
        if (typeof raw === "number") {
          errors.push(
            "This formula returns a number but the return type is Date. Change the return type to Number, or use DAYS_BETWEEN/NOW for date arithmetic.",
          );
        } else if (typeof raw === "string" && raw.length > 0) {
          const d = new Date(raw);
          if (isNaN(d.getTime())) {
            errors.push(
              `This formula returns text ("${raw.slice(0, 20)}") that is not a valid date. Change the return type to Text, or ensure the expression produces an ISO date string.`,
            );
          }
        }
      } else if (returnType === "boolean") {
        if (typeof raw === "string" && raw.length > 1 && isNaN(Number(raw))) {
          errors.push(
            `This formula returns text ("${raw.slice(0, 20)}") but the return type is Boolean. Change the return type to Text, or use a comparison expression (e.g. {Col} > 0).`,
          );
        }
      }
      // returnType === "text": permissive — any value stringifies
    } catch {
      // Dry-run failures (e.g. division by zero) are non-fatal
    }
  }

  return errors;
}

function friendlyParseError(msg: string): string {
  if (msg.includes("Unexpected token")) {
    const tokenMatch = msg.match(/Unexpected token (.+)/);
    const token = tokenMatch ? ` near "${tokenMatch[1]}"` : "";
    return `Syntax error in formula${token}. Check for missing operators or mismatched parentheses.`;
  }
  if (msg.includes("undefined variable")) {
    return "Unknown variable in formula. Use {ColumnName} syntax to reference columns.";
  }
  if (msg.includes("is not a function")) {
    const fnMatch = msg.match(/(\w+) is not a function/);
    const fn = fnMatch ? ` "${fnMatch[1]}"` : "";
    return `Unknown function${fn}. See the list of supported functions below.`;
  }
  if (msg.includes("Unexpected end")) {
    return "Formula is incomplete. Check that all parentheses are closed.";
  }
  return `Formula error: ${msg}`;
}
