import { describe, it, expect } from "vitest";
import { evaluateFormula, validateFormula, isFormulaError, FORMULA_ERROR_KEY } from "../formula";
import type { TableColumnData, TableCellData } from "../types";

function makeColumn(id: string, name: string, type: string): TableColumnData {
  return {
    id,
    name,
    type: type as TableColumnData["type"],
    position: 0,
    config: {},
    aggregation: null,
    width: 160,
  };
}

function makeCell(columnId: string, value: unknown): TableCellData {
  return {
    row_id: "row1",
    column_id: columnId,
    value: value as TableCellData["value"],
  };
}

describe("evaluateFormula", () => {
  const priceCol = makeColumn("price", "Price", "number");
  const qtyCol = makeColumn("qty", "Qty", "number");
  const nameCol = makeColumn("name", "Name", "text");
  const activeCol = makeColumn("active", "Active", "checkbox");
  const dateCol = makeColumn("date", "Date", "date");

  const allColumns = [priceCol, qtyCol, nameCol, activeCol, dateCol];

  describe("basic arithmetic operators", () => {
    it("adds two columns", () => {
      const cells = [makeCell("price", 10), makeCell("qty", 5)];
      const result = evaluateFormula("{Price} + {Qty}", cells, allColumns, "number");
      expect(result.value).toBe(15);
      expect(result.error).toBeUndefined();
    });

    it("subtracts", () => {
      const cells = [makeCell("price", 100), makeCell("qty", 30)];
      const result = evaluateFormula("{Price} - {Qty}", cells, allColumns, "number");
      expect(result.value).toBe(70);
    });

    it("multiplies", () => {
      const cells = [makeCell("price", 5), makeCell("qty", 4)];
      const result = evaluateFormula("{Price} * {Qty}", cells, allColumns, "number");
      expect(result.value).toBe(20);
    });

    it("divides", () => {
      const cells = [makeCell("price", 10), makeCell("qty", 4)];
      const result = evaluateFormula("{Price} / {Qty}", cells, allColumns, "number");
      expect(result.value).toBe(2.5);
    });

    it("modulo", () => {
      const cells = [makeCell("price", 10), makeCell("qty", 3)];
      const result = evaluateFormula("{Price} % {Qty}", cells, allColumns, "number");
      expect(result.value).toBe(1);
    });
  });

  describe("comparison operators", () => {
    it("equals (==)", () => {
      const cells = [makeCell("price", 10)];
      const result = evaluateFormula("{Price} == 10", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("not equals (!=)", () => {
      const cells = [makeCell("price", 5)];
      const result = evaluateFormula("{Price} != 10", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("greater than (>)", () => {
      const cells = [makeCell("price", 15)];
      const result = evaluateFormula("{Price} > 10", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("less than (<)", () => {
      const cells = [makeCell("price", 5)];
      const result = evaluateFormula("{Price} < 10", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("greater than or equal (>=)", () => {
      const cells = [makeCell("price", 10)];
      const result = evaluateFormula("{Price} >= 10", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("less than or equal (<=)", () => {
      const cells = [makeCell("price", 10)];
      const result = evaluateFormula("{Price} <= 10", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });
  });

  describe("logical operators", () => {
    it("AND (&&)", () => {
      const cells = [makeCell("price", 10), makeCell("qty", 5)];
      const result = evaluateFormula("{Price} > 5 && {Qty} > 3", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("OR (||)", () => {
      const cells = [makeCell("price", 3), makeCell("qty", 5)];
      const result = evaluateFormula("{Price} > 5 || {Qty} > 3", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("NOT (!)", () => {
      const cells = [makeCell("active", false)];
      const result = evaluateFormula("!{Active}", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });
  });

  describe("custom functions", () => {
    it("IF — true branch", () => {
      const cells = [makeCell("price", 10)];
      const result = evaluateFormula(
        'IF({Price} > 5, "expensive", "cheap")',
        cells,
        allColumns,
        "text",
      );
      expect(result.value).toBe("expensive");
    });

    it("IF — false branch", () => {
      const cells = [makeCell("price", 2)];
      const result = evaluateFormula(
        'IF({Price} > 5, "expensive", "cheap")',
        cells,
        allColumns,
        "text",
      );
      expect(result.value).toBe("cheap");
    });

    it("CONCAT", () => {
      const cells = [makeCell("name", "World")];
      const result = evaluateFormula('CONCAT("Hello ", {Name})', cells, allColumns, "text");
      expect(result.value).toBe("Hello World");
    });

    it("ROUND", () => {
      const cells = [makeCell("price", 3.14159)];
      const result = evaluateFormula("ROUND({Price}, 2)", cells, allColumns, "number");
      expect(result.value).toBe(3.14);
    });

    it("ABS negative", () => {
      const cells = [makeCell("price", -42)];
      const result = evaluateFormula("ABS({Price})", cells, allColumns, "number");
      expect(result.value).toBe(42);
    });

    it("MIN", () => {
      const cells = [makeCell("price", 5), makeCell("qty", 3)];
      const result = evaluateFormula("MIN({Price}, {Qty})", cells, allColumns, "number");
      expect(result.value).toBe(3);
    });

    it("MAX", () => {
      const cells = [makeCell("price", 5), makeCell("qty", 3)];
      const result = evaluateFormula("MAX({Price}, {Qty})", cells, allColumns, "number");
      expect(result.value).toBe(5);
    });

    it("LEN", () => {
      const cells = [makeCell("name", "Hello")];
      const result = evaluateFormula("LEN({Name})", cells, allColumns, "number");
      expect(result.value).toBe(5);
    });

    it("UPPER", () => {
      const cells = [makeCell("name", "hello")];
      const result = evaluateFormula("UPPER({Name})", cells, allColumns, "text");
      expect(result.value).toBe("HELLO");
    });

    it("LOWER", () => {
      const cells = [makeCell("name", "WORLD")];
      const result = evaluateFormula("LOWER({Name})", cells, allColumns, "text");
      expect(result.value).toBe("world");
    });

    it("DAYS_BETWEEN", () => {
      const cells = [makeCell("date", "2024-01-01"), makeCell("qty", 0)];
      const result = evaluateFormula(
        'DAYS_BETWEEN({Date}, "2024-01-11")',
        cells,
        allColumns,
        "number",
      );
      expect(result.value).toBe(10);
    });

    it("NOW returns a date-ish value", () => {
      const cells: TableCellData[] = [];
      const result = evaluateFormula("NOW()", cells, allColumns, "date");
      expect(result.error).toBeUndefined();
      expect(typeof result.value === "string").toBe(true);
    });
  });

  describe("return types", () => {
    it("coerces to number", () => {
      const cells = [makeCell("price", 3.7)];
      const result = evaluateFormula("{Price}", cells, allColumns, "number");
      expect(typeof result.value).toBe("number");
      expect(result.value).toBe(3.7);
    });

    it("coerces to text", () => {
      const cells = [makeCell("price", 42)];
      const result = evaluateFormula("{Price}", cells, allColumns, "text");
      expect(typeof result.value).toBe("string");
      expect(result.value).toBe("42");
    });

    it("coerces to boolean", () => {
      const cells = [makeCell("price", 1)];
      const result = evaluateFormula("{Price}", cells, allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("coerces to date", () => {
      const cells = [makeCell("date", "2024-03-15T00:00:00.000Z")];
      const result = evaluateFormula("{Date}", cells, allColumns, "date");
      expect(typeof result.value).toBe("string");
      expect((result.value as string).startsWith("2024")).toBe(true);
    });
  });

  describe("#ERROR path", () => {
    it("unknown column reference returns formula error", () => {
      const cells: TableCellData[] = [];
      const result = evaluateFormula("{NonExistent}", cells, allColumns, "number");
      expect(isFormulaError(result.value)).toBe(true);
      expect(result.error).toBeDefined();
    });

    it("syntax error returns formula error", () => {
      const cells: TableCellData[] = [];
      const result = evaluateFormula("{Price} +++", cells, allColumns, "number");
      expect(isFormulaError(result.value)).toBe(true);
      expect(result.error).toBeDefined();
    });

    it("isFormulaError correctly identifies error values", () => {
      expect(isFormulaError({ [FORMULA_ERROR_KEY]: "something went wrong" })).toBe(true);
      expect(isFormulaError(null)).toBe(false);
      expect(isFormulaError(42)).toBe(false);
      expect(isFormulaError("text")).toBe(false);
    });

    it("unsupported function returns formula error", () => {
      const cells: TableCellData[] = [];
      const result = evaluateFormula("sin(1)", cells, allColumns, "number");
      expect(isFormulaError(result.value)).toBe(true);
      expect(result.error).toMatch(/sin/);
    });
  });

  describe("WP2 coverage gaps", () => {
    it("literal arithmetic without column refs", () => {
      const result = evaluateFormula("2 + 3", [], allColumns, "number");
      expect(result.value).toBe(5);
      expect(result.error).toBeUndefined();
    });

    it("operator precedence: multiplication before addition", () => {
      const result = evaluateFormula("2 + 3 * 4", [], allColumns, "number");
      expect(result.value).toBe(14);
    });

    it("parenthesis overrides operator precedence", () => {
      const result = evaluateFormula("(2 + 3) * 4", [], allColumns, "number");
      expect(result.value).toBe(20);
    });

    it("null cell value coerces to 0 for number columns", () => {
      const cells: TableCellData[] = [];
      const result = evaluateFormula("{Price} + 10", cells, allColumns, "number");
      expect(result.value).toBe(10);
    });

    it("null cell value coerces to empty string for text columns", () => {
      const cells: TableCellData[] = [];
      const result = evaluateFormula('CONCAT({Name}, "!")', cells, allColumns, "text");
      expect(result.value).toBe("!");
    });

    it("nested function calls: ABS inside ROUND", () => {
      const cells = [makeCell("price", -3.7)];
      const result = evaluateFormula("ROUND(ABS({Price}), 0)", cells, allColumns, "number");
      expect(result.value).toBe(4);
    });

    it("division by zero coerces Infinity to null for number return", () => {
      const cells = [makeCell("price", 1), makeCell("qty", 0)];
      const result = evaluateFormula("{Price} / {Qty}", cells, allColumns, "number");
      // mathjs returns Infinity; Number.isFinite(Infinity) is false → null
      expect(result.value).toBeNull();
    });

    it("string literal expression without column refs", () => {
      const result = evaluateFormula('"hello"', [], allColumns, "text");
      expect(result.value).toBe("hello");
    });

    it("boolean comparison literal", () => {
      const result = evaluateFormula("5 > 3", [], allColumns, "boolean");
      expect(result.value).toBe(true);
    });

    it("IF with literal condition", () => {
      const result = evaluateFormula('IF(1 > 0, "yes", "no")', [], allColumns, "text");
      expect(result.value).toBe("yes");
    });
  });
});

describe("validateFormula", () => {
  const columns = [
    { id: "col1", name: "Revenue", type: "number", config: {} },
    { id: "col2", name: "Cost", type: "number", config: {} },
    {
      id: "col3",
      name: "Profit",
      type: "formula",
      config: { expression: "{Revenue} - {Cost}", return_type: "number" },
    },
  ];

  it("passes for a valid expression", () => {
    const errors = validateFormula("{Revenue} - {Cost}", "number", columns, "col3");
    expect(errors).toHaveLength(0);
  });

  it("fails for empty expression", () => {
    const errors = validateFormula("", "number", columns);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("fails for unknown column reference", () => {
    const errors = validateFormula("{NoSuchCol}", "number", columns);
    expect(errors.some((e) => e.includes("NoSuchCol"))).toBe(true);
  });

  it("fails for self-reference", () => {
    const errors = validateFormula("{Profit}", "number", columns, "col3");
    expect(errors.some((e) => e.toLowerCase().includes("self"))).toBe(true);
  });

  it("detects circular reference", () => {
    const circularColumns = [
      { id: "a", name: "A", type: "formula", config: { expression: "{B}", return_type: "number" } },
      { id: "b", name: "B", type: "formula", config: { expression: "{A}", return_type: "number" } },
    ];
    const errors = validateFormula("{B}", "number", circularColumns, "a");
    expect(errors.some((e) => e.toLowerCase().includes("circular"))).toBe(true);
  });

  it("fails for syntax error", () => {
    const errors = validateFormula("((( unclosed", "number", columns);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("fails for invalid return type", () => {
    const errors = validateFormula("{Revenue}", "invalid_type", columns);
    expect(errors.some((e) => e.toLowerCase().includes("return type"))).toBe(true);
  });
});
