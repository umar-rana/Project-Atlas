import "server-only";
// Dependency surgery — H-DEP-1 (high-severity advisory, see audit-reports/atlas-audit-2026-05-07.md):
// The previous formula evaluator was replaced with mathjs (actively maintained, MIT).
// formula.ts is server-only, so mathjs adds ~0 KB to any client chunk.
// Server bundle delta: previous evaluator ~15 KB gzipped → mathjs ~85 KB gzipped (server only).
// Security: import and createUnit are disabled on the shared instance; evaluation is
// performed via math.parse().compile().evaluate(scope) so the instance-level evaluate
// override cannot be triggered from within a user formula. Only Atlas-defined functions
// are permitted — an AST walker rejects any other function call before evaluation.
import { create, all } from "mathjs";
import type { MathNode } from "mathjs";
import type { CellValue, ColumnType, TableColumnData, TableCellData } from "./types";
import {
  type FormulaReturnType,
  type FormulaErrorValue,
  FORMULA_ERROR_KEY,
  isFormulaError as _isFormulaError,
} from "./formula-shared";
import { createLogger } from "@/lib/logger";

const log = createLogger({ module: "formula" });

export type { FormulaReturnType };
export type { FormulaErrorValue };
export { FORMULA_ERROR_KEY };
export { _isFormulaError as isFormulaError };
export { extractColumnRefs };

export interface FormulaResult {
  value: CellValue | FormulaErrorValue;
  error?: string;
}

// ─── mathjs instance ──────────────────────────────────────────────────────────

const math = create(all!, {});

// Disable dangerous built-ins that could modify the instance or load arbitrary code.
// Only import and createUnit are overridden here; evaluate/parse remain accessible
// so that math.parse().compile().evaluate() works correctly in our implementation.
math.import(
  {
    // ── Security overrides ───────────────────────────────────────────────────
    import: (): never => {
      throw new Error("Function import is disabled in Atlas formulas");
    },
    createUnit: (): never => {
      throw new Error("Function createUnit is disabled in Atlas formulas");
    },

    // ── Atlas custom functions ───────────────────────────────────────────────
    IF(cond: unknown, ifTrue: unknown, ifFalse: unknown): unknown {
      return cond ? ifTrue : ifFalse;
    },

    CONCAT(...args: unknown[]): string {
      return args.map((a) => (a === null || a === undefined ? "" : String(a))).join("");
    },

    ROUND(n: unknown, decimals?: unknown): number {
      const num = Number(n);
      if (isNaN(num)) return 0;
      const d = decimals !== undefined ? Number(decimals) : 0;
      const factor = Math.pow(10, isNaN(d) ? 0 : d);
      return Math.round(num * factor) / factor;
    },

    ABS(n: unknown): number {
      return Math.abs(Number(n));
    },

    MIN(...args: unknown[]): number | null {
      const nums = args.map(Number).filter((n) => !isNaN(n));
      return nums.length === 0 ? null : Math.min(...nums);
    },

    MAX(...args: unknown[]): number | null {
      const nums = args.map(Number).filter((n) => !isNaN(n));
      return nums.length === 0 ? null : Math.max(...nums);
    },

    DAYS_BETWEEN(a: unknown, b: unknown): number | null {
      const dateA = a instanceof Date ? a : new Date(String(a));
      const dateB = b instanceof Date ? b : new Date(String(b));
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return null;
      return Math.round((dateB.getTime() - dateA.getTime()) / 86400000);
    },

    NOW(): Date {
      return new Date();
    },

    LEN(s: unknown): number {
      if (s === null || s === undefined) return 0;
      return String(s).length;
    },

    UPPER(s: unknown): string {
      if (s === null || s === undefined) return "";
      return String(s).toUpperCase();
    },

    LOWER(s: unknown): string {
      if (s === null || s === undefined) return "";
      return String(s).toLowerCase();
    },
  } as Record<string, unknown>,
  { override: true },
);

// ─── Atlas function allowlist ─────────────────────────────────────────────────

const ATLAS_FUNCTIONS = new Set([
  "IF",
  "CONCAT",
  "ROUND",
  "ABS",
  "MIN",
  "MAX",
  "DAYS_BETWEEN",
  "NOW",
  "LEN",
  "UPPER",
  "LOWER",
]);

/**
 * Walk the parsed AST and throw if any function call is not in the Atlas allowlist.
 * Arithmetic and comparison operators are OperatorNodes (not FunctionNodes) and
 * are always permitted.
 */
function assertOnlyAtlasFunctions(tree: MathNode): void {
  const fnNodes = tree.filter((node: MathNode) => node.type === "FunctionNode");
  for (const node of fnNodes) {
    const name = (node as MathNode & { name: string }).name;
    if (!ATLAS_FUNCTIONS.has(name)) {
      throw new Error(
        `Function "${name}" is not supported in Atlas formulas. ` +
          `Supported functions: ${[...ATLAS_FUNCTIONS].join(", ")}.`,
      );
    }
  }
}

// ─── Expression pre-processing ────────────────────────────────────────────────

// mathjs uses `and`/`or`/`not` keywords; map JS-style logical operators to them.
// The ! replacement skips occurrences inside quoted string literals so that
// expressions like CONCAT({Name}, "!") are not mangled.
function normalizeExpression(expression: string): string {
  return expression
    .replace(/&&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/"[^"]*"|'[^']*'|(!(?!=))/g, (match, notOp?: string) =>
      notOp !== undefined ? " not " : match,
    );
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

// Replace {ColumnName} tokens with safe variable names for mathjs
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
      return Number.isFinite(n) ? n : null;
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
      { columnId: col.id },
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
 * Optional context (columnId, tableId) is included in error logs when provided.
 */
export function evaluateFormula(
  expression: string,
  rowCells: TableCellData[],
  allColumns: TableColumnData[],
  returnType: FormulaReturnType,
  decimals?: number,
  context?: { columnId?: string; tableId?: string },
): FormulaResult {
  try {
    const { processed, tokenMap } = tokenizeExpression(expression);
    const normalized = normalizeExpression(processed);

    // Build variables map — plain Record<string, unknown> (mathjs scope)
    const vars: Record<string, unknown> = {};
    for (const [colName, varName] of tokenMap) {
      const col = allColumns.find((c) => c.name === colName);
      if (!col) {
        return {
          value: { [FORMULA_ERROR_KEY]: `Column "${colName}" not found` },
          error: `Column "${colName}" not found`,
        };
      }
      const cell = rowCells.find((c) => c.column_id === col.id);
      // Map null→0, true→1, false→0 for consistent numeric arithmetic
      const coerced = coerceForColumn(col.type as ColumnType, cell?.value ?? null);
      vars[varName] = coerced === null ? 0 : coerced === true ? 1 : coerced === false ? 0 : coerced;
    }

    // Parse, validate function surface, then compile+evaluate
    const tree = math.parse(normalized);
    assertOnlyAtlasFunctions(tree);
    const raw: unknown = tree.compile().evaluate(vars);
    const value = coerceResult(raw, returnType, decimals);

    return { value };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(
      {
        formula_eval_error: true,
        expression: expression.slice(0, 200),
        error: msg,
        ...(context?.columnId !== undefined && { column_id: context.columnId }),
        ...(context?.tableId !== undefined && { table_id: context.tableId }),
      },
      "Formula evaluation failed",
    );
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

  // 1. Parse expression (syntax check) and validate function surface
  let parseOk = false;
  try {
    const { processed } = tokenizeExpression(expression);
    const normalized = normalizeExpression(processed);
    const tree = math.parse(normalized);
    assertOnlyAtlasFunctions(tree);
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
      const dummyVars: Record<string, unknown> = {};
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
      const raw: unknown = math.parse(normalized).compile().evaluate(dummyVars);

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(
        { formula_validate_warn: true, expression: expression.slice(0, 200), error: msg },
        "Formula validation dry-run failed (non-fatal)",
      );
      // Dry-run failures (e.g. division by zero) are non-fatal
    }
  }

  return errors;
}

function friendlyParseError(msg: string): string {
  if (
    msg.includes("Unexpected token") ||
    msg.includes("SyntaxError") ||
    msg.includes("Parenthesis") ||
    msg.includes("parenthesis")
  ) {
    const tokenMatch = msg.match(/Unexpected token (.+)/);
    const token = tokenMatch ? ` near "${tokenMatch[1]}"` : "";
    return `Syntax error in formula${token}. Check for missing operators or mismatched parentheses.`;
  }
  if (msg.includes("Undefined symbol") || msg.includes("undefined variable")) {
    return "Unknown variable in formula. Use {ColumnName} syntax to reference columns.";
  }
  if (msg.includes("is not supported in Atlas formulas")) {
    return msg;
  }
  if (msg.includes("is not a function") || msg.includes("is not defined")) {
    const fnMatch = msg.match(/(\w+) is not/);
    const fn = fnMatch ? ` "${fnMatch[1]}"` : "";
    return `Unknown function${fn}. See the list of supported functions below.`;
  }
  if (
    msg.includes("End of expression") ||
    msg.includes("end of expression") ||
    msg.includes("Unexpected end")
  ) {
    return "Formula is incomplete. Check that all parentheses are closed.";
  }
  return `Formula error: ${msg}`;
}
