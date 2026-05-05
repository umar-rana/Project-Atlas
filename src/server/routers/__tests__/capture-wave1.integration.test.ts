import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import type { User } from "@prisma/client";
import { captureRouter } from "@/server/routers/capture";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(
    /^'+|'+$/g,
    "",
  );
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let testUser: User;

async function insertCapture(opts: {
  raw_text: string;
  state?: string;
  parser_proposal?: object | null;
}): Promise<string> {
  const capture = await rawDb.capture.create({
    data: {
      id: uuidv7(),
      user_id: testUser.id,
      raw_text: opts.raw_text,
      state: opts.state ?? "raw",
      parser_proposal: opts.parser_proposal ?? undefined,
    },
  });
  return capture.id;
}

function makeCaller() {
  return captureRouter.createCaller({ user: testUser });
}

beforeAll(async () => {
  const userId = uuidv7();
  testUser = await rawDb.user.create({
    data: {
      id: userId,
      clerk_id: `test_wave1_${userId}`,
      email: `wave1-integration-${userId}@atlas.test`,
      name: "Wave 1 Integration Test User",
    },
  });
});

afterAll(async () => {
  await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "TagOnTask" WHERE task_id IN (SELECT id FROM "Task" WHERE user_id = ${testUser.id}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "ContextOnTask" WHERE task_id IN (SELECT id FROM "Task" WHERE user_id = ${testUser.id}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "Task" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "Capture" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "Note" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${testUser.id}::uuid`;
  await rawDb.$disconnect();
});

// ─── Wave 1 schema column smoke test ─────────────────────────────────────────

describe("Wave 1 Capture schema columns", () => {
  it("can write and read back all Wave 1 Capture columns directly", async () => {
    const proposal = { title: "Buy groceries", tags: ["errands"] };
    const id = await insertCapture({
      raw_text: "Buy groceries",
      state: "proposed",
      parser_proposal: proposal,
    });

    const row = await rawDb.capture.findUniqueOrThrow({
      where: { id },
      select: {
        state: true,
        processed_at: true,
        processed_to_type: true,
        processed_to_id: true,
        migration_source: true,
        parser_proposal: true,
      },
    });

    expect(row.state).toBe("proposed");
    expect(row.processed_at).toBeNull();
    expect(row.processed_to_type).toBeNull();
    expect(row.processed_to_id).toBeNull();
    expect(row.migration_source).toBeNull();
    expect(row.parser_proposal).toMatchObject(proposal);
  });

  it("can write and read back all Wave 1 Task columns directly", async () => {
    const reviewDate = new Date("2026-06-01T00:00:00Z");
    const followUp = new Date("2026-05-20T00:00:00Z");
    const task = await rawDb.task.create({
      data: {
        id: uuidv7(),
        user_id: testUser.id,
        title: "Delegated task",
        is_someday: true,
        someday_review_date: reviewDate,
        delegated_to_text: "Alice",
        follow_up_date: followUp,
        migration_note: "imported from wave1",
      },
      select: {
        is_someday: true,
        someday_review_date: true,
        delegated_to_text: true,
        follow_up_date: true,
        migration_note: true,
      },
    });

    expect(task.is_someday).toBe(true);
    expect(task.someday_review_date?.toISOString()).toBe(reviewDate.toISOString());
    expect(task.delegated_to_text).toBe("Alice");
    expect(task.follow_up_date?.toISOString()).toBe(followUp.toISOString());
    expect(task.migration_note).toBe("imported from wave1");
  });
});

// ─── listInbox returns parser_proposal ───────────────────────────────────────

describe("capture.listInbox", () => {
  it("returns parser_proposal field in inbox items", async () => {
    const proposal = { title: "Schedule dentist", due_date: null, tags: ["health"] };
    await insertCapture({ raw_text: "Schedule dentist", parser_proposal: proposal });

    const result = await makeCaller().listInbox({ limit: 200 });

    const item = result.find((c: { raw_text: string }) => c.raw_text === "Schedule dentist");
    expect(item).toBeDefined();
    expect(item).toHaveProperty("parser_proposal");
    expect(item!.parser_proposal).toMatchObject(proposal);
  });

  it("returns state field for each inbox item", async () => {
    const result = await makeCaller().listInbox({ limit: 200 });
    for (const item of result as Array<{ state: string }>) {
      expect(["raw", "proposed"]).toContain(item.state);
    }
  });

  it("excludes already-processed captures from inbox", async () => {
    const processedId = uuidv7();
    await rawDb.capture.create({
      data: {
        id: processedId,
        user_id: testUser.id,
        raw_text: "Already processed capture",
        state: "processed",
        processed_at: new Date(),
        processed_to_type: "task",
        processed_to_id: processedId,
      },
    });

    const result = await makeCaller().listInbox({ limit: 200 });
    const found = result.find((c: { raw_text: string }) => c.raw_text === "Already processed capture");
    expect(found).toBeUndefined();
  });
});

// ─── Disposition mutations ─────────────────────────────────────────────────

describe("capture.processToTask", () => {
  it("creates a task and marks capture as processed with state=processed/processed_to_type=task", async () => {
    const captureId = await insertCapture({ raw_text: "Call the plumber" });

    const result = await makeCaller().processToTask({
      capture_id: captureId,
      title: "Call the plumber",
      flagged: false,
    });

    expect(result).toHaveProperty("taskId");

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_at: true, processed_to_type: true, processed_to_id: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_at).not.toBeNull();
    expect(capture.processed_to_type).toBe("task");
    expect(capture.processed_to_id).toBe(result.taskId);
  });
});

describe("capture.processToSomeday", () => {
  it("creates a someday task (is_someday=true) and marks capture processed", async () => {
    const captureId = await insertCapture({ raw_text: "Learn to play guitar" });

    const result = await makeCaller().processToSomeday({
      capture_id: captureId,
      title: "Learn to play guitar",
    });

    expect(result).toHaveProperty("taskId");

    const task = await rawDb.task.findUniqueOrThrow({
      where: { id: result.taskId },
      select: { is_someday: true, someday_review_date: true },
    });
    expect(task.is_someday).toBe(true);

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_to_type: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_to_type).toBe("someday");
  });

  it("stores someday_review_date when provided", async () => {
    const captureId = await insertCapture({ raw_text: "Write a novel someday" });
    const reviewDate = "2026-07-01T00:00:00.000Z";

    const result = await makeCaller().processToSomeday({
      capture_id: captureId,
      title: "Write a novel someday",
      someday_review_date: reviewDate,
    });

    const task = await rawDb.task.findUniqueOrThrow({
      where: { id: result.taskId },
      select: { someday_review_date: true },
    });
    expect(task.someday_review_date?.toISOString()).toBe(reviewDate);
  });
});

describe("capture.processToWaitingFor", () => {
  it("creates a task with delegated_to_text and follow_up_date", async () => {
    const captureId = await insertCapture({ raw_text: "Waiting for report from Bob" });
    const followUp = "2026-05-15T09:00:00.000Z";

    const result = await makeCaller().processToWaitingFor({
      capture_id: captureId,
      title: "Report from Bob",
      delegated_to_text: "Bob",
      follow_up_date: followUp,
    });

    expect(result).toHaveProperty("taskId");

    const task = await rawDb.task.findUniqueOrThrow({
      where: { id: result.taskId },
      select: { delegated_to_text: true, follow_up_date: true },
    });
    expect(task.delegated_to_text).toBe("Bob");
    expect(task.follow_up_date?.toISOString()).toBe(followUp);

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_to_type: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_to_type).toBe("waiting_for");
  });
});

describe("capture.processToTwoMinuteDone", () => {
  it("creates a completed task and marks capture processed with type=two_minute_done", async () => {
    const captureId = await insertCapture({ raw_text: "Reply to email" });

    const result = await makeCaller().processToTwoMinuteDone({
      capture_id: captureId,
      title: "Reply to email",
    });

    expect(result).toHaveProperty("taskId");

    const task = await rawDb.task.findUniqueOrThrow({
      where: { id: result.taskId },
      select: { status: true, completed_at: true },
    });
    expect(task.status).toBe("completed");
    expect(task.completed_at).not.toBeNull();

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_to_type: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_to_type).toBe("two_minute_done");
  });
});

describe("capture.processToTrash", () => {
  it("marks capture as processed with type=trashed and no processed_to_id", async () => {
    const captureId = await insertCapture({ raw_text: "Old spam note" });

    const result = await makeCaller().processToTrash({ capture_id: captureId });

    expect(result).toMatchObject({ ok: true });

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_to_type: true, processed_to_id: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_to_type).toBe("trashed");
    expect(capture.processed_to_id).toBeNull();
  });
});

describe("capture.processToNote", () => {
  it("creates a note and marks capture as processed with type=note", async () => {
    const captureId = await insertCapture({ raw_text: "Meeting notes from today" });

    const result = await makeCaller().processToNote({
      capture_id: captureId,
      title: "Meeting notes from today",
      purpose: "meeting_note",
    });

    expect(result).toHaveProperty("noteId");

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_at: true, processed_to_type: true, processed_to_id: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_at).not.toBeNull();
    expect(capture.processed_to_type).toBe("note");
    expect(capture.processed_to_id).toBe(result.noteId);
  });
});

describe("capture.processToProject", () => {
  it("creates a new project + task and marks capture as processed with type=project_task", async () => {
    const captureId = await insertCapture({ raw_text: "Launch new website redesign" });

    const result = await makeCaller().processToProject({
      capture_id: captureId,
      new_project_name: `Test Project ${uuidv7()}`,
      new_project_type: "project",
      target_type: "task",
      title: "Launch new website redesign",
    });

    expect(result).toHaveProperty("projectId");
    expect(result).toHaveProperty("entityId");

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { state: true, processed_at: true, processed_to_type: true, processed_to_id: true },
    });
    expect(capture.state).toBe("processed");
    expect(capture.processed_at).not.toBeNull();
    expect(capture.processed_to_type).toBe("project_task");
    expect(capture.processed_to_id).toBe(result.entityId);
  });

  it("creates a project note when target_type=note", async () => {
    const captureId = await insertCapture({ raw_text: "Project kickoff notes" });

    const result = await makeCaller().processToProject({
      capture_id: captureId,
      new_project_name: `Test Project Note ${uuidv7()}`,
      new_project_type: "project",
      target_type: "note",
      title: "Project kickoff notes",
    });

    const capture = await rawDb.capture.findUniqueOrThrow({
      where: { id: captureId },
      select: { processed_to_type: true },
    });
    expect(capture.processed_to_type).toBe("project_note");
  });
});

describe("disposition idempotency guard", () => {
  it("rejects a second disposition attempt on an already-processed capture", async () => {
    const captureId = await insertCapture({ raw_text: "Already done task" });

    await makeCaller().processToTrash({ capture_id: captureId });

    await expect(
      makeCaller().processToTrash({ capture_id: captureId }),
    ).rejects.toThrow();
  });
});
