import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import type { User } from "@prisma/client";
import { taskTemplatesRouter } from "@/server/routers/task-templates";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(/^'+|'+$/g, "");
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let testUser: User;

function makeCaller() {
  return taskTemplatesRouter.createCaller({ user: testUser });
}

beforeAll(async () => {
  const userId = uuidv7();
  testUser = await rawDb.user.create({
    data: {
      id: userId,
      clerk_id: `test_templates_${userId}`,
      email: `templates-integration-${userId}@atlas.test`,
      name: "Templates Integration Test User",
    },
  });
});

afterAll(async () => {
  await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "ChecklistItem" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "Task" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "TagOnTaskTemplate" WHERE template_id IN (SELECT id FROM "TaskTemplate" WHERE user_id = ${testUser.id}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "ContextOnTaskTemplate" WHERE template_id IN (SELECT id FROM "TaskTemplate" WHERE user_id = ${testUser.id}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "TaskTemplateChecklistItem" WHERE template_id IN (SELECT id FROM "TaskTemplate" WHERE user_id = ${testUser.id}::uuid)`;
  await rawDb.$executeRaw`DELETE FROM "TaskTemplate" WHERE user_id = ${testUser.id}::uuid`;
  await rawDb.$executeRaw`DELETE FROM "User" WHERE id = ${testUser.id}::uuid`;
  await rawDb.$disconnect();
});

describe("taskTemplates.create", () => {
  it("creates a template with name and notes", async () => {
    const caller = makeCaller();
    const result = await caller.create({
      name: "Daily standup",
      notes: "What did I do yesterday?",
      flagged: false,
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Daily standup");
    expect(result!.notes).toBe("What did I do yesterday?");
    expect(result!.user_id).toBe(testUser.id);
  });

  it("creates a template with checklist items", async () => {
    const caller = makeCaller();
    const result = await caller.create({
      name: "Weekly review",
      checklist_items: [
        { title: "Review inbox" },
        { title: "Update task list" },
        { title: "Plan next week" },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.checklist_items).toHaveLength(3);
    expect(result!.checklist_items[0]?.title).toBe("Review inbox");
    expect(result!.checklist_items[2]?.title).toBe("Plan next week");
  });

  it("writes an audit log entry on creation", async () => {
    const caller = makeCaller();
    const result = await caller.create({ name: "Audit test template" });
    const audit = await rawDb.auditLog.findFirst({
      where: {
        user_id: testUser.id,
        entity_type: "TaskTemplate",
        entity_id: result!.id,
        action: "task_template_created",
      },
    });
    expect(audit).not.toBeNull();
    expect((audit!.meta as { name?: string }).name).toBe("Audit test template");
  });

  it("rejects unknown context_ids (FORBIDDEN)", async () => {
    const caller = makeCaller();
    await expect(
      caller.create({ name: "Bad context", context_ids: [uuidv7()] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects unknown tag_ids (FORBIDDEN)", async () => {
    const caller = makeCaller();
    await expect(caller.create({ name: "Bad tag", tag_ids: [uuidv7()] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("taskTemplates.list", () => {
  it("lists templates for the user", async () => {
    const caller = makeCaller();
    const result = await caller.list({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every((t) => t.user_id === testUser.id)).toBe(true);
  });

  it("returns top-N templates ordered by usage then name", async () => {
    const caller = makeCaller();
    const result = await caller.list({ topN: 1 });
    expect(result.length).toBeLessThanOrEqual(1);
  });
});

describe("taskTemplates.byId", () => {
  it("returns template by id", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "ById template" });
    const result = await caller.byId({ id: created!.id });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("ById template");
  });

  it("throws NOT_FOUND for unknown id", async () => {
    const caller = makeCaller();
    await expect(caller.byId({ id: uuidv7() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("taskTemplates.update", () => {
  it("updates template name", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "Old name" });
    const updated = await caller.update({ id: created!.id, name: "New name" });
    expect(updated!.name).toBe("New name");
  });

  it("replaces checklist items on update", async () => {
    const caller = makeCaller();
    const created = await caller.create({
      name: "Template with items",
      checklist_items: [{ title: "Item A" }, { title: "Item B" }],
    });
    const updated = await caller.update({
      id: created!.id,
      checklist_items: [{ title: "Item C" }],
    });
    expect(updated!.checklist_items).toHaveLength(1);
    expect(updated!.checklist_items[0]?.title).toBe("Item C");
  });

  it("rejects unknown context_ids on update (FORBIDDEN)", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "Update context security" });
    await expect(caller.update({ id: created!.id, context_ids: [uuidv7()] })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });

  it("rejects unknown tag_ids on update (FORBIDDEN)", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "Update tag security" });
    await expect(caller.update({ id: created!.id, tag_ids: [uuidv7()] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("taskTemplates.delete", () => {
  it("soft-deletes a template", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "To be deleted" });
    await caller.delete({ id: created!.id });

    const inDb = await rawDb.taskTemplate.findFirst({
      where: { id: created!.id },
    });
    expect(inDb?.deleted_at).not.toBeNull();
  });

  it("throws NOT_FOUND for already deleted template", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "Double delete" });
    await caller.delete({ id: created!.id });
    await expect(caller.delete({ id: created!.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("writes an audit log entry on delete", async () => {
    const caller = makeCaller();
    const created = await caller.create({ name: "Delete audit template" });
    await caller.delete({ id: created!.id });
    const audit = await rawDb.auditLog.findFirst({
      where: {
        user_id: testUser.id,
        entity_type: "TaskTemplate",
        entity_id: created!.id,
        action: "task_template_deleted",
      },
    });
    expect(audit).not.toBeNull();
  });
});

describe("taskTemplates.instantiate", () => {
  it("creates a task from a template", async () => {
    const caller = makeCaller();
    const template = await caller.create({
      name: "Instantiate me",
      notes: "Template notes",
      flagged: true,
      checklist_items: [{ title: "Step 1" }, { title: "Step 2" }],
    });

    const task = await caller.instantiate({ id: template!.id });
    expect(task.title).toBe("Instantiate me");
    expect(task.notes).toBe("Template notes");
    expect(task.flagged).toBe(true);
    expect(task.user_id).toBe(testUser.id);

    const checklistItems = await rawDb.checklistItem.findMany({
      where: { task_id: task.id },
    });
    expect(checklistItems).toHaveLength(2);

    const refreshed = await rawDb.taskTemplate.findFirst({
      where: { id: template!.id },
    });
    expect(refreshed!.usage_count).toBe(1);
  });

  it("respects title override", async () => {
    const caller = makeCaller();
    const template = await caller.create({ name: "Base template" });
    const task = await caller.instantiate({
      id: template!.id,
      overrides: { title: "Custom title" },
    });
    expect(task.title).toBe("Custom title");
  });

  it("throws NOT_FOUND for unknown template", async () => {
    const caller = makeCaller();
    await expect(caller.instantiate({ id: uuidv7() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("writes an audit log entry on instantiate", async () => {
    const caller = makeCaller();
    const template = await caller.create({ name: "Audit instantiate template" });
    const task = await caller.instantiate({ id: template!.id });
    const audit = await rawDb.auditLog.findFirst({
      where: {
        user_id: testUser.id,
        entity_type: "TaskTemplate",
        entity_id: template!.id,
        action: "task_template_used",
      },
    });
    expect(audit).not.toBeNull();
    expect((audit!.meta as { task_id?: string }).task_id).toBe(task.id);
  });

  it("rejects unknown context_ids override on instantiate (FORBIDDEN)", async () => {
    const caller = makeCaller();
    const template = await caller.create({ name: "Instantiate context security" });
    await expect(
      caller.instantiate({ id: template!.id, overrides: { context_ids: [uuidv7()] } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
