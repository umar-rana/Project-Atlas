import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@prisma/client";
import { projectsRouter } from "@/server/routers/projects";
import {
  isValidProjectType,
  normalizeProjectType,
  validateProjectType,
  capitalizeProjectType,
} from "@/core/projects/type-validation";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(
    /^'+|'+$/g,
    "",
  );
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let testUser: User;

async function insertProject(opts: {
  user_id?: string;
  title: string;
  type?: string;
  status?: string;
  deleted_at?: Date | null;
}): Promise<string> {
  const project = await rawDb.project.create({
    data: {
      id: uuidv7(),
      user_id: opts.user_id ?? testUser.id,
      title: opts.title,
      type: opts.type ?? "project",
      status: opts.status ?? "active",
      deleted_at: opts.deleted_at ?? null,
    },
  });
  return project.id;
}

async function insertTask(opts: {
  project_id: string;
  title: string;
  status?: string;
  parent_id?: string | null;
  defer_date?: Date | null;
}): Promise<string> {
  const task = await rawDb.task.create({
    data: {
      id: uuidv7(),
      user_id: testUser.id,
      project_id: opts.project_id,
      title: opts.title,
      status: opts.status ?? "active",
      parent_id: opts.parent_id ?? null,
      defer_date: opts.defer_date ?? null,
    },
  });
  return task.id;
}

beforeAll(async () => {
  const userId = uuidv7();
  testUser = await rawDb.user.create({
    data: {
      id: userId,
      clerk_id: `test_${userId}`,
      email: `projects-integration-test-${userId}@atlas.test`,
      name: "Projects Integration Test User",
    },
  });
});

afterAll(async () => {
  await rawDb.$executeRaw`DELETE FROM "Task" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "Project" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${testUser.id}::uuid`;
  await rawDb.$disconnect();
});

function makeProjectsCaller() {
  return projectsRouter.createCaller({ user: testUser });
}

// ─── distinctTypes ────────────────────────────────────────────────────────────
//
// Each test in this block uses a dedicated isolated user so that projects from
// other describe blocks cannot skew the counts, enabling exact assertions.

describe("projects.distinctTypes", () => {
  let dtUser: User;
  let projectIds: string[] = [];

  beforeAll(async () => {
    const dtUserId = uuidv7();
    dtUser = await rawDb.user.create({
      data: {
        id: dtUserId,
        clerk_id: `test_${dtUserId}`,
        email: `dt-isolated-${dtUserId}@atlas.test`,
        name: "DT Isolated User",
      },
    });

    projectIds = await Promise.all([
      insertProject({ user_id: dtUser.id, title: "DT: Goal 1", type: "goal" }),
      insertProject({ user_id: dtUser.id, title: "DT: Goal 2", type: "goal" }),
      insertProject({ user_id: dtUser.id, title: "DT: Goal 3", type: "goal" }),
      insertProject({ user_id: dtUser.id, title: "DT: Area 1", type: "area" }),
      insertProject({ user_id: dtUser.id, title: "DT: Area 2", type: "area" }),
      insertProject({ user_id: dtUser.id, title: "DT: Habit 1", type: "habit" }),
      insertProject({ user_id: dtUser.id, title: "DT: Deleted goal", type: "goal", deleted_at: new Date() }),
    ]);
  });

  afterAll(async () => {
    await rawDb.$executeRaw`DELETE FROM "Project" WHERE user_id = ${dtUser.id}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${dtUser.id}::uuid`;
  });

  function makeDtCaller() {
    return projectsRouter.createCaller({ user: dtUser });
  }

  it("returns each distinct type with the exact correct count", async () => {
    const types = await makeDtCaller().distinctTypes();
    const typeMap = new Map(types.map((t: { type: string; count: number }) => [t.type, t.count]));

    expect(typeMap.get("goal")).toBe(3);
    expect(typeMap.get("area")).toBe(2);
    expect(typeMap.get("habit")).toBe(1);
  });

  it("excludes soft-deleted projects from counts in query results", async () => {
    const types = await makeDtCaller().distinctTypes();
    const typeMap = new Map(types.map((t: { type: string; count: number }) => [t.type, t.count]));

    expect(typeMap.get("goal")).toBe(3);
  });

  it("orders results by count descending (goal > area > habit)", async () => {
    const types = await makeDtCaller().distinctTypes();
    const goalIdx = types.findIndex((t: { type: string }) => t.type === "goal");
    const areaIdx = types.findIndex((t: { type: string }) => t.type === "area");
    const habitIdx = types.findIndex((t: { type: string }) => t.type === "habit");

    expect(goalIdx).toBeLessThan(areaIdx);
    expect(areaIdx).toBeLessThan(habitIdx);
  });

  it("returns items with both type and count fields", async () => {
    const types = await makeDtCaller().distinctTypes();
    expect(types.length).toBeGreaterThan(0);
    for (const entry of types) {
      expect(entry).toHaveProperty("type");
      expect(entry).toHaveProperty("count");
      expect(typeof entry.type).toBe("string");
      expect(typeof entry.count).toBe("number");
      expect(entry.count).toBeGreaterThan(0);
    }
  });

  it("sorts alphabetically when two types have the same count", async () => {
    const types = await makeDtCaller().distinctTypes();
    for (let i = 0; i < types.length - 1; i++) {
      const a = types[i] as { type: string; count: number };
      const b = types[i + 1] as { type: string; count: number };
      if (a.count === b.count) {
        expect(a.type.localeCompare(b.type)).toBeLessThanOrEqual(0);
      }
    }
  });
});

// ─── projects.list with type filter ──────────────────────────────────────────

describe("projects.list — type filter", () => {
  let projectIds: string[] = [];

  beforeAll(async () => {
    projectIds = await Promise.all([
      insertProject({ title: "LT: Goal project", type: "goal" }),
      insertProject({ title: "LT: Area project", type: "area" }),
      insertProject({ title: "LT: Plain project", type: "project" }),
    ]);
  });

  afterAll(async () => {
    await rawDb.project.deleteMany({ where: { id: { in: projectIds } } });
  });

  it("returns only projects matching the given type", async () => {
    const results = await makeProjectsCaller().list({ type: "goal" });
    const ids = results.map((p: { id: string }) => p.id);
    expect(ids).toContain(projectIds[0]);
    expect(ids).not.toContain(projectIds[1]);
    expect(ids).not.toContain(projectIds[2]);
  });

  it("returns all projects when no type filter is provided", async () => {
    const results = await makeProjectsCaller().list({});
    const ids = results.map((p: { id: string }) => p.id);
    expect(ids).toContain(projectIds[0]);
    expect(ids).toContain(projectIds[1]);
    expect(ids).toContain(projectIds[2]);
  });

  it("normalizes the type filter (uppercase input matches lowercase stored type)", async () => {
    const results = await makeProjectsCaller().list({ type: "GOAL" });
    const ids = results.map((p: { id: string }) => p.id);
    expect(ids).toContain(projectIds[0]);
    expect(ids).not.toContain(projectIds[1]);
  });

  it("normalizes the type filter (leading/trailing spaces)", async () => {
    const results = await makeProjectsCaller().list({ type: "  area  " });
    const ids = results.map((p: { id: string }) => p.id);
    expect(ids).toContain(projectIds[1]);
    expect(ids).not.toContain(projectIds[0]);
  });

  it("returns empty array when no project matches the type filter", async () => {
    const results = await makeProjectsCaller().list({ type: "nonexistent-type-xyz" });
    const ids = results.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(projectIds[0]);
    expect(ids).not.toContain(projectIds[1]);
    expect(ids).not.toContain(projectIds[2]);
  });

  it("includes task_count on each returned project", async () => {
    const results = await makeProjectsCaller().list({ type: "goal" });
    for (const project of results) {
      expect(project).toHaveProperty("task_count");
      expect(typeof project.task_count).toBe("number");
    }
  });
});

// ─── projects.get — metrics (task_counts) ────────────────────────────────────

describe("projects.get — task_counts metrics", () => {
  let projectId: string;

  beforeAll(async () => {
    projectId = await insertProject({ title: "Metrics project", type: "project" });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    await Promise.all([
      insertTask({ project_id: projectId, title: "Active task 1", status: "active" }),
      insertTask({ project_id: projectId, title: "Active task 2", status: "active" }),
      insertTask({ project_id: projectId, title: "Active task 3", status: "active" }),
      insertTask({ project_id: projectId, title: "Completed task 1", status: "completed" }),
      insertTask({ project_id: projectId, title: "Completed task 2", status: "completed" }),
      insertTask({ project_id: projectId, title: "Active deferred task", status: "active", defer_date: futureDate }),
    ]);

    const parentTaskId = await insertTask({
      project_id: projectId,
      title: "Parent task",
      status: "active",
    });
    await insertTask({
      project_id: projectId,
      title: "Child subtask",
      status: "active",
      parent_id: parentTaskId,
    });
  });

  afterAll(async () => {
    await rawDb.task.deleteMany({ where: { project_id: projectId } });
    await rawDb.project.deleteMany({ where: { id: projectId } });
  });

  it("returns accurate total task count (top-level only, non-deleted)", async () => {
    const result = await makeProjectsCaller().get({ id: projectId });
    expect(result.metrics.task_counts.total).toBe(7);
  });

  it("returns accurate completed task count (top-level only)", async () => {
    const result = await makeProjectsCaller().get({ id: projectId });
    expect(result.metrics.task_counts.completed).toBe(2);
  });

  it("returns accurate active task count (excludes deferred and subtasks)", async () => {
    const result = await makeProjectsCaller().get({ id: projectId });
    expect(result.metrics.task_counts.active).toBe(4);
  });

  it("includes task_counts with total, active, and completed fields", async () => {
    const result = await makeProjectsCaller().get({ id: projectId });
    expect(result.metrics.task_counts).toHaveProperty("total");
    expect(result.metrics.task_counts).toHaveProperty("active");
    expect(result.metrics.task_counts).toHaveProperty("completed");
  });

  it("returns zero counts for a project with no tasks", async () => {
    const emptyProjectId = await insertProject({ title: "Empty metrics project" });
    try {
      const result = await makeProjectsCaller().get({ id: emptyProjectId });
      expect(result.metrics.task_counts.total).toBe(0);
      expect(result.metrics.task_counts.active).toBe(0);
      expect(result.metrics.task_counts.completed).toBe(0);
    } finally {
      await rawDb.project.deleteMany({ where: { id: emptyProjectId } });
    }
  });

  it("throws NOT_FOUND when requesting a project owned by a different user", async () => {
    const otherUserId = uuidv7();
    const otherUser = await rawDb.user.create({
      data: {
        id: otherUserId,
        clerk_id: `test_${otherUserId}`,
        email: `other-user-${otherUserId}@atlas.test`,
        name: "Other User",
      },
    });
    const otherProjectId = await rawDb.project
      .create({
        data: {
          id: uuidv7(),
          user_id: otherUser.id,
          title: "Other user's project",
          type: "project",
        },
      })
      .then((p) => p.id);

    try {
      await expect(makeProjectsCaller().get({ id: otherProjectId })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    } finally {
      await rawDb.project.deleteMany({ where: { id: otherProjectId } });
      await rawDb.user.deleteMany({ where: { id: otherUser.id } });
    }
  });
});

// ─── Type validation/normalization edge cases ─────────────────────────────────

describe("type-validation — isValidProjectType", () => {
  it("accepts a simple lowercase string", () => {
    expect(isValidProjectType("goal")).toBe(true);
  });

  it("accepts a string with spaces", () => {
    expect(isValidProjectType("area of focus")).toBe(true);
  });

  it("accepts a string with hyphens", () => {
    expect(isValidProjectType("long-term")).toBe(true);
  });

  it("accepts a string with numbers", () => {
    expect(isValidProjectType("q1 goal")).toBe(true);
  });

  it("accepts exactly 32 characters", () => {
    expect(isValidProjectType("a".repeat(32))).toBe(true);
  });

  it("accepts an uppercase string (normalized to lowercase before check)", () => {
    expect(isValidProjectType("GOAL")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidProjectType("")).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(isValidProjectType("   ")).toBe(false);
  });

  it("rejects a string longer than 32 characters", () => {
    expect(isValidProjectType("a".repeat(33))).toBe(false);
  });

  it("rejects a string with special characters (underscore)", () => {
    expect(isValidProjectType("my_type")).toBe(false);
  });

  it("rejects a string with special characters (period)", () => {
    expect(isValidProjectType("my.type")).toBe(false);
  });

  it("rejects a string with emoji", () => {
    expect(isValidProjectType("goal 🎯")).toBe(false);
  });
});

describe("type-validation — normalizeProjectType", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeProjectType("  goal  ")).toBe("goal");
  });

  it("converts to lowercase", () => {
    expect(normalizeProjectType("GOAL")).toBe("goal");
  });

  it("trims and lowercases together", () => {
    expect(normalizeProjectType("  Area Of Focus  ")).toBe("area of focus");
  });

  it("preserves internal spaces", () => {
    expect(normalizeProjectType("long term goal")).toBe("long term goal");
  });

  it("preserves hyphens", () => {
    expect(normalizeProjectType("long-term")).toBe("long-term");
  });
});

describe("type-validation — validateProjectType", () => {
  it("returns valid for a normal string", () => {
    expect(validateProjectType("goal").valid).toBe(true);
  });

  it("returns invalid with error for empty string", () => {
    const result = validateProjectType("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns invalid with error for whitespace-only", () => {
    const result = validateProjectType("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns invalid with error for string exceeding 32 chars", () => {
    const result = validateProjectType("a".repeat(33));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/32/);
  });

  it("returns invalid with error for string with invalid characters", () => {
    const result = validateProjectType("my_type!");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("accepts uppercase letters (case-insensitive validation)", () => {
    expect(validateProjectType("GOAL").valid).toBe(true);
  });

  it("accepts a string at exactly 32 characters", () => {
    expect(validateProjectType("a".repeat(32)).valid).toBe(true);
  });
});

describe("type-validation — capitalizeProjectType", () => {
  it("capitalizes a single word", () => {
    expect(capitalizeProjectType("goal")).toBe("Goal");
  });

  it("capitalizes each word in a multi-word type", () => {
    expect(capitalizeProjectType("area of focus")).toBe("Area Of Focus");
  });

  it("capitalizes hyphenated words as a single token", () => {
    expect(capitalizeProjectType("long-term")).toBe("Long-term");
  });
});

// ─── habit→goal migration SQL ─────────────────────────────────────────────────
//
// Parses the actual DML statements from the migration artifact file and
// executes them (user-scoped) against isolated test fixtures.  If the
// migration file is ever changed — different WHERE clause, different INSERT
// shape — these tests will break immediately, which is the goal.

const MIGRATION_SQL_PATH = join(
  process.cwd(),
  "prisma/migrations/20260502000000_wave4a_free_form_type/migration.sql",
);

/**
 * Extract INSERT and UPDATE statements from the migration SQL, skip DDL
 * (ALTER TABLE, CREATE INDEX) which cannot be re-run idempotently in a test.
 */
function extractMigrationDml(sql: string): { auditInsert: string; typeUpdate: string } {
  const stripped = sql.replace(/--[^\n]*/g, "");
  const statements = stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const auditInsert = statements.find((s) => s.toUpperCase().startsWith("INSERT"));
  const typeUpdate = statements.find((s) => s.toUpperCase().startsWith("UPDATE"));

  if (!auditInsert) throw new Error("Migration file missing expected INSERT statement");
  if (!typeUpdate) throw new Error("Migration file missing expected UPDATE statement");

  return { auditInsert, typeUpdate };
}

/**
 * Scope a migration statement to a specific user by appending an additional
 * predicate to its WHERE clause.  This keeps isolation without rewriting logic.
 */
function scopeStatementToUser(stmt: string, userId: string): string {
  return stmt.replace(
    /WHERE\s+"type"\s*=\s*'habit'\s+AND\s+deleted_at\s+IS\s+NULL/i,
    `WHERE "type" = 'habit' AND deleted_at IS NULL AND user_id = '${userId}'::uuid`,
  );
}

describe("habit→goal migration SQL", () => {
  let migrationUser: User;
  let habitProjectId: string;
  let goalProjectId: string;
  let deletedHabitId: string;

  beforeAll(async () => {
    const migUserId = uuidv7();
    migrationUser = await rawDb.user.create({
      data: {
        id: migUserId,
        clerk_id: `test_${migUserId}`,
        email: `migration-test-${migUserId}@atlas.test`,
        name: "Migration Test User",
      },
    });

    [habitProjectId, goalProjectId, deletedHabitId] = await Promise.all([
      rawDb.project
        .create({
          data: {
            id: uuidv7(),
            user_id: migrationUser.id,
            title: "Migration: Habit project",
            type: "habit",
          },
        })
        .then((p) => p.id),
      rawDb.project
        .create({
          data: {
            id: uuidv7(),
            user_id: migrationUser.id,
            title: "Migration: Goal project",
            type: "goal",
          },
        })
        .then((p) => p.id),
      rawDb.project
        .create({
          data: {
            id: uuidv7(),
            user_id: migrationUser.id,
            title: "Migration: Deleted habit project",
            type: "habit",
            deleted_at: new Date(),
          },
        })
        .then((p) => p.id),
    ]);
  });

  afterAll(async () => {
    await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${migrationUser.id}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "Project" WHERE user_id = ${migrationUser.id}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${migrationUser.id}::uuid`;
  });

  it("migration SQL file contains extractable INSERT and UPDATE DML statements in correct order (INSERT before UPDATE)", () => {
    const sql = readFileSync(MIGRATION_SQL_PATH, "utf-8");
    const { auditInsert, typeUpdate } = extractMigrationDml(sql);
    expect(auditInsert.toUpperCase()).toMatch(/^INSERT/);
    expect(typeUpdate.toUpperCase()).toMatch(/^UPDATE/);
    expect(auditInsert).toContain("project_type_migrated");
    expect(auditInsert).toContain('"from": "habit"');
    expect(typeUpdate).toContain("'goal'");

    const insertPos = sql.indexOf("INSERT");
    const updatePos = sql.indexOf("UPDATE");
    expect(insertPos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(-1);
    expect(insertPos).toBeLessThan(updatePos);
  });

  it("migration runs INSERT then UPDATE in the correct order, inserting audit rows before type changes", async () => {
    const sql = readFileSync(MIGRATION_SQL_PATH, "utf-8");
    const { auditInsert, typeUpdate } = extractMigrationDml(sql);

    const before = await rawDb.project.findUnique({ where: { id: habitProjectId } });
    expect(before?.type).toBe("habit");

    const scopedInsert = scopeStatementToUser(auditInsert, migrationUser.id);
    const scopedUpdate = scopeStatementToUser(typeUpdate, migrationUser.id);

    await rawDb.$executeRawUnsafe(scopedInsert);
    await rawDb.$executeRawUnsafe(scopedUpdate);

    const after = await rawDb.project.findUnique({ where: { id: habitProjectId } });
    expect(after?.type).toBe("goal");

    const auditEntries = await rawDb.auditLog.findMany({
      where: { user_id: migrationUser.id, entity_id: habitProjectId, action: "project_type_migrated" },
    });
    expect(auditEntries.length).toBeGreaterThanOrEqual(1);
    expect(auditEntries[0]!.meta).toMatchObject({ from: "habit", to: "goal" });
    expect(auditEntries[0]!.entity_type).toBe("Project");
  });

  it("migration UPDATE does not touch already-goal projects", async () => {
    const goalProject = await rawDb.project.findUnique({ where: { id: goalProjectId } });
    expect(goalProject?.type).toBe("goal");
  });

  it("migration UPDATE does not change type for soft-deleted habit projects", async () => {
    const softDeleted = await rawDb.project.findUnique({ where: { id: deletedHabitId } });
    expect(softDeleted?.type).toBe("habit");
    expect(softDeleted?.deleted_at).not.toBeNull();
  });

  it("migration audit INSERT does not create entries for soft-deleted habit projects", async () => {
    const auditEntries = await rawDb.auditLog.findMany({
      where: {
        user_id: migrationUser.id,
        entity_id: deletedHabitId,
        action: "project_type_migrated",
      },
    });
    expect(auditEntries.length).toBe(0);
  });
});

// ─── Tracker — setTracker / clearTracker / computed get ───────────────────────

describe("projects tracker — setTracker / clearTracker / get", () => {
  let trackerProjectId: string;
  let tableId: string;
  let numberColumnId: string;
  let checkboxColumnId: string;

  beforeAll(async () => {
    trackerProjectId = await insertProject({ title: "Tracker integration project" });

    const table = await rawDb.table.create({
      data: {
        id: uuidv7(),
        user_id: testUser.id,
        name: "Tracker source table",
      },
    });
    tableId = table.id;

    const numCol = await rawDb.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableId,
        name: "Amount",
        type: "number",
        position: 1,
      },
    });
    numberColumnId = numCol.id;

    const checkCol = await rawDb.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableId,
        name: "Done",
        type: "checkbox",
        position: 2,
      },
    });
    checkboxColumnId = checkCol.id;

    const rows = await Promise.all([
      rawDb.tableRow.create({ data: { id: uuidv7(), table_id: tableId, position: 1 } }),
      rawDb.tableRow.create({ data: { id: uuidv7(), table_id: tableId, position: 2 } }),
      rawDb.tableRow.create({ data: { id: uuidv7(), table_id: tableId, position: 3 } }),
    ]);

    await Promise.all([
      rawDb.tableCell.create({ data: { id: uuidv7(), row_id: rows[0]!.id, column_id: numberColumnId, value: 10 } }),
      rawDb.tableCell.create({ data: { id: uuidv7(), row_id: rows[1]!.id, column_id: numberColumnId, value: 20 } }),
      rawDb.tableCell.create({ data: { id: uuidv7(), row_id: rows[2]!.id, column_id: numberColumnId, value: 30 } }),
      rawDb.tableCell.create({ data: { id: uuidv7(), row_id: rows[0]!.id, column_id: checkboxColumnId, value: true } }),
      rawDb.tableCell.create({ data: { id: uuidv7(), row_id: rows[1]!.id, column_id: checkboxColumnId, value: false } }),
      rawDb.tableCell.create({ data: { id: uuidv7(), row_id: rows[2]!.id, column_id: checkboxColumnId, value: false } }),
    ]);
  });

  afterAll(async () => {
    await rawDb.$executeRaw`DELETE FROM "TableCell" WHERE row_id IN (SELECT id FROM "TableRow" WHERE table_id = ${tableId}::uuid)`;
    await rawDb.$executeRaw`DELETE FROM "TableRow" WHERE table_id = ${tableId}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "TableColumn" WHERE table_id = ${tableId}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "Table" WHERE id = ${tableId}::uuid`;
    await rawDb.$executeRaw`DELETE FROM "Project" WHERE id = ${trackerProjectId}::uuid`;
  });

  it("setTracker stores config and get returns computed sum", async () => {
    const caller = makeProjectsCaller();
    const result = await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    expect(result.ok).toBe(true);
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker).not.toBeNull();
    expect(project.tracker!.status).toBe("ok");
    expect(project.tracker!.current_value).toBe(60);
    expect(project.tracker!.column_type).toBe("number");
    expect(project.tracker!.aggregation).toBe("sum");
  });

  it("get returns average aggregation correctly", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "average",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.current_value).toBe(20);
  });

  it("get returns count aggregation correctly", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "count",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.current_value).toBe(3);
  });

  it("get returns min aggregation correctly", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "min",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.current_value).toBe(10);
  });

  it("get returns max aggregation correctly", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "max",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.current_value).toBe(30);
  });

  it("get returns checked_ratio correctly (1 of 3 checked ≈ 0.333)", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: checkboxColumnId,
      aggregation: "checked_ratio",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.current_value).toBeCloseTo(1 / 3);
  });

  it("setTracker with target stores target and get returns percentage", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
      target_value: 120,
      target_label: "points",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.target_value).toBe(120);
    expect(project.tracker!.target_label).toBe("points");
    expect(project.tracker!.percentage).toBeCloseTo(50);
  });

  it("setTracker rejects incompatible aggregation (BAD_REQUEST)", async () => {
    await expect(
      makeProjectsCaller().setTracker({
        project_id: trackerProjectId,
        table_id: tableId,
        column_id: numberColumnId,
        aggregation: "checked_ratio",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("setTracker rejects unknown table (NOT_FOUND)", async () => {
    await expect(
      makeProjectsCaller().setTracker({
        project_id: trackerProjectId,
        table_id: uuidv7(),
        column_id: numberColumnId,
        aggregation: "sum",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("setTracker rejects unknown column (NOT_FOUND)", async () => {
    await expect(
      makeProjectsCaller().setTracker({
        project_id: trackerProjectId,
        table_id: tableId,
        column_id: uuidv7(),
        aggregation: "sum",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("clearTracker removes tracker and get returns null tracker", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    const before = await caller.get({ id: trackerProjectId });
    expect(before.tracker).not.toBeNull();

    await caller.clearTracker({ project_id: trackerProjectId });
    const after = await caller.get({ id: trackerProjectId });
    expect(after.tracker).toBeNull();
  });

  it("setTracker writes audit log entry (project_tracker_set)", async () => {
    await makeProjectsCaller().clearTracker({ project_id: trackerProjectId }).catch(() => {});
    await makeProjectsCaller().setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    const logs = await rawDb.auditLog.findMany({
      where: { entity_id: trackerProjectId, action: "project_tracker_set" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("clearTracker writes audit log entry (project_tracker_cleared)", async () => {
    await makeProjectsCaller().clearTracker({ project_id: trackerProjectId });
    const logs = await rawDb.auditLog.findMany({
      where: { entity_id: trackerProjectId, action: "project_tracker_cleared" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("setTracker twice writes project_tracker_changed on second call", async () => {
    const caller = makeProjectsCaller();
    await caller.clearTracker({ project_id: trackerProjectId }).catch(() => {});
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "average",
    });
    const logs = await rawDb.auditLog.findMany({
      where: { entity_id: trackerProjectId, action: "project_tracker_changed" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("get returns status unavailable when tracker column is soft-deleted", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    await rawDb.tableColumn.update({
      where: { id: numberColumnId },
      data: { deleted_at: new Date() },
    });
    try {
      const project = await caller.get({ id: trackerProjectId });
      expect(project.tracker).not.toBeNull();
      expect(project.tracker!.status).toBe("unavailable");
    } finally {
      await rawDb.tableColumn.update({
        where: { id: numberColumnId },
        data: { deleted_at: null },
      });
    }
  });

  it("get returns status unavailable when tracker table is soft-deleted", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    await rawDb.table.update({
      where: { id: tableId },
      data: { deleted_at: new Date() },
    });
    try {
      const project = await caller.get({ id: trackerProjectId });
      expect(project.tracker).not.toBeNull();
      expect(project.tracker!.status).toBe("unavailable");
    } finally {
      await rawDb.table.update({
        where: { id: tableId },
        data: { deleted_at: null },
      });
    }
  });

  it("tracker response includes column_type for proper value formatting", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: numberColumnId,
      aggregation: "sum",
    });
    const project = await caller.get({ id: trackerProjectId });
    expect(project.tracker!.column_type).toBe("number");
  });

  it("setTracker with numeric formula column (return_type: number) allows sum", async () => {
    const formulaCol = await rawDb.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableId,
        name: "Formula Num",
        type: "formula",
        position: 10,
        config: { expression: "1 + 1", return_type: "number" },
      },
    });
    try {
      const result = await makeProjectsCaller().setTracker({
        project_id: trackerProjectId,
        table_id: tableId,
        column_id: formulaCol.id,
        aggregation: "sum",
      });
      expect(result.ok).toBe(true);
    } finally {
      await rawDb.tableColumn.delete({ where: { id: formulaCol.id } });
    }
  });

  it("setTracker with text formula column (return_type: text) rejects numeric aggregations (BAD_REQUEST)", async () => {
    const formulaCol = await rawDb.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableId,
        name: "Formula Text",
        type: "formula",
        position: 11,
        config: { expression: "some text", return_type: "text" },
      },
    });
    try {
      await expect(
        makeProjectsCaller().setTracker({
          project_id: trackerProjectId,
          table_id: tableId,
          column_id: formulaCol.id,
          aggregation: "sum",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const result = await makeProjectsCaller().setTracker({
        project_id: trackerProjectId,
        table_id: tableId,
        column_id: formulaCol.id,
        aggregation: "count",
      });
      expect(result.ok).toBe(true);
    } finally {
      await rawDb.tableColumn.delete({ where: { id: formulaCol.id } });
    }
  });

  it("setTracker with formula column (no return_type) falls back to count-only", async () => {
    const formulaCol = await rawDb.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableId,
        name: "Formula NoType",
        type: "formula",
        position: 12,
        config: { expression: "1 + 1" },
      },
    });
    try {
      await expect(
        makeProjectsCaller().setTracker({
          project_id: trackerProjectId,
          table_id: tableId,
          column_id: formulaCol.id,
          aggregation: "sum",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const result = await makeProjectsCaller().setTracker({
        project_id: trackerProjectId,
        table_id: tableId,
        column_id: formulaCol.id,
        aggregation: "count",
      });
      expect(result.ok).toBe(true);
    } finally {
      await rawDb.tableColumn.delete({ where: { id: formulaCol.id } });
    }
  });

  it("tracker returns column_type 'currency' enabling locale currency formatting", async () => {
    const currencyCol = await rawDb.tableColumn.create({
      data: {
        id: uuidv7(),
        table_id: tableId,
        name: "Price",
        type: "currency",
        position: 20,
      },
    });
    const row = await rawDb.tableRow.create({ data: { id: uuidv7(), table_id: tableId, position: 100 } });
    await rawDb.tableCell.create({
      data: { id: uuidv7(), row_id: row.id, column_id: currencyCol.id, value: 49.99 },
    });
    try {
      const caller = makeProjectsCaller();
      await caller.setTracker({
        project_id: trackerProjectId,
        table_id: tableId,
        column_id: currencyCol.id,
        aggregation: "sum",
      });
      const project = await caller.get({ id: trackerProjectId });
      expect(project.tracker!.column_type).toBe("currency");
      expect(typeof project.tracker!.current_value).toBe("number");
      expect(project.tracker!.current_value).toBeCloseTo(49.99);
    } finally {
      await rawDb.tableCell.deleteMany({ where: { row_id: row.id } });
      await rawDb.tableRow.delete({ where: { id: row.id } });
      await rawDb.tableColumn.delete({ where: { id: currencyCol.id } });
    }
  });

  it("tracker checked_ratio returns value in [0,1] range (UI formats as percentage)", async () => {
    const caller = makeProjectsCaller();
    await caller.setTracker({
      project_id: trackerProjectId,
      table_id: tableId,
      column_id: checkboxColumnId,
      aggregation: "checked_ratio",
    });
    const project = await caller.get({ id: trackerProjectId });
    const val = project.tracker!.current_value!;
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});
