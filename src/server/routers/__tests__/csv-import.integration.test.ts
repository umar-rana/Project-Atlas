import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import type { User } from "@prisma/client";
import { tablesRouter } from "@/server/routers/tables";
import {
  detectColumnType,
  detectCheckbox,
  detectNumber,
  detectCurrency,
  detectDate,
  detectMultiSelect,
  detectSingleSelect,
  detectColumns,
  extractSelectOptions,
  coerceCheckbox,
  coerceNumber,
  coerceCurrency,
  coerceDate,
} from "@/core/tables/csv-type-detect";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(/^'+|'+$/g, "");
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

const createdUserIds: string[] = [];

async function createTestUser(): Promise<User> {
  const userId = uuidv7();
  const user = await rawDb.user.create({
    data: {
      id: userId,
      clerk_id: `test_csv_${userId}`,
      email: `csv-import-${userId}@atlas.test`,
      name: "CSV Import Test User",
    },
  });
  createdUserIds.push(userId);
  return user;
}

async function cleanupUser(userId: string): Promise<void> {
  await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${userId}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "TableCell" WHERE row_id IN (SELECT id FROM "TableRow" WHERE table_id IN (SELECT id FROM "Table" WHERE user_id = ${userId}::uuid))`;
  await rawDb.$executeRaw`DELETE FROM "TableRow" WHERE table_id IN (SELECT id FROM "Table" WHERE user_id = ${userId}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "TableColumn" WHERE table_id IN (SELECT id FROM "Table" WHERE user_id = ${userId}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "Table" WHERE user_id = ${userId}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${userId}::uuid`;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await cleanupUser(id);
  }
  await rawDb.$disconnect();
});

// ─── Type detection unit tests ────────────────────────────────────────────────

describe("csv-type-detect: detectCheckbox", () => {
  it("detects TRUE/FALSE values", () => {
    expect(detectCheckbox(["true", "false", "yes", "no"])).toBe(true);
  });
  it("rejects mixed non-boolean values", () => {
    expect(detectCheckbox(["true", "maybe", "yes"])).toBe(false);
  });
  it("returns false for empty array", () => {
    expect(detectCheckbox([])).toBe(false);
  });
});

describe("csv-type-detect: detectNumber", () => {
  it("detects numeric strings", () => {
    expect(detectNumber(["1", "2.5", "1,000", "0"])).toBe(true);
  });
  it("rejects non-numeric strings", () => {
    expect(detectNumber(["1", "two", "3"])).toBe(false);
  });
  it("accepts empty cells", () => {
    expect(detectNumber(["", "1", "2"])).toBe(true);
  });
});

describe("csv-type-detect: detectCurrency", () => {
  it("detects currency-prefixed values", () => {
    expect(detectCurrency(["$10", "€20.50", "£5"])).toBe(true);
  });
  it("rejects plain numbers", () => {
    expect(detectCurrency(["10", "20"])).toBe(false);
  });
});

describe("csv-type-detect: detectDate", () => {
  it("detects ISO date strings", () => {
    expect(detectDate(["2024-01-01", "2024-12-31"])).toBe(true);
  });
  it("rejects pure numbers as dates", () => {
    expect(detectDate(["123", "456"])).toBe(false);
  });
  it("rejects non-dates", () => {
    expect(detectDate(["not a date", "foo"])).toBe(false);
  });
});

describe("csv-type-detect: detectMultiSelect", () => {
  it("detects pipe-separated values with repeated terms", () => {
    expect(detectMultiSelect(["red|blue", "blue|green", "red|green"])).toBe(true);
  });
  it("detects comma-separated values with repeated terms", () => {
    expect(detectMultiSelect(["red,blue", "blue,green", "red,green"])).toBe(true);
  });
  it("rejects values without any separators", () => {
    expect(detectMultiSelect(["red", "blue", "green"])).toBe(false);
  });
  it("rejects all-unique vocabulary", () => {
    expect(detectMultiSelect(["a|b", "c|d", "e|f"])).toBe(false);
  });
});

describe("csv-type-detect: detectSingleSelect", () => {
  it("detects low-cardinality repeated values", () => {
    expect(detectSingleSelect(["active", "inactive", "active", "pending", "active"])).toBe(true);
  });
  it("rejects all-unique values", () => {
    expect(detectSingleSelect(["a", "b", "c", "d", "e", "f"])).toBe(false);
  });
  it("rejects single-value column", () => {
    expect(detectSingleSelect(["only"])).toBe(false);
  });
});

describe("csv-type-detect: detectColumnType fallback", () => {
  it("falls back to text for mixed/unrecognized content", () => {
    expect(detectColumnType(["hello world", "foo bar", "baz"])).toBe("text");
  });
  it("detects number", () => {
    expect(detectColumnType(["1", "2", "3"])).toBe("number");
  });
  it("detects checkbox", () => {
    expect(detectColumnType(["yes", "no", "yes"])).toBe("checkbox");
  });
  it("detects date", () => {
    expect(detectColumnType(["2024-01-01", "2024-06-15"])).toBe("date");
  });
  it("detects single_select", () => {
    expect(detectColumnType(["A", "B", "A", "C", "B"])).toBe("single_select");
  });
  it("detects multi_select", () => {
    expect(detectColumnType(["tag1|tag2", "tag2|tag3", "tag1|tag3"])).toBe("multi_select");
  });
});

describe("csv-type-detect: detectColumns", () => {
  it("detects types for multiple columns", () => {
    const headers = ["Name", "Score", "Active"];
    const rows = [
      ["Alice", "95", "true"],
      ["Bob", "87", "false"],
    ];
    const cols = detectColumns(headers, rows);
    expect(cols[0]).toEqual({ name: "Name", type: "text" });
    expect(cols[1]).toEqual({ name: "Score", type: "number" });
    expect(cols[2]).toEqual({ name: "Active", type: "checkbox" });
  });
});

describe("csv-type-detect: extractSelectOptions", () => {
  it("extracts unique options for single_select", () => {
    const opts = extractSelectOptions(["Red", "Blue", "Red", "Green"], "single_select");
    expect(opts).toEqual(["Red", "Blue", "Green"]);
  });
  it("extracts pipe-separated options for multi_select", () => {
    const opts = extractSelectOptions(["tag1|tag2", "tag2|tag3", "tag1"], "multi_select");
    expect(opts).toContain("tag1");
    expect(opts).toContain("tag2");
    expect(opts).toContain("tag3");
  });
  it("extracts comma-separated options for multi_select", () => {
    const opts = extractSelectOptions(["red,blue", "blue,green", "red"], "multi_select");
    expect(opts).toContain("red");
    expect(opts).toContain("blue");
    expect(opts).toContain("green");
    expect(opts).toHaveLength(3);
  });
});

describe("csv-type-detect: coercion helpers", () => {
  it("coerceCheckbox handles truthy/falsy", () => {
    expect(coerceCheckbox("yes")).toBe(true);
    expect(coerceCheckbox("NO")).toBe(false);
    expect(coerceCheckbox("maybe")).toBeNull();
  });
  it("coerceNumber handles formatted numbers", () => {
    expect(coerceNumber("1,234.56")).toBeCloseTo(1234.56);
    expect(coerceNumber("not a number")).toBeNull();
  });
  it("coerceCurrency strips currency symbols", () => {
    expect(coerceCurrency("$1,234.56")).toBeCloseTo(1234.56);
    expect(coerceCurrency("€99.99")).toBeCloseTo(99.99);
  });
  it("coerceDate returns ISO string or null", () => {
    const d = coerceDate("2024-03-15");
    expect(d).not.toBeNull();
    expect(new Date(d!).getFullYear()).toBe(2024);
    expect(coerceDate("not a date")).toBeNull();
  });
});

// ─── Integration tests ────────────────────────────────────────────────────────

describe("tables.importFromCsv — validation", () => {
  it("rejects empty rows array", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });
    await expect(
      caller.importFromCsv({
        table_name: "Empty",
        columns: [{ name: "Name", type: "text" }],
        rows: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects too many rows (> 10,000)", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });
    const rows = Array.from({ length: 10_001 }, (_, i) => [`row-${i}`]);
    await expect(
      caller.importFromCsv({
        table_name: "TooManyRows",
        columns: [{ name: "Name", type: "text" }],
        rows,
      }),
    ).rejects.toBeDefined();
  });

  it("rejects too many columns (> 50)", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });
    const columns = Array.from({ length: 51 }, (_, i) => ({
      name: `col${i}`,
      type: "text" as const,
    }));
    await expect(
      caller.importFromCsv({
        table_name: "TooManyCols",
        columns,
        rows: [Array.from({ length: 51 }, () => "val")],
      }),
    ).rejects.toBeDefined();
  });
});

describe("tables.importFromCsv — successful import", () => {
  it("imports a basic text-only CSV", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });

    const result = await caller.importFromCsv({
      table_name: "Basic Import",
      columns: [
        { name: "Name", type: "text" },
        { name: "City", type: "text" },
      ],
      rows: [
        ["Alice", "London"],
        ["Bob", "Paris"],
        ["Carol", "Berlin"],
      ],
    });
    expect(result.imported_row_count).toBe(3);
    expect(result.failed_cell_count).toBe(0);
    expect(result.table_id).toBeTruthy();

    const table = await rawDb.table.findUnique({ where: { id: result.table_id } });
    expect(table?.name).toBe("Basic Import");
    expect(table?.user_id).toBe(user.id);

    const cols = await rawDb.tableColumn.findMany({
      where: { table_id: result.table_id },
      orderBy: { position: "asc" },
    });
    expect(cols).toHaveLength(2);
    expect(cols[0]!.name).toBe("Name");
    expect(cols[1]!.name).toBe("City");

    const rows = await rawDb.tableRow.findMany({
      where: { table_id: result.table_id },
      orderBy: { position: "asc" },
    });
    expect(rows).toHaveLength(3);

    const cells = await rawDb.tableCell.findMany({
      where: { row_id: { in: rows.map((r) => r.id) } },
    });
    expect(cells).toHaveLength(6);
  });

  it("imports CSV with all column types", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });

    const result = await caller.importFromCsv({
      table_name: "All Types",
      columns: [
        { name: "Text", type: "text" },
        { name: "Number", type: "number" },
        { name: "Currency", type: "currency" },
        { name: "Date", type: "date" },
        { name: "Checkbox", type: "checkbox" },
        { name: "Status", type: "single_select" },
        { name: "Tags", type: "multi_select" },
      ],
      rows: [
        ["Hello", "42", "19.99", "2024-01-15", "true", "Active", "red|blue"],
        ["World", "100", "5.50", "2024-06-01", "false", "Inactive", "green"],
      ],
    });
    expect(result.imported_row_count).toBe(2);
    expect(result.failed_cell_count).toBe(0);

    const cols = await rawDb.tableColumn.findMany({
      where: { table_id: result.table_id },
      orderBy: { position: "asc" },
    });
    const singleSelectCol = cols.find((c) => c.name === "Status");
    const multiSelectCol = cols.find((c) => c.name === "Tags");
    expect(singleSelectCol).toBeTruthy();
    expect(multiSelectCol).toBeTruthy();

    const config = singleSelectCol!.config as {
      options?: { id: string; label: string; color: string }[];
    };
    expect(config.options).toHaveLength(2);
    expect(config.options![0]!.label).toBe("Active");
    expect(config.options![0]!.color).toBe("var(--viz-1)");
    expect(config.options![1]!.color).toBe("var(--viz-2)");
  });

  it("reports failed cell count for uncoercible values", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });

    const result = await caller.importFromCsv({
      table_name: "Failed Cells",
      columns: [
        { name: "Name", type: "text" },
        { name: "Score", type: "number" },
        { name: "Active", type: "checkbox" },
      ],
      rows: [
        ["Alice", "95", "true"],
        ["Bob", "not-a-number", "maybe"],
        ["Carol", "77", "false"],
      ],
    });
    expect(result.imported_row_count).toBe(3);
    expect(result.failed_cell_count).toBe(2);
  });

  it("writes audit log entry on success", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });

    const result = await caller.importFromCsv({
      table_name: "Audit Test",
      columns: [{ name: "Col", type: "text" }],
      rows: [["value1"], ["value2"]],
    });

    const auditLog = await rawDb.auditLog.findFirst({
      where: {
        user_id: user.id,
        entity_id: result.table_id,
        action: "table_imported_from_csv",
      },
    });
    expect(auditLog).toBeTruthy();
    expect((auditLog?.meta as { imported_row_count?: number })?.imported_row_count).toBe(2);
  });

  it("assigns fractional positions (1000-based) to rows", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });

    const result = await caller.importFromCsv({
      table_name: "Position Test",
      columns: [{ name: "Name", type: "text" }],
      rows: [["Row A"], ["Row B"], ["Row C"]],
    });

    const rows = await rawDb.tableRow.findMany({
      where: { table_id: result.table_id },
      orderBy: { position: "asc" },
    });
    const positions = rows.map((r) => parseFloat(r.position.toString()));
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(1000);
    expect(positions[2]).toBe(2000);
  });
});

describe("tables.importFromCsv — rate limit", () => {
  it("returns TOO_MANY_REQUESTS after 5 imports per minute for same user", async () => {
    const user = await createTestUser();
    const caller = tablesRouter.createCaller({ user });

    const goodInput = {
      table_name: "Rate Limit Table",
      columns: [{ name: "X", type: "text" as const }],
      rows: [["a"]],
    };

    for (let i = 0; i < 5; i++) {
      await caller.importFromCsv({ ...goodInput, table_name: `RL Table ${i}` });
    }

    await expect(
      caller.importFromCsv({ ...goodInput, table_name: "Should Fail" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
