import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import { POST } from "@/app/api/convert/import-table/route";
import { auth } from "@clerk/nextjs/server";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(/^'+|'+$/g, "");
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

const createdUserIds: string[] = [];

async function createEndpointTestUser(): Promise<{ id: string; clerk_id: string }> {
  const userId = uuidv7();
  const clerkId = `test_endpoint_${userId}`;
  await rawDb.user.create({
    data: {
      id: userId,
      clerk_id: clerkId,
      email: `csv-endpoint-${userId}@atlas.test`,
      name: "CSV Endpoint Test User",
    },
  });
  createdUserIds.push(userId);
  return { id: userId, clerk_id: clerkId };
}

beforeAll(async () => {
  await rawDb.$connect();
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${userId}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "TableCell" WHERE row_id IN (SELECT id FROM "TableRow" WHERE table_id IN (SELECT id FROM "Table" WHERE user_id = ${userId}::uuid))`;
    await rawDb.$executeRaw`DELETE FROM "TableRow" WHERE table_id IN (SELECT id FROM "Table" WHERE user_id = ${userId}::uuid)`;
    await rawDb.$executeRaw`DELETE FROM "TableColumn" WHERE table_id IN (SELECT id FROM "Table" WHERE user_id = ${userId}::uuid)`;
    await rawDb.$executeRaw`DELETE FROM "Table" WHERE user_id = ${userId}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${userId}::uuid`;
  }
  await rawDb.$disconnect();
});

function makeRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/api/convert/import-table", {
    method: "POST",
    body: formData,
  });
}

function csvFormData(opts: {
  csvText: string;
  tableName?: string;
  columns?: string;
  fileName?: string;
}): FormData {
  const fd = new FormData();
  const blob = new Blob([opts.csvText], { type: "text/csv" });
  fd.append("file", blob, opts.fileName ?? "test.csv");
  if (opts.tableName !== undefined) fd.append("table_name", opts.tableName);
  if (opts.columns !== undefined) fd.append("columns", opts.columns);
  return fd;
}

describe("POST /api/convert/import-table — auth", () => {
  it("returns 401 when not signed in", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as never);
    const fd = csvFormData({ csvText: "name\nAlice", tableName: "T" });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/convert/import-table — validation", () => {
  it("returns 400 when no file is attached", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValueOnce({ userId: user.clerk_id } as never);
    const fd = new FormData();
    fd.append("table_name", "T");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/no csv file/i);
  });

  it("returns 400 when CSV has no data rows", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValueOnce({ userId: user.clerk_id } as never);
    const fd = csvFormData({ csvText: "Name,Score\n", tableName: "T" });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/no data rows/i);
  });

  it("returns 400 for a CSV with > 50 columns", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValueOnce({ userId: user.clerk_id } as never);
    const headers = Array.from({ length: 51 }, (_, i) => `col${i}`).join(",");
    const dataRow = Array.from({ length: 51 }, () => "x").join(",");
    const csvText = `${headers}\n${dataRow}`;
    const fd = csvFormData({ csvText, tableName: "T" });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/too many columns/i);
  });

  it("returns 400 for a file larger than 10 MB", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValueOnce({ userId: user.clerk_id } as never);
    const large = "a".repeat(10 * 1024 * 1024 + 1);
    const fd = new FormData();
    const blob = new Blob([large], { type: "text/csv" });
    fd.append("file", blob, "big.csv");
    fd.append("table_name", "T");
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/too large/i);
  });

  it("returns 400 when table_name is missing", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValueOnce({ userId: user.clerk_id } as never);
    const fd = csvFormData({ csvText: "Name\nAlice" });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/table_name/i);
  });
});

describe("POST /api/convert/import-table — server-side type detection", () => {
  it("detects column types when columns param is omitted", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValueOnce({ userId: user.clerk_id } as never);
    const fd = csvFormData({
      csvText: "Name,Score,Active\nAlice,95,true\nBob,80,false",
      tableName: "Auto Detect",
    });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const json = await res.json() as { table_id: string; imported_row_count: number; failed_cell_count: number };
    expect(json.imported_row_count).toBe(2);
    expect(json.failed_cell_count).toBe(0);

    const cols = await rawDb.tableColumn.findMany({
      where: { table_id: json.table_id },
      orderBy: { position: "asc" },
    });
    expect(cols).toHaveLength(3);
    expect(cols[0]!.name).toBe("Name");
    expect(cols[0]!.type).toBe("text");
    expect(cols[1]!.name).toBe("Score");
    expect(cols[1]!.type).toBe("number");
    expect(cols[2]!.name).toBe("Active");
    expect(cols[2]!.type).toBe("checkbox");
  });
});

describe("POST /api/convert/import-table — rate limit", () => {
  it("returns 429 after 5 successful imports per minute", async () => {
    const user = await createEndpointTestUser();
    vi.mocked(auth).mockResolvedValue({ userId: user.clerk_id } as never);

    const fd = () => csvFormData({
      csvText: "Name\nAlice",
      tableName: "RL Table",
    });

    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest(fd()));
      expect(res.status).toBe(200);
    }

    const blocked = await POST(makeRequest(fd()));
    expect(blocked.status).toBe(429);
    const json = await blocked.json() as { error: string };
    expect(json.error).toMatch(/too many/i);

    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
  });
});
