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
  testUser = await rawDb.user.create({
    data: {
      id: uuidv7(),
      email: `projects-integration-test-${uuidv7()}@atlas.test`,
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
    dtUser = await rawDb.user.create({
      data: {
        id: uuidv7(),
        email: `dt-isolated-${uuidv7()}@atlas.test`,
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
    const otherUser = await rawDb.user.create({
      data: {
        id: uuidv7(),
        email: `other-user-${uuidv7()}@atlas.test`,
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
    migrationUser = await rawDb.user.create({
      data: {
        id: uuidv7(),
        email: `migration-test-${uuidv7()}@atlas.test`,
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
    expect(auditEntries[0].meta).toMatchObject({ from: "habit", to: "goal" });
    expect(auditEntries[0].entity_type).toBe("Project");
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
