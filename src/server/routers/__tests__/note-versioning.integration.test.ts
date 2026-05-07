import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidv7 } from "uuidv7";
import type { User } from "@prisma/client";
import { createSnapshot } from "@/core/notes/versioning";
import { notesRouter } from "@/server/routers/notes";

function resolveDbUrl(): string {
  return (process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? "").replace(/^'+|'+$/g, "");
}

const rawDb = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let testUser: User;
let testUser2: User;

async function insertNote(userId: string): Promise<string> {
  const note = await rawDb.note.create({
    data: {
      id: uuidv7(),
      user_id: userId,
      title: "Test Note",
      body_json: "{}",
      body_text: "",
      body_markdown: "",
    },
  });
  return note.id;
}

const testBody = {
  body_json: '{"type":"doc","content":[{"type":"paragraph"}]}',
  body_text: "hello world",
  body_markdown: "hello world",
};

const updatedBody = {
  body_json:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"updated"}]}]}',
  body_text: "updated",
  body_markdown: "updated",
};

beforeAll(async () => {
  const userId1 = uuidv7();
  const userId2 = uuidv7();
  [testUser, testUser2] = await Promise.all([
    rawDb.user.create({
      data: {
        id: userId1,
        clerk_id: `test_version_${userId1}`,
        email: `note-version-${userId1}@atlas.test`,
        name: "Version Test User 1",
      },
    }),
    rawDb.user.create({
      data: {
        id: userId2,
        clerk_id: `test_version_${userId2}`,
        email: `note-version-${userId2}@atlas.test`,
        name: "Version Test User 2",
      },
    }),
  ]);
});

afterAll(async () => {
  for (const user of [testUser, testUser2]) {
    const notes = await rawDb.note.findMany({ where: { user_id: user.id } });
    const noteIds = notes.map((n) => n.id);
    if (noteIds.length > 0) {
      await rawDb.noteVersion.deleteMany({ where: { note_id: { in: noteIds } } });
    }
    await rawDb.$executeRaw`DELETE FROM "AuditLog" WHERE user_id = ${user.id}::uuid`;
    await rawDb.note.deleteMany({ where: { user_id: user.id } });
    await rawDb.user.delete({ where: { id: user.id } });
  }
  await rawDb.$disconnect();
});

describe("Note versioning — auto-snapshot debounce", () => {
  it("creates a new version on first snapshot", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);

    const versions = await rawDb.noteVersion.findMany({ where: { note_id: noteId } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version_number).toBe(1);
    expect(versions[0]!.body_text).toBe("hello world");
  });

  it("overwrites the version (debounce) if same user within 5 minutes", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);
    await createSnapshot(noteId, testUser.id, updatedBody);

    const versions = await rawDb.noteVersion.findMany({ where: { note_id: noteId } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.body_text).toBe("updated");
    expect(versions[0]!.version_number).toBe(1);
  });

  it("creates a new version if a different user saves within 5 minutes", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);
    await createSnapshot(noteId, testUser2.id, updatedBody);

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]!.version_number).toBe(1);
    expect(versions[1]!.version_number).toBe(2);
  });

  it("creates a new version when the debounce window has expired (>5 minutes)", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);

    const first = await rawDb.noteVersion.findFirst({ where: { note_id: noteId } });
    expect(first).not.toBeNull();

    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    await rawDb.noteVersion.update({
      where: { id: first!.id },
      data: { created_at: sixMinutesAgo },
    });

    await createSnapshot(noteId, testUser.id, updatedBody);

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]!.version_number).toBe(1);
    expect(versions[1]!.version_number).toBe(2);
    expect(versions[1]!.body_text).toBe("updated");
  });
});

describe("Note versioning — manual snapshot", () => {
  it("always creates a new version when manual=true (even within debounce window, with summary)", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);
    await createSnapshot(noteId, testUser.id, updatedBody, {
      manual: true,
      changeSummary: "My manual snapshot",
    });

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]!.change_summary).toBe("My manual snapshot");
    expect(versions[1]!.version_number).toBe(2);
  });

  it("always creates a new version when manual=true even with no summary (within debounce window)", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);
    await createSnapshot(noteId, testUser.id, updatedBody, { manual: true });

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]!.change_summary).toBeNull();
    expect(versions[1]!.version_number).toBe(2);
  });
});

describe("Note versioning — retention cap", () => {
  it("deletes the oldest non-anchor version when count exceeds 50", async () => {
    const noteId = await insertNote(testUser.id);

    await createSnapshot(noteId, testUser.id, testBody, {
      manual: true,
      changeSummary: "anchor v1",
    });

    for (let i = 2; i <= 50; i++) {
      await createSnapshot(
        noteId,
        testUser.id,
        { ...testBody, body_text: `v${i}` },
        { manual: true, changeSummary: `snapshot ${i}` },
      );
    }

    let count = await rawDb.noteVersion.count({ where: { note_id: noteId } });
    expect(count).toBe(50);

    await createSnapshot(
      noteId,
      testUser.id,
      { ...testBody, body_text: "v51" },
      { manual: true, changeSummary: "snapshot 51" },
    );

    count = await rawDb.noteVersion.count({ where: { note_id: noteId } });
    expect(count).toBe(50);

    const anchor = await rawDb.noteVersion.findFirst({
      where: { note_id: noteId, version_number: 1 },
    });
    expect(anchor).not.toBeNull();
  }, 60000);
});

describe("Note versioning — restore via tRPC", () => {
  it("creates a new version from the selected one and writes an audit log", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody, {
      manual: true,
      changeSummary: "v1 manual",
    });
    await createSnapshot(noteId, testUser.id, updatedBody, {
      manual: true,
      changeSummary: "v2 manual",
    });

    const caller = notesRouter.createCaller({ user: testUser });
    await caller.versions.restore({ noteId, versionNumber: 1 });

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions.length).toBe(3);
    expect(versions[2]!.body_text).toBe(testBody.body_text);
    expect(versions[2]!.change_summary).toContain("Restored from version 1");

    const auditLog = await rawDb.auditLog.findFirst({
      where: {
        entity_type: "Note",
        entity_id: noteId,
        action: "note_version_restored",
      },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog!.meta).toMatchObject({ restored_from_version: 1 });
  });
});

describe("Note versioning — saveSnapshot via tRPC", () => {
  it("always creates a new version even without a summary (within debounce window)", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);

    const caller = notesRouter.createCaller({ user: testUser });
    await caller.versions.saveSnapshot({ noteId });

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]!.version_number).toBe(2);
    expect(versions[1]!.change_summary).toBeNull();
  });

  it("stores the provided summary on manual save", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody);

    const caller = notesRouter.createCaller({ user: testUser });
    await caller.versions.saveSnapshot({ noteId, changeSummary: "Draft complete" });

    const versions = await rawDb.noteVersion.findMany({
      where: { note_id: noteId },
      orderBy: { version_number: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]!.change_summary).toBe("Draft complete");
  });
});

describe("Note versioning — list and get via tRPC", () => {
  it("list returns metadata only (no body_json in list items)", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody, { manual: true, changeSummary: "v1" });
    await createSnapshot(noteId, testUser.id, updatedBody, { manual: true, changeSummary: "v2" });

    const caller = notesRouter.createCaller({ user: testUser });
    const result = await caller.versions.list({ noteId });

    expect(result).toHaveLength(2);
    expect(result[0]!.version_number).toBe(2);
    expect(result[1]!.version_number).toBe(1);
    for (const v of result) {
      expect("body_json" in v).toBe(false);
    }
  });

  it("get returns the full body for a specific version", async () => {
    const noteId = await insertNote(testUser.id);
    await createSnapshot(noteId, testUser.id, testBody, { manual: true, changeSummary: "v1" });

    const caller = notesRouter.createCaller({ user: testUser });
    const result = await caller.versions.get({ noteId, versionNumber: 1 });

    expect(result.body_text).toBe(testBody.body_text);
    expect(result.body_json).toBe(testBody.body_json);
  });
});
